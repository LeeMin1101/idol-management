const WorkPeriod = require('../models/WorkPeriod');
const ShiftSlot = require('../models/ShiftSlot');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('../services/auditLogService');

// Lấy thông tin tháng hiện tại theo giờ Việt Nam (UTC+7)
const getCurrentVietnamMonthMeta = () => {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = vnNow.getUTCFullYear();
  const monthIndex = vnNow.getUTCMonth();
  const monthNumber = monthIndex + 1;
  const code = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const name = `Tháng ${String(monthNumber).padStart(2, '0')}/${year}`;
  const startDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  return { code, name, startDate, endDate };
};

// Tự động khởi tạo kỳ tháng mới và đóng đăng ký các tháng đã qua
const ensureCurrentMonthWorkPeriod = async () => {
  const { code, name, startDate, endDate } = getCurrentVietnamMonthMeta();

  await WorkPeriod.updateMany(
    { endDate: { $lt: startDate }, registrationOpen: true },
    { $set: { registrationOpen: false } }
  );

  let currentPeriod = await WorkPeriod.findOne({ code });
  if (!currentPeriod) {
    const latestPeriod = await WorkPeriod.findOne().sort({ startDate: -1 });
    currentPeriod = await WorkPeriod.create({
      code,
      name,
      startDate,
      endDate,
      status: 'OPEN',
      registrationOpen: true,
      groupHourlyRate: latestPeriod?.groupHourlyRate ?? 50000,
      defaultMaxSlots: latestPeriod?.defaultMaxSlots ?? 8,
      maxGroupShiftsPerDay: latestPeriod?.maxGroupShiftsPerDay ?? 1,
      offWeekdays: latestPeriod?.offWeekdays ?? [],
    });
  }

  return currentPeriod;
};

exports.getPeriods = async (req, res, next) => {
  try {
    const currentPeriod = await ensureCurrentMonthWorkPeriod();
    const periods = await WorkPeriod.find().sort({ startDate: -1 }).lean();

    const enriched = periods.map((p) => ({
      ...p,
      isCurrentMonth: String(p._id) === String(currentPeriod._id),
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

exports.createPeriod = async (req, res, next) => {
  try {
    const period = await WorkPeriod.create(req.body);

    await recordAudit({
      actorUserId: req.user._id,
      action: 'CREATE_WORK_PERIOD',
      entityName: 'WorkPeriod',
      entityId: period._id,
      newValue: period.toObject(),
      reason: `Tạo kỳ làm việc ${period.name}`,
      req,
    });

    res.status(201).json({ success: true, message: 'Tạo kỳ làm việc thành công', data: period });
  } catch (err) {
    next(err);
  }
};

exports.updatePeriodConfig = async (req, res, next) => {
  try {
    const period = await WorkPeriod.findById(req.params.id);
    if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
    if (period.status === 'LOCKED') {
      throw new AppError('Kỳ làm việc đã khóa, vui lòng mở khóa trước khi chỉnh sửa cấu hình', 403);
    }

    const oldSnapshot = period.toObject();
    const allowedFields = [
      'name',
      'startDate',
      'endDate',
      'registrationOpen',
      'groupHourlyRate',
      'defaultMaxSlots',
      'maxGroupShiftsPerDay',
      'offWeekdays',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        period[field] = req.body[field];
      }
    });

    await period.save();

    await recordAudit({
      actorUserId: req.user._id,
      action: 'UPDATE_WORK_PERIOD_CONFIG',
      entityName: 'WorkPeriod',
      entityId: period._id,
      oldValue: oldSnapshot,
      newValue: period.toObject(),
      reason: 'Cập nhật cấu hình kỳ làm việc',
      req,
    });

    res.json({ success: true, message: 'Đã cập nhật cấu hình kỳ làm việc', data: period });
  } catch (err) {
    next(err);
  }
};

exports.lockPeriod = async (req, res, next) => {
  try {
    const period = await WorkPeriod.findByIdAndUpdate(
      req.params.id,
      { status: 'LOCKED', registrationOpen: false },
      { new: true }
    );
    if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

    await recordAudit({
      actorUserId: req.user._id,
      action: 'LOCK_WORK_PERIOD',
      entityName: 'WorkPeriod',
      entityId: period._id,
      newValue: { status: 'LOCKED', registrationOpen: false },
      reason: req.body?.reason || 'Khóa kỳ làm việc',
      req,
    });

    res.json({ success: true, message: 'Đã khóa kỳ làm việc', data: period });
  } catch (err) {
    next(err);
  }
};

exports.unlockPeriod = async (req, res, next) => {
  try {
    const period = await WorkPeriod.findByIdAndUpdate(
      req.params.id,
      { status: 'OPEN', registrationOpen: true },
      { new: true }
    );
    if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

    await recordAudit({
      actorUserId: req.user._id,
      action: 'UNLOCK_WORK_PERIOD',
      entityName: 'WorkPeriod',
      entityId: period._id,
      newValue: { status: 'OPEN', registrationOpen: true },
      reason: req.body?.reason || 'Mở khóa kỳ làm việc',
      req,
    });

    res.json({ success: true, message: 'Đã mở khóa kỳ làm việc', data: period });
  } catch (err) {
    next(err);
  }
};

exports.getShiftSlots = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    const slots = await ShiftSlot.find(filter).sort({ startTime: 1 }).lean();
    res.json({ success: true, data: slots });
  } catch (err) {
    next(err);
  }
};

exports.createShiftSlot = async (req, res, next) => {
  try {
    const slot = await ShiftSlot.create(req.body);
    res.status(201).json({ success: true, message: 'Tạo khung giờ ca thành công', data: slot });
  } catch (err) {
    next(err);
  }
};

exports.updateShiftSlot = async (req, res, next) => {
  try {
    const slot = await ShiftSlot.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!slot) throw new AppError('Không tìm thấy khung giờ ca', 404);
    res.json({ success: true, message: 'Cập nhật khung giờ ca thành công', data: slot });
  } catch (err) {
    next(err);
  }
};