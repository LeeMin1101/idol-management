const KpiRule = require('../models/KpiRule');
const KpiResult = require('../models/KpiResult');
const Payroll = require('../models/Payroll');
const kpiEngineService = require('../services/kpiEngineService');
const reportComplaintService = require('../services/reportComplaintService');

exports.getKpiRules = async (req, res, next) => {
  try {
    const filter = req.query.workPeriodId ? { workPeriodId: req.query.workPeriodId } : {};
    res.json({ success: true, data: await KpiRule.find(filter).sort({ createdAt: -1 }).lean() });
  } catch (err) { next(err); }
};
exports.saveKpiRule = async (req, res, next) => {
  try { res.json({ success: true, message: 'Lưu quy tắc KPI thành công', data: await kpiEngineService.saveKpiRule(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.calculateKpi = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã tính toán KPI & bảng công', data: await kpiEngineService.calculatePeriodKpiAndPayroll(req.body.workPeriodId || req.query.workPeriodId) }); } catch (err) { next(err); }
};
exports.finalizeKpi = async (req, res, next) => {
  try {
    await kpiEngineService.finalizePeriodKpi(req.user._id, req.body.workPeriodId, req);
    res.json({ success: true, message: 'Đã chốt KPI tháng' });
  } catch (err) { next(err); }
};
exports.unlockKpi = async (req, res, next) => {
  try {
    await kpiEngineService.unlockPeriodKpi(req.user._id, req.body.workPeriodId, req.body.reason, req);
    res.json({ success: true, message: 'Đã mở khóa KPI kỳ' });
  } catch (err) { next(err); }
};
exports.getMyKpiSummary = async (req, res, next) => {
  try {
    const { workPeriodId } = req.query;
    const [metrics, kpiResults, payroll] = await Promise.all([
      kpiEngineService.aggregateIdolPeriodMetrics(workPeriodId, req.user._id),
      KpiResult.find({ workPeriodId, idolId: req.user._id }).lean(),
      Payroll.findOne({ workPeriodId, idolId: req.user._id }).lean(),
    ]);
    res.json({ success: true, data: { metrics, kpiResults, payroll } });
  } catch (err) { next(err); }
};
exports.getComplaints = async (req, res, next) => {
  try { res.json({ success: true, data: await reportComplaintService.listComplaints(req.user, req.query) }); } catch (err) { next(err); }
};
exports.createComplaint = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đã gửi khiếu nại', data: await reportComplaintService.createComplaint(req.user._id, req.body) }); } catch (err) { next(err); }
};
exports.resolveComplaint = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã xử lý khiếu nại', data: await reportComplaintService.resolveComplaint(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.getAdminDashboard = async (req, res, next) => {
  try { res.json({ success: true, data: await reportComplaintService.getAdminDashboardStats(req.query.workPeriodId) }); } catch (err) { next(err); }
};
exports.exportExcel = async (req, res, next) => {
  try {
    const { filename, buffer } = await reportComplaintService.exportPeriodExcelBuffer(req.query.workPeriodId);
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) { next(err); }
};
