const WorkPeriod = require('../models/WorkPeriod');
const ShiftSlot = require('../models/ShiftSlot');
const ShiftRegistration = require('../models/ShiftRegistration');
const ShiftChangeRequest = require('../models/ShiftChangeRequest');
const SoloLiveSchedule = require('../models/SoloLiveSchedule');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const normalizeDateUTC = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('Ngày không hợp lệ', 400);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

const getNextSlotNumber = async (workPeriodId, shiftSlotId, shiftDate) => {
  const existing = await ShiftRegistration.find({
    workPeriodId,
    shiftSlotId,
    shiftDate,
  })
    .select('slotNumber')
    .lean();

  if (existing.length === 0) return 1;
  const maxNum = existing.reduce((max, item) => Math.max(max, item.slotNumber || 0), 0);
  return maxNum + 1;
};

const resolveEditableWorkPeriod = async (shiftDate, workPeriodId = null) => {
  const period = workPeriodId
    ? await WorkPeriod.findById(workPeriodId)
    : await WorkPeriod.findOne({
        startDate: { $lte: shiftDate },
        endDate: { $gte: shiftDate },
      });

  if (!period) {
    throw new AppError('Không tìm thấy kỳ làm việc phù hợp', 404);
  }
  if (period.status === 'LOCKED') {
    throw new AppError('Kỳ làm việc này đã bị khóa, không thể chỉnh sửa lịch', 403);
  }
  return period;
};

// 1. Lấy dữ liệu bảng lịch ca nhóm
const getGroupShiftBoard = async ({ workPeriodId, startDate, endDate }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (startDate && endDate) {
    filter.shiftDate = {
      $gte: normalizeDateUTC(startDate),
      $lte: normalizeDateUTC(endDate),
    };
  }

  const [slots, registrations] = await Promise.all([
    ShiftSlot.find({ type: 'GROUP', isActive: { $ne: false } }).sort({ startTime: 1 }).lean(),
    ShiftRegistration.find(filter)
      .populate('idolId', 'name username idolCode avatar')
      .populate('shiftSlotId', 'name startTime endTime colorCode maxSlots')
      .populate('originalShiftSlotId', 'name colorCode')
      .sort({ shiftDate: 1, slotNumber: 1 })
      .lean(),
  ]);

  return { slots, registrations };
};

// 2. Idol tự đăng ký ca nhóm (Không giới hạn số ca/ngày, không chặn Chủ nhật, không chặn ngày cũ)
const registerGroupShift = async (idolId, { workPeriodId, shiftSlotId, shiftDate }, req) => {
  const normalizedDate = normalizeDateUTC(shiftDate);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  const slot = await ShiftSlot.findById(shiftSlotId);
  if (!slot || slot.type !== 'GROUP') {
    throw new AppError('Khung giờ ca không hợp lệ', 404);
  }

  const duplicate = await ShiftRegistration.findOne({
    workPeriodId: period._id,
    idolId,
    shiftSlotId,
    shiftDate: normalizedDate,
  });

  if (duplicate) {
    throw new AppError('Bạn đã đăng ký khung giờ ca này trong ngày rồi', 409);
  }

  const slotNumber = await getNextSlotNumber(period._id, slot._id, normalizedDate);

  const registration = await ShiftRegistration.create({
    workPeriodId: period._id,
    idolId,
    shiftSlotId: slot._id,
    shiftDate: normalizedDate,
    slotNumber,
    status: 'APPROVED',
    isHost: false,
  });

  await recordAudit({
    actorUserId: idolId,
    action: 'REGISTER_GROUP_SHIFT',
    entityName: 'ShiftRegistration',
    entityId: registration._id,
    newValue: registration.toObject(),
    reason: `Idol tự đăng ký ${slot.name} ngày ${normalizedDate.toISOString().slice(0, 10)}`,
    req,
  });

  return registration;
};

