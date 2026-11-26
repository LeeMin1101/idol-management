const crypto = require('crypto');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const searchIdols = async ({ keyword, employmentStatus, canSoloLive, page = 1, limit = 20 }) => {
  const filter = { role: 'IDOL', deletedAt: null };
  if (keyword && keyword.trim()) {
    const regex = new RegExp(keyword.trim(), 'i');
    filter.$or = [{ name: regex }, { fullName: regex }, { idolCode: regex }, { username: regex }];
  }
  if (employmentStatus) filter.employmentStatus = employmentStatus;
  if (canSoloLive !== undefined && canSoloLive !== '') {
    filter.canSoloLive = canSoloLive === 'true' || canSoloLive === true;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({ ...item, exceedsViolationThreshold: (item.violationCount || 0) > 3 })),
    pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
  };
};

const createIdolAccount = async (adminId, payload, req) => {
  const { username, email, idolCode, name, stageName, fullName, phone, larkId, canSoloLive, joinedDate } = payload;
  const displayName = (name || stageName || '').trim();
  if (!username || !displayName) {
    throw new AppError('Vui lòng nhập đầy đủ tên đăng nhập và nghệ danh Idol', 400);
  }

  const activationToken = crypto.randomBytes(24).toString('hex');
  const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const idol = await User.create({
    username: username.trim(),
    email: email ? email.trim().toLowerCase() : undefined,
    role: 'IDOL',
    accountStatus: 'INVITED',
    activationToken,
    activationExpiresAt,
    idolCode: idolCode ? idolCode.trim().toUpperCase() : undefined,
    name: displayName,
    fullName: (fullName || displayName).trim(),
    phone: phone || '',
    larkId: larkId || '',
    canSoloLive: Boolean(canSoloLive),
    employmentStatus: 'ACTIVE',
    joinedDate: joinedDate || new Date(),
  });

  const result = idol.toObject();
  delete result.password;

  await recordAudit({
    actorUserId: adminId,
    action: 'CREATE_IDOL',
    entityName: 'User',
    entityId: idol._id,
    newValue: result,
    reason: 'Admin tạo hồ sơ Idol và lời mời kích hoạt tài khoản',
    req,
  });

  return result;
};

const updateIdolByAdmin = async (adminId, idolId, payload, req) => {
  const idol = await User.findOne({ _id: idolId, role: 'IDOL', deletedAt: null });
  if (!idol) throw new AppError('Không tìm thấy hồ sơ Idol', 404);

  const oldValue = idol.toObject();
  delete oldValue.password;

  if (payload.name || payload.stageName) idol.name = (payload.name || payload.stageName).trim();
  if (payload.fullName !== undefined) idol.fullName = payload.fullName.trim();
  if (payload.phone !== undefined) idol.phone = payload.phone.trim();
  if (payload.larkId !== undefined) idol.larkId = payload.larkId.trim();
  if (payload.canSoloLive !== undefined) idol.canSoloLive = Boolean(payload.canSoloLive);
  if (payload.employmentStatus) {
    idol.employmentStatus = payload.employmentStatus;
    if (payload.employmentStatus === 'RESIGNED') idol.accountStatus = 'LOCKED';
  }
  await idol.save();

  const result = idol.toObject();
  delete result.password;

  await recordAudit({
    actorUserId: adminId,
    action: 'UPDATE_IDOL',
    entityName: 'User',
    entityId: idol._id,
    oldValue,
    newValue: result,
    reason: payload.reason || 'Cập nhật hồ sơ Idol',
    req,
  });

  return result;
};

const updateIdolAccountStatus = async (adminId, idolId, { accountStatus, reason }, req) => {
  if (!['ACTIVE', 'LOCKED'].includes(accountStatus)) {
    throw new AppError('Trạng thái tài khoản chỉ chấp nhận ACTIVE hoặc LOCKED', 400);
  }
  if (!reason || !reason.trim()) throw new AppError('Vui lòng nhập lý do khóa/mở khóa tài khoản', 400);

  const idol = await User.findOne({ _id: idolId, role: 'IDOL', deletedAt: null });
  if (!idol) throw new AppError('Không tìm thấy Idol', 404);

  const oldStatus = idol.accountStatus;
  idol.accountStatus = accountStatus;
  await idol.save();

  await recordAudit({
    actorUserId: adminId,
    action: accountStatus === 'LOCKED' ? 'LOCK_ACCOUNT' : 'UNLOCK_ACCOUNT',
    entityName: 'User',
    entityId: idol._id,
    oldValue: { accountStatus: oldStatus },
    newValue: { accountStatus },
    reason: reason.trim(),
    req,
  });

  const result = idol.toObject();
  delete result.password;
  return result;
};

const reissueActivationInvite = async (adminId, idolId, req) => {
  const idol = await User.findOne({ _id: idolId, role: 'IDOL', deletedAt: null });
  if (!idol) throw new AppError('Không tìm thấy Idol', 404);
  if (idol.accountStatus !== 'INVITED') {
    throw new AppError('Tài khoản đã kích hoạt trước đó, không cần cấp lại lời mời', 400);
  }

  idol.activationToken = crypto.randomBytes(24).toString('hex');
  idol.activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await idol.save();

  const result = idol.toObject();
  delete result.password;
  return result;
};

const updateOwnIdolProfile = async (idolId, payload, req) => {
  const idol = await User.findById(idolId);
  if (payload.fullName) idol.fullName = payload.fullName.trim();
  if (payload.phone !== undefined) idol.phone = payload.phone.trim();
  if (payload.larkId !== undefined) idol.larkId = payload.larkId.trim();
  await idol.save();

  const result = idol.toObject();
  delete result.password;
  return result;
};

module.exports = {
  searchIdols,
  createIdolAccount,
  updateIdolByAdmin,
  updateIdolAccountStatus,
  reissueActivationInvite,
  updateOwnIdolProfile,
};
