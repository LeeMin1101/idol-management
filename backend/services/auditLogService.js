const AuditLog = require('../models/AuditLog');

const getClientIp = (req) => {
  if (!req) return 'SYSTEM';
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.ip || 'UNKNOWN';
};

const recordAudit = async ({ actorUserId, action, entityName, entityId, oldValue, newValue, reason, req }) => {
  await AuditLog.create({
    actorUserId,
    action,
    entityName,
    entityId: entityId || null,
    oldValue: oldValue || null,
    newValue: newValue || null,
    reason: reason || '',
    ipAddress: getClientIp(req),
  });
};

const searchAuditLogs = async ({ entityName, action, page = 1, limit = 20 }) => {
  const filter = {};
  if (entityName) filter.entityName = entityName;
  if (action) filter.action = action;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actorUserId', 'username name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
  };
};

module.exports = { recordAudit, searchAuditLogs };
