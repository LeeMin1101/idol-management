const auditLogService = require('../services/auditLogService');

exports.getAuditLogs = async (req, res, next) => {
  try { res.json({ success: true, data: await auditLogService.searchAuditLogs(req.query) }); } catch (err) { next(err); }
};
