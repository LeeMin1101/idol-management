const XLSX = require('xlsx');
const Complaint = require('../models/Complaint');
const LiveSession = require('../models/LiveSession');
const ShiftRegistration = require('../models/ShiftRegistration');
const User = require('../models/User');
const WorkPeriod = require('../models/WorkPeriod');
const Notification = require('../models/Notification');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');
const { calculatePeriodKpiAndPayroll } = require('./kpiEngineService');

const createComplaint = async (idolId, { workPeriodId, liveSessionId, kpiResultId, reason, proofImageUrl }) => {
  if (!reason || !reason.trim()) throw new AppError('Vui lòng nhập lý do khiếu nại', 400);
  return Complaint.create({
    workPeriodId,
    idolId,
    liveSessionId: liveSessionId || null,
    kpiResultId: kpiResultId || null,
    reason: reason.trim(),
    proofImageUrl: proofImageUrl || '',
    status: 'OPEN',
  });
};

const resolveComplaint = async (adminId, complaintId, { status, adminResponse }, req) => {
  if (!['RESOLVED', 'REJECTED'].includes(status)) throw new AppError('Trạng thái không hợp lệ', 400);
  if (!adminResponse || !adminResponse.trim()) throw new AppError('Vui lòng nhập phản hồi xử lý khiếu nại', 400);

  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new AppError('Không tìm thấy khiếu nại', 404);

  complaint.status = status;
  complaint.adminResponse = adminResponse.trim();
  complaint.resolvedBy = adminId;
  complaint.resolvedAt = new Date();
  await complaint.save();

  await Notification.create({
    recipientUserId: complaint.idolId,
    title: status === 'RESOLVED' ? 'Khiếu nại đã được giải quyết' : 'Khiếu nại bị từ chối',
    message: 'Phản hồi từ Vận hành: ' + complaint.adminResponse,
    type: 'COMPLAINT',
    referenceId: complaint._id,
  });

  await recordAudit({ actorUserId: adminId, action: 'COMPLAINT_' + status, entityName: 'Complaint', entityId: complaint._id, reason: complaint.adminResponse, req });
  return complaint;
};

const listComplaints = async (user, { workPeriodId, status }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (status) filter.status = status;
  if (user.role === 'IDOL') filter.idolId = user._id;

  return Complaint.find(filter).populate('idolId', 'username name idolCode').populate('liveSessionId').sort({ createdAt: -1 }).lean();
};

const getAdminDashboardStats = async (workPeriodId) => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const periodFilter = workPeriodId ? { workPeriodId } : {};

  const [totalIdols, activeIdols, todayGroupShifts, currentlyLiveCount, pendingReviewCount, incompleteSessionsCount, openComplaintsCount, approvedSessions] = await Promise.all([
    User.countDocuments({ role: 'IDOL', deletedAt: null }),
    User.countDocuments({ role: 'IDOL', employmentStatus: 'ACTIVE', deletedAt: null }),
    ShiftRegistration.countDocuments({ shiftDate: { $gte: todayStart, $lte: todayEnd }, status: 'APPROVED' }),
    LiveSession.countDocuments({ status: 'LIVE' }),
    LiveSession.countDocuments({ ...periodFilter, status: 'PENDING_REVIEW' }),
    LiveSession.countDocuments({ ...periodFilter, status: 'INCOMPLETE' }),
    Complaint.countDocuments({ ...periodFilter, status: 'OPEN' }),
    LiveSession.find({ ...periodFilter, status: 'APPROVED' }).select('approvedDurationMinutes').lean(),
  ]);

  const totalApprovedMinutes = approvedSessions.reduce((acc, s) => acc + (s.approvedDurationMinutes || 0), 0);
  return {
    totalIdols,
    activeIdols,
    todayGroupShifts,
    currentlyLiveCount,
    pendingReviewCount,
    incompleteSessionsCount,
    openComplaintsCount,
    totalApprovedHours: Math.round((totalApprovedMinutes / 60) * 100) / 100,
  };
};

const exportPeriodExcelBuffer = async (workPeriodId) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  const summary = await calculatePeriodKpiAndPayroll(workPeriodId);
  const rows = summary.map((item, idx) => ({
    STT: idx + 1,
    'Mã Idol': item.idol.idolCode || '',
    'Nghệ Danh': item.idol.name,
    'Số Ca Hoàn Thành': item.metrics.completedShiftsCount,
    'Số Ca Vắng (OFF)': item.metrics.absentShiftsCount,
    'Giờ LIVE Nhóm (h)': item.metrics.approvedGroupHours,
    'Đơn Giá Nhóm (VNĐ/h)': item.payroll.groupHourlyRateSnapshot,
    'Tiền LIVE Nhóm (VNĐ)': item.payroll.groupLiveAmount,
    'Giờ LIVE Đơn (h)': item.metrics.approvedSoloHours,
    'Thưởng LIVE Đơn (VNĐ)': item.payroll.soloBonusAmount,
    'Tổng Thực Nhận (VNĐ)': item.payroll.totalPayableAmount,
    'Số Lần Vi Phạm': item.idol.violationCount || 0,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TongHop_' + period.code);

  return {
    filename: 'BaoCao_KPI_Cong_' + period.code + '.xlsx',
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
  };
};

module.exports = { createComplaint, resolveComplaint, listComplaints, getAdminDashboardStats, exportPeriodExcelBuffer };