// 3. Idol đăng ký nhanh trọn cả tháng (Điền toàn bộ các thứ đã chọn trong tháng)
const registerFullMonth = async (idolId, { workPeriodId, shiftSlotId, weekdays = [0, 1, 2, 3, 4, 5, 6] }, req) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') {
    throw new AppError('Kỳ làm việc đã khóa, không thể đăng ký', 403);
  }

  const slot = await ShiftSlot.findById(shiftSlotId);
  if (!slot || slot.type !== 'GROUP') {
    throw new AppError('Khung giờ ca không hợp lệ', 404);
  }

  const start = normalizeDateUTC(period.startDate);
  const end = normalizeDateUTC(period.endDate);

  const existingRegs = await ShiftRegistration.find({
    workPeriodId: period._id,
    idolId,
    shiftSlotId: slot._id,
  })
    .select('shiftDate')
    .lean();

  const existingDateSet = new Set(
    existingRegs.map((r) => new Date(r.shiftDate).toISOString().slice(0, 10))
  );

  let registeredCount = 0;
  let skippedCount = 0;

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const currentDay = new Date(cursor);
    const weekday = currentDay.getUTCDay();
    const dateKey = currentDay.toISOString().slice(0, 10);

    if (!weekdays.includes(weekday) || existingDateSet.has(dateKey)) {
      skippedCount += 1;
      continue;
    }

    const slotNumber = await getNextSlotNumber(period._id, slot._id, currentDay);
    await ShiftRegistration.create({
      workPeriodId: period._id,
      idolId,
      shiftSlotId: slot._id,
      shiftDate: currentDay,
      slotNumber,
      status: 'APPROVED',
      isHost: false,
    });
    registeredCount += 1;
  }

  await recordAudit({
    actorUserId: idolId,
    action: 'REGISTER_FULL_MONTH_SHIFT',
    entityName: 'WorkPeriod',
    entityId: period._id,
    newValue: { shiftSlotId: slot._id, weekdays, registeredCount, skippedCount },
    reason: `Idol đăng ký hàng loạt cả tháng ${period.name} (${registeredCount} ngày)`,
    req,
  });

  return { registeredCount, skippedCount };
};

// 4. Idol tự hủy ca nhóm đã đăng ký (Cho phép hủy tự do bất kỳ lúc nào miễn chưa khóa kỳ)
const cancelGroupShift = async (idolId, registrationId, req) => {
  const reg = await ShiftRegistration.findById(registrationId);
  if (!reg) throw new AppError('Không tìm thấy ca đăng ký', 404);

  if (String(reg.idolId) !== String(idolId)) {
    throw new AppError('Bạn không có quyền hủy ca của Idol khác', 403);
  }

  await resolveEditableWorkPeriod(reg.shiftDate, reg.workPeriodId);

  const oldSnapshot = reg.toObject();
  await ShiftRegistration.deleteOne({ _id: reg._id });

  await recordAudit({
    actorUserId: idolId,
    action: 'CANCEL_GROUP_SHIFT',
    entityName: 'ShiftRegistration',
    entityId: reg._id,
    oldValue: oldSnapshot,
    reason: 'Idol tự hủy ca nhóm đã đăng ký',
    req,
  });

  return { deletedId: reg._id };
};

// 5. Admin phân công & chỉ định Host ca
const adminAssignShift = async (adminId, { workPeriodId, idolId, shiftSlotId, shiftDate, isHost = false }, req) => {
  const normalizedDate = normalizeDateUTC(shiftDate);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  const slot = await ShiftSlot.findById(shiftSlotId);
  if (!slot) throw new AppError('Không tìm thấy khung giờ ca', 404);

  const duplicate = await ShiftRegistration.findOne({
    workPeriodId: period._id,
    idolId,
    shiftSlotId,
    shiftDate: normalizedDate,
  });
  if (duplicate) {
    throw new AppError('Idol này đã có mặt trong khung giờ ca này rồi', 409);
  }

  if (isHost) {
    await ShiftRegistration.updateMany(
      { workPeriodId: period._id, shiftSlotId, shiftDate: normalizedDate, isHost: true },
      { $set: { isHost: false } }
    );
  }

  const slotNumber = await getNextSlotNumber(period._id, slot._id, normalizedDate);

  const reg = await ShiftRegistration.create({
    workPeriodId: period._id,
    idolId,
    shiftSlotId: slot._id,
    shiftDate: normalizedDate,
    slotNumber,
    status: 'APPROVED',
    isHost: Boolean(isHost),
  });

  await recordAudit({
    actorUserId: adminId,
    action: 'ADMIN_ASSIGN_SHIFT',
    entityName: 'ShiftRegistration',
    entityId: reg._id,
    newValue: reg.toObject(),
    reason: 'Admin phân công ca nhóm',
    req,
  });

  return reg;
};

