const LiveSession = require('../models/LiveSession');
const ShiftRegistration = require('../models/ShiftRegistration');
const SoloLiveSchedule = require('../models/SoloLiveSchedule');
const WorkPeriod = require('../models/WorkPeriod');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const combineDateAndTime = (dateObj, timeStr, isEndNextDay = false) => {
  const [hours, minutes] = (timeStr || '00:00').split(':').map(Number);
  const d = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), hours, minutes, 0));
  if (isEndNextDay || (hours === 0 && minutes === 0)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

const getActiveSession = async (idolId) => {
  return LiveSession.findOne({ idolId, status: { $in: ['LIVE', 'WAITING_EVIDENCE'] } })
    .populate({ path: 'shiftRegistrationId', populate: { path: 'shiftSlotId', select: 'name startTime endTime colorCode' } })
    .populate('soloScheduleId')
    .lean();
};

const checkInLive = async (idolId, { liveType, shiftRegistrationId, soloScheduleId, tiktokLiveUrl }, req) => {
  if (!['GROUP', 'SOLO'].includes(liveType)) throw new AppError('Loại hình LIVE phải là GROUP hoặc SOLO', 400);

  const existingRunning = await LiveSession.findOne({ idolId, status: { $in: ['LIVE', 'WAITING_EVIDENCE'] } });
  if (existingRunning) {
    throw new AppError('Bạn đang có phiên LIVE chưa hoàn tất hoặc chưa nộp bằng chứng', 409);
  }

  const serverNow = new Date();
  let workPeriodId;
  let plannedStartTime;
  let plannedEndTime;
  let isHostSession = false;

  if (liveType === 'GROUP') {
    const reg = await ShiftRegistration.findById(shiftRegistrationId).populate('shiftSlotId');
    if (!reg || String(reg.idolId) !== String(idolId)) throw new AppError('Lịch ca nhóm không hợp lệ', 403);
    if (reg.liveSessionId) throw new AppError('Ca nhóm này đã check-in trước đó', 409);

    workPeriodId = reg.workPeriodId;
    plannedStartTime = combineDateAndTime(reg.shiftDate, reg.shiftSlotId.startTime, false);
    plannedEndTime = combineDateAndTime(reg.shiftDate, reg.shiftSlotId.endTime, reg.shiftSlotId.endTime < reg.shiftSlotId.startTime);
    isHostSession = Boolean(reg.isHost);
  } else {
    const solo = await SoloLiveSchedule.findById(soloScheduleId);
    if (!solo || String(solo.idolId) !== String(idolId)) throw new AppError('Lịch LIVE đơn không hợp lệ', 403);
    if (solo.liveSessionId) throw new AppError('Lịch LIVE đơn này đã có phiên LIVE', 409);

    workPeriodId = solo.workPeriodId;
    plannedStartTime = new Date(solo.plannedStartTime);
    plannedEndTime = new Date(solo.plannedEndTime);
  }

  const period = await WorkPeriod.findById(workPeriodId);
  if (!period || period.status === 'LOCKED') throw new AppError('Kỳ làm việc đã khóa', 403);

  const session = await LiveSession.create({
    workPeriodId,
    idolId,
    liveType,
    shiftRegistrationId: liveType === 'GROUP' ? shiftRegistrationId : null,
    soloScheduleId: liveType === 'SOLO' ? soloScheduleId : null,
    plannedStartTime,
    plannedEndTime,
    actualStartTime: serverNow,
    tiktokLiveUrl: (tiktokLiveUrl || '').trim(),
    isHostSession,
    status: 'LIVE',
  });

  if (liveType === 'GROUP') {
    await ShiftRegistration.findByIdAndUpdate(shiftRegistrationId, { liveSessionId: session._id });
  } else {
    await SoloLiveSchedule.findByIdAndUpdate(soloScheduleId, { liveSessionId: session._id });
  }

  await recordAudit({ actorUserId: idolId, action: 'LIVE_CHECK_IN', entityName: 'LiveSession', entityId: session._id, newValue: { liveType, actualStartTime: serverNow }, reason: 'Idol bắt đầu LIVE', req });
  return session;
};

const checkOutLive = async (idolId, sessionId, req) => {
  const session = await LiveSession.findById(sessionId);
  if (!session || String(session.idolId) !== String(idolId)) throw new AppError('Không tìm thấy phiên LIVE', 404);
  if (session.status !== 'LIVE') throw new AppError('Phiên LIVE không ở trạng thái đang phát sóng', 400);

  const serverNow = new Date();
  const durationMinutes = Math.max(0, Math.round((serverNow.getTime() - session.actualStartTime.getTime()) / 60000));

  session.actualEndTime = serverNow;
  session.actualDurationMinutes = durationMinutes;
  session.status = 'WAITING_EVIDENCE';
  await session.save();

  return session;
};

const uploadSessionEvidence = async (idolId, sessionId, { file, evidenceType }) => {
  if (!file) throw new AppError('Vui lòng đính kèm ảnh chụp báo cáo', 400);
  const session = await LiveSession.findById(sessionId);
  if (!session || String(session.idolId) !== String(idolId)) throw new AppError('Không tìm thấy phiên LIVE', 404);

  const imageUrl = '/uploads/evidences/' + file.filename;
  session.evidences.push({
    evidenceType: evidenceType || 'IDOL_STAT_SCREENSHOT',
    imageUrl,
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    fileSizeBytes: file.size,
  });

  if (session.shiftRegistrationId) {
    await ShiftRegistration.findByIdAndUpdate(session.shiftRegistrationId, { kpiImageUrl: imageUrl, kpiStatus: 'PENDING' });
  }

  await session.save();
  return session;
};

const submitSessionReport = async (idolId, sessionId, { reportedMinutes, totalViewers, peakConcurrentViewers, diamondsOrPoints, hostSummaryNote, imageUrl }, req) => {
  const session = await LiveSession.findById(sessionId);
  if (!session || String(session.idolId) !== String(idolId)) throw new AppError('Không tìm thấy phiên LIVE', 404);

  if (imageUrl && imageUrl.trim()) {
    session.evidences.push({ evidenceType: 'IDOL_STAT_SCREENSHOT', imageUrl: imageUrl.trim() });
  }
  if (session.evidences.length === 0) {
    throw new AppError('Bắt buộc đính kèm tối thiểu 1 ảnh bằng chứng trước khi gửi duyệt', 400);
  }
  if (session.isHostSession && (!hostSummaryNote || !hostSummaryNote.trim())) {
    throw new AppError('Host ca bắt buộc phải nhập báo cáo tổng kết ca', 400);
  }

  session.report = {
    reportedMinutes: Number(reportedMinutes) || session.actualDurationMinutes,
    totalViewers: Number(totalViewers) || 0,
    peakConcurrentViewers: Number(peakConcurrentViewers) || 0,
    diamondsOrPoints: Number(diamondsOrPoints) || 0,
    hostSummaryNote: (hostSummaryNote || '').trim(),
    submittedAt: new Date(),
  };
  session.status = 'PENDING_REVIEW';
  await session.save();

  if (session.shiftRegistrationId) {
    await ShiftRegistration.findByIdAndUpdate(session.shiftRegistrationId, {
      kpiImageUrl: session.evidences[session.evidences.length - 1].imageUrl,
      kpiStatus: 'PENDING',
    });
  }

  return session;
};

const reviewLiveSession = async (adminId, sessionId, { decision, approvedDurationMinutes, reason }, req) => {
  if (!['APPROVED', 'REJECTED', 'VIOLATION'].includes(decision)) throw new AppError('Quyết định duyệt không hợp lệ', 400);
  if (['REJECTED', 'VIOLATION'].includes(decision) && (!reason || !reason.trim())) {
    throw new AppError('Vui lòng nhập rõ lý do từ chối hoặc vi phạm', 400);
  }

  const session = await LiveSession.findById(sessionId);
  if (!session) throw new AppError('Không tìm thấy phiên LIVE', 404);

  const oldStatus = session.status;
  session.status = decision;
  session.reviewedBy = adminId;
  session.reviewedAt = new Date();
  session.rejectOrViolationReason = reason ? reason.trim() : '';

  if (decision === 'APPROVED') {
    const finalMinutes = approvedDurationMinutes !== undefined ? Number(approvedDurationMinutes) : session.actualDurationMinutes;
    if (session.liveType === 'SOLO' && finalMinutes < 60) {
      throw new AppError('Phiên LIVE đơn dưới 60 phút không đủ điều kiện duyệt hợp lệ', 400);
    }
    session.approvedDurationMinutes = finalMinutes;
  } else {
    session.approvedDurationMinutes = 0;
  }
  await session.save();

  if (session.shiftRegistrationId) {
    await ShiftRegistration.findByIdAndUpdate(session.shiftRegistrationId, {
      kpiStatus: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      kpiRejectReason: session.rejectOrViolationReason,
    });
  }
  if (decision === 'VIOLATION' && oldStatus !== 'VIOLATION') {
    await User.findByIdAndUpdate(session.idolId, { $inc: { violationCount: 1 } });
  }

  await recordAudit({ actorUserId: adminId, action: 'REVIEW_LIVE_' + decision, entityName: 'LiveSession', entityId: session._id, oldValue: { status: oldStatus }, newValue: { status: decision, approvedDurationMinutes: session.approvedDurationMinutes }, reason: session.rejectOrViolationReason || 'Duyệt hợp lệ', req });
  return session;
};

const adminAdjustSessionTime = async (adminId, sessionId, { actualStartTime, actualEndTime, reason }, req) => {
  if (!reason || !reason.trim()) throw new AppError('Bắt buộc nhập lý do chỉnh sửa giờ LIVE', 400);
  const session = await LiveSession.findById(sessionId);
  if (!session) throw new AppError('Không tìm thấy phiên LIVE', 404);

  const newStart = actualStartTime ? new Date(actualStartTime) : session.actualStartTime;
  const newEnd = actualEndTime ? new Date(actualEndTime) : session.actualEndTime;
  if (!newEnd || newEnd <= newStart) throw new AppError('Thời gian kết thúc phải lớn hơn bắt đầu', 400);

  session.actualStartTime = newStart;
  session.actualEndTime = newEnd;
  session.actualDurationMinutes = Math.round((newEnd.getTime() - newStart.getTime()) / 60000);
  if (session.status === 'INCOMPLETE' || session.status === 'LIVE') {
    session.status = session.evidences.length > 0 ? 'PENDING_REVIEW' : 'WAITING_EVIDENCE';
  }
  await session.save();

  await recordAudit({ actorUserId: adminId, action: 'ADMIN_ADJUST_LIVE_TIME', entityName: 'LiveSession', entityId: session._id, newValue: { actualStartTime: newStart, actualEndTime: newEnd }, reason: reason.trim(), req });
  return session;
};

const listLiveSessions = async (user, { workPeriodId, status, liveType }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (status) filter.status = status;
  if (liveType) filter.liveType = liveType;
  if (user.role === 'IDOL') filter.idolId = user._id;

  return LiveSession.find(filter)
    .populate('idolId', 'username name idolCode')
    .populate({ path: 'shiftRegistrationId', populate: { path: 'shiftSlotId', select: 'name startTime endTime colorCode' } })
    .populate('soloScheduleId')
    .sort({ actualStartTime: -1 })
    .lean();
};

const scanForgottenCheckOuts = async () => {
  const threshold = new Date(Date.now() - 60 * 60 * 1000);
  const overdueSessions = await LiveSession.find({ status: 'LIVE', plannedEndTime: { $lt: threshold } });
  for (const session of overdueSessions) {
    session.status = 'INCOMPLETE';
    await session.save();
    await Notification.create({
      recipientUserId: session.idolId,
      title: 'Phiên LIVE chưa được kết thúc (Quên Check-out)',
      message: 'Phiên LIVE của bạn đã quá giờ kết thúc ca nhưng chưa bấm Kết thúc. Liên hệ Vận hành để đối soát.',
      type: 'LIVE_SESSION',
      referenceId: session._id,
    });
  }
};

module.exports = {
  getActiveSession,
  checkInLive,
  checkOutLive,
  uploadSessionEvidence,
  submitSessionReport,
  reviewLiveSession,
  adminAdjustSessionTime,
  listLiveSessions,
  scanForgottenCheckOuts,
};
