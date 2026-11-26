const WorkPeriod = require('../models/WorkPeriod');
const ShiftSlot = require('../models/ShiftSlot');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const getAllPeriods = async () => WorkPeriod.find().populate('lockedBy', 'username name').sort({ startDate: -1 }).lean();

const createPeriod = async (adminId, payload, req) => {
  const { code, name, startDate, endDate, copyFromPeriodId, offWeekdays, groupHourlyRate, defaultMaxSlots, maxGroupShiftsPerDay, registrationOpen } = payload;
  if (!code || !name || !startDate || !endDate) {
    throw new AppError('Vui lòng nhập đầy đủ mã kỳ, tên kỳ, ngày bắt đầu và ngày kết thúc', 400);
  }

  let config = { offWeekdays: [0], groupHourlyRate: 50000, defaultMaxSlots: 8, maxGroupShiftsPerDay: 1 };
  if (copyFromPeriodId) {
    const source = await WorkPeriod.findById(copyFromPeriodId);
    if (!source) throw new AppError('Không tìm thấy kỳ nguồn', 404);
    config = {
      offWeekdays: source.offWeekdays,
      groupHourlyRate: source.groupHourlyRate,
      defaultMaxSlots: source.defaultMaxSlots,
      maxGroupShiftsPerDay: source.maxGroupShiftsPerDay,
    };
  }

  const period = await WorkPeriod.create({
    code: code.trim().toUpperCase(),
    name: name.trim(),
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    offWeekdays: offWeekdays ?? config.offWeekdays,
    groupHourlyRate: groupHourlyRate ?? config.groupHourlyRate,
    defaultMaxSlots: defaultMaxSlots ?? config.defaultMaxSlots,
    maxGroupShiftsPerDay: maxGroupShiftsPerDay ?? config.maxGroupShiftsPerDay,
    registrationOpen: registrationOpen !== undefined ? Boolean(registrationOpen) : true,
    status: 'OPEN',
  });

  await recordAudit({ actorUserId: adminId, action: 'CREATE_WORK_PERIOD', entityName: 'WorkPeriod', entityId: period._id, newValue: period.toObject(), reason: 'Tạo kỳ làm việc mới', req });
  return period;
};

const updatePeriodConfig = async (adminId, periodId, payload, req) => {
  const period = await WorkPeriod.findById(periodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') throw new AppError('Kỳ đã bị khóa, không thể chỉnh sửa', 403);

  const oldValue = period.toObject();
  if (payload.name) period.name = payload.name.trim();
  if (payload.offWeekdays) period.offWeekdays = payload.offWeekdays;
  if (payload.groupHourlyRate !== undefined) period.groupHourlyRate = Number(payload.groupHourlyRate);
  if (payload.defaultMaxSlots !== undefined) period.defaultMaxSlots = Number(payload.defaultMaxSlots);
  if (payload.maxGroupShiftsPerDay !== undefined) period.maxGroupShiftsPerDay = Number(payload.maxGroupShiftsPerDay);
  if (payload.registrationOpen !== undefined) period.registrationOpen = Boolean(payload.registrationOpen);
  await period.save();

  await recordAudit({ actorUserId: adminId, action: 'UPDATE_WORK_PERIOD_CONFIG', entityName: 'WorkPeriod', entityId: period._id, oldValue, newValue: period.toObject(), reason: payload.reason || 'Cập nhật cấu hình kỳ', req });
  return period;
};

const lockPeriod = async (adminId, periodId, reason, req) => {
  if (!reason || !reason.trim()) throw new AppError('Vui lòng nhập lý do khóa kỳ', 400);
  const period = await WorkPeriod.findById(periodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  period.status = 'LOCKED';
  period.registrationOpen = false;
  period.lockedBy = adminId;
  period.lockedAt = new Date();
  await period.save();

  await recordAudit({ actorUserId: adminId, action: 'LOCK_PERIOD', entityName: 'WorkPeriod', entityId: period._id, newValue: { status: 'LOCKED' }, reason: reason.trim(), req });
  return period;
};

const unlockPeriod = async (adminId, periodId, reason, req) => {
  if (!reason || !reason.trim()) throw new AppError('Vui lòng nhập lý do mở khóa kỳ', 400);
  const period = await WorkPeriod.findById(periodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  period.status = 'OPEN';
  period.lockedBy = null;
  period.lockedAt = null;
  await period.save();

  await recordAudit({ actorUserId: adminId, action: 'UNLOCK_PERIOD', entityName: 'WorkPeriod', entityId: period._id, newValue: { status: 'OPEN' }, reason: reason.trim(), req });
  return period;
};

const getShiftSlots = async () => ShiftSlot.find().sort({ startTime: 1 }).lean();

const createShiftSlot = async (adminId, payload, req) => {
  const slot = await ShiftSlot.create({
    name: payload.name.trim(),
    startTime: payload.startTime || '',
    endTime: payload.endTime || '',
    type: payload.type || 'GROUP',
    colorCode: payload.colorCode || 'blue',
    maxSlots: payload.maxSlots || 8,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  });
  return slot;
};

const updateShiftSlot = async (adminId, slotId, payload, req) => {
  const slot = await ShiftSlot.findById(slotId);
  if (!slot) throw new AppError('Không tìm thấy khung giờ ca', 404);
  Object.assign(slot, payload);
  await slot.save();
  return slot;
};

module.exports = { getAllPeriods, createPeriod, updatePeriodConfig, lockPeriod, unlockPeriod, getShiftSlots, createShiftSlot, updateShiftSlot };