// 6. Admin chuyển / gỡ quyền Host ca
const toggleShiftHost = async (adminId, registrationId, req) => {
  const reg = await ShiftRegistration.findById(registrationId);
  if (!reg) throw new AppError('Không tìm thấy lịch đăng ký ca', 404);
  await resolveEditableWorkPeriod(reg.shiftDate, reg.workPeriodId);

  const nextHostState = !reg.isHost;
  if (nextHostState) {
    await ShiftRegistration.updateMany(
      {
        workPeriodId: reg.workPeriodId,
        shiftSlotId: reg.shiftSlotId,
        shiftDate: reg.shiftDate,
        isHost: true,
      },
      { $set: { isHost: false } }
    );
  }

  reg.isHost = nextHostState;
  await reg.save();

  await recordAudit({
    actorUserId: adminId,
    action: 'TOGGLE_SHIFT_HOST',
    entityName: 'ShiftRegistration',
    entityId: reg._id,
    newValue: { isHost: nextHostState },
    reason: nextHostState ? 'Chỉ định làm Host ca' : 'Gỡ quyền Host ca',
    req,
  });

  return reg;
};

// 7. Admin xóa Idol khỏi ca
const adminRemoveShift = async (adminId, registrationId, req) => {
  const reg = await ShiftRegistration.findById(registrationId);
  if (!reg) throw new AppError('Không tìm thấy lịch đăng ký ca', 404);
  await resolveEditableWorkPeriod(reg.shiftDate, reg.workPeriodId);

  const oldSnapshot = reg.toObject();
  await ShiftRegistration.deleteOne({ _id: reg._id });

  await recordAudit({
    actorUserId: adminId,
    action: 'ADMIN_REMOVE_SHIFT',
    entityName: 'ShiftRegistration',
    entityId: reg._id,
    oldValue: oldSnapshot,
    reason: 'Admin xóa Idol khỏi ca nhóm',
    req,
  });

  return { deletedId: reg._id };
};

// 8. Admin đánh dấu vắng mặt (OFF)
const markShiftAbsent = async (adminId, registrationId, reason, req) => {
  const reg = await ShiftRegistration.findById(registrationId);
  if (!reg) throw new AppError('Không tìm thấy lịch đăng ký ca', 404);
  await resolveEditableWorkPeriod(reg.shiftDate, reg.workPeriodId);

  const oldSnapshot = reg.toObject();
  reg.status = 'ABSENT';
  reg.absentReason = reason || 'Vắng mặt không xuất hiện tại ca đã đăng ký';
  await reg.save();

  await User.findByIdAndUpdate(reg.idolId, { $inc: { violationCount: 1 } });

  await recordAudit({
    actorUserId: adminId,
    action: 'MARK_SHIFT_ABSENT',
    entityName: 'ShiftRegistration',
    entityId: reg._id,
    oldValue: oldSnapshot,
    newValue: reg.toObject(),
    reason: reg.absentReason,
    req,
  });

  return reg;
};

// 9. Quản lý yêu cầu đổi ca
const getShiftChangeRequests = async (user, { workPeriodId }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (user.role === 'IDOL') filter.requesterIdolId = user._id;

  return ShiftChangeRequest.find(filter)
    .populate('requesterIdolId', 'name username idolCode')
    .populate({
      path: 'currentRegistrationId',
      populate: { path: 'shiftSlotId', select: 'name startTime endTime colorCode' },
    })
    .populate('targetShiftSlotId', 'name startTime endTime colorCode')
    .sort({ createdAt: -1 })
    .lean();
};

const createShiftChangeRequest = async (
  idolId,
  { currentRegistrationId, targetShiftSlotId, targetDate, targetIdolId, reason },
  req
) => {
  const currentReg = await ShiftRegistration.findById(currentRegistrationId).populate('shiftSlotId');
  if (!currentReg) throw new AppError('Không tìm thấy ca hiện tại để đổi', 404);
  if (String(currentReg.idolId) !== String(idolId)) {
    throw new AppError('Bạn không thể yêu cầu đổi ca của Idol khác', 403);
  }

  const normalizedTargetDate = normalizeDateUTC(targetDate);
  await resolveEditableWorkPeriod(normalizedTargetDate, currentReg.workPeriodId);

  const request = await ShiftChangeRequest.create({
    workPeriodId: currentReg.workPeriodId,
    requesterIdolId: idolId,
    currentRegistrationId: currentReg._id,
    targetShiftSlotId,
    targetDate: normalizedTargetDate,
    targetIdolId: targetIdolId || null,
    reason,
    status: 'PENDING',
  });

  await recordAudit({
    actorUserId: idolId,
    action: 'CREATE_SHIFT_SWAP_REQUEST',
    entityName: 'ShiftChangeRequest',
    entityId: request._id,
    newValue: request.toObject(),
    reason,
    req,
  });

  return request;
};

const reviewShiftChangeRequest = async (adminId, requestId, { action, reviewNote }, req) => {
  const swapReq = await ShiftChangeRequest.findById(requestId);
  if (!swapReq) throw new AppError('Không tìm thấy yêu cầu đổi ca', 404);
  if (swapReq.status !== 'PENDING') {
    throw new AppError('Yêu cầu này đã được xử lý trước đó', 400);
  }

  const currentReg = await ShiftRegistration.findById(swapReq.currentRegistrationId).populate('shiftSlotId');
  if (!currentReg) throw new AppError('Không tìm thấy ca gốc của Idol', 404);

  await resolveEditableWorkPeriod(swapReq.targetDate, swapReq.workPeriodId);

  if (action === 'APPROVED') {
    const oldSnapshot = currentReg.toObject();
    const originalSlotId = currentReg.originalShiftSlotId || currentReg.shiftSlotId?._id || currentReg.shiftSlotId;
    const originalColor = currentReg.originalColorCode || currentReg.shiftSlotId?.colorCode || 'default';

    currentReg.originalShiftSlotId = originalSlotId;
    currentReg.originalColorCode = originalColor;
    currentReg.shiftSlotId = swapReq.targetShiftSlotId;
    currentReg.shiftDate = swapReq.targetDate;
    currentReg.isSwapped = true;
    currentReg.slotNumber = await getNextSlotNumber(
      currentReg.workPeriodId,
      swapReq.targetShiftSlotId,
      swapReq.targetDate
    );
    await currentReg.save();

    await recordAudit({
      actorUserId: adminId,
      action: 'APPROVE_SHIFT_SWAP',
      entityName: 'ShiftRegistration',
      entityId: currentReg._id,
      oldValue: oldSnapshot,
      newValue: currentReg.toObject(),
      reason: reviewNote || 'Duyệt đổi ca (bảo toàn màu ca gốc)',
      req,
    });
  }

  swapReq.status = action;
  swapReq.reviewedBy = adminId;
  swapReq.reviewedAt = new Date();
  swapReq.reviewNote = reviewNote || '';
  await swapReq.save();

  return swapReq;
};

// 10. Lịch LIVE đơn (Đăng ký thoải mái, không chặn quyền hoặc ngày cũ)
const getSoloSchedules = async (user, { workPeriodId }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (user.role === 'IDOL') filter.idolId = user._id;

  return SoloLiveSchedule.find(filter)
    .populate('idolId', 'name username idolCode')
    .sort({ scheduleDate: 1, plannedStartTime: 1 })
    .lean();
};

const registerSoloLive = async (idolId, { workPeriodId, scheduleDate, plannedStartTime, plannedEndTime }, req) => {
  const normalizedDate = normalizeDateUTC(scheduleDate);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  const start = new Date(plannedStartTime);
  const end = new Date(plannedEndTime);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
    throw new AppError('Giờ kết thúc phải lớn hơn giờ bắt đầu', 400);
  }

  const weekNumber = Math.ceil(normalizedDate.getUTCDate() / 7);

  const solo = await SoloLiveSchedule.create({
    workPeriodId: period._id,
    idolId,
    scheduleDate: normalizedDate,
    weekNumber,
    plannedStartTime: start,
    plannedEndTime: end,
    plannedDurationMinutes: durationMinutes,
    status: 'REGISTERED',
  });

  await recordAudit({
    actorUserId: idolId,
    action: 'REGISTER_SOLO_LIVE',
    entityName: 'SoloLiveSchedule',
    entityId: solo._id,
    newValue: solo.toObject(),
    reason: 'Idol đăng ký lịch LIVE đơn',
    req,
  });

  return solo;
};

module.exports = {
  getGroupShiftBoard,
  registerGroupShift,
  registerFullMonth,
  cancelGroupShift,
  adminAssignShift,
  toggleShiftHost,
  adminRemoveShift,
  markShiftAbsent,
  getShiftChangeRequests,
  createShiftChangeRequest,
  reviewShiftChangeRequest,
  getSoloSchedules,
  registerSoloLive,
};