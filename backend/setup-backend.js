const fs = require('fs');
const path = require('path');

const dirs = [
  'middlewares',
  'models',
  'services',
  'controllers',
  'routes',
  path.join('uploads', 'evidences'),
];

for (const dir of dirs) {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
}

const files = {};

// ==================== 1. MIDDLEWARES ====================
files['middlewares/errorMiddleware.js'] = String.raw`class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi máy chủ nội bộ';

  if (err.code === 11000) {
    statusCode = 409;
    message = 'Dữ liệu đã tồn tại hoặc bạn đã đăng ký khung giờ này rồi';
  }
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = { AppError, errorHandler };
`;

files['middlewares/authMiddleware.js'] = String.raw`const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'idol_management_dev_secret_2026';

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
    }
    if (user.accountStatus === 'LOCKED') {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa. Liên hệ Vận hành.' });
    }
    if (user.role === 'IDOL' && user.employmentStatus === 'RESIGNED') {
      return res.status(403).json({ success: false, message: 'Nhân sự đã nghỉ việc.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập chức năng này' });
  }
  next();
};

module.exports = { protect, authorize };
`;

files['middlewares/uploadMiddleware.js'] = String.raw`const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AppError } = require('./errorMiddleware');

const uploadDir = path.join(__dirname, '..', 'uploads', 'evidences');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new AppError('Chỉ chấp nhận tệp hình ảnh định dạng JPG, PNG hoặc WEBP', 400), false);
  }
  cb(null, true);
};

const uploadEvidenceImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { uploadEvidenceImage };
`;

// ==================== 2. MODELS ====================
files['models/User.js'] = String.raw`const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true, default: '' },
    email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    role: { type: String, enum: ['ADMIN', 'IDOL'], default: 'IDOL', index: true },
    accountStatus: { type: String, enum: ['INVITED', 'ACTIVE', 'LOCKED'], default: 'ACTIVE', index: true },
    activationToken: { type: String, default: null, index: true },
    activationExpiresAt: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null, index: true },
    resetPasswordExpiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    idolCode: { type: String, unique: true, sparse: true, trim: true, uppercase: true },
    phone: { type: String, trim: true, default: '' },
    larkId: { type: String, trim: true, default: '' },
    canSoloLive: { type: Boolean, default: false },
    employmentStatus: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'RESIGNED'], default: 'ACTIVE' },
    violationCount: { type: Number, default: 0 },
    joinedDate: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
`;

files['models/ShiftSlot.js'] = String.raw`const mongoose = require('mongoose');

const shiftSlotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    type: { type: String, enum: ['GROUP', 'SOLO'], default: 'GROUP', index: true },
    colorCode: { type: String, default: 'blue' },
    maxSlots: { type: Number, default: 8 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShiftSlot', shiftSlotSchema);
`;

files['models/WorkPeriod.js'] = String.raw`const mongoose = require('mongoose');

const workPeriodSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    offWeekdays: { type: [Number], default: [0] },
    groupHourlyRate: { type: Number, default: 50000, min: 0 },
    defaultMaxSlots: { type: Number, default: 8, min: 1 },
    maxGroupShiftsPerDay: { type: Number, default: 1, min: 1 },
    registrationOpen: { type: Boolean, default: true },
    status: { type: String, enum: ['DRAFT', 'OPEN', 'LOCKED'], default: 'OPEN', index: true },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkPeriod', workPeriodSchema);
`;

files['models/ShiftRegistration.js'] = String.raw`const mongoose = require('mongoose');

const shiftRegistrationSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    shiftSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftSlot', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shiftDate: { type: Date, required: true, index: true },
    slotNumber: { type: Number, required: true },
    isHost: { type: Boolean, default: false },
    isSwapped: { type: Boolean, default: false },
    originalShiftSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftSlot', default: null },
    originalColorCode: { type: String, default: null },
    registrationType: {
      type: String,
      enum: ['SELF_REGISTERED', 'ADMIN_ASSIGNED', 'SWAPPED'],
      default: 'SELF_REGISTERED',
    },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'ABSENT', 'CANCELLED'], default: 'APPROVED', index: true },
    kpiImageUrl: { type: String, default: '' },
    kpiStatus: { type: String, enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NOT_SUBMITTED' },
    kpiRejectReason: { type: String, default: '' },
    liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },
  },
  { timestamps: true }
);

shiftRegistrationSchema.index(
  { workPeriodId: 1, shiftSlotId: 1, shiftDate: 1, idolId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] } } }
);

module.exports = mongoose.model('ShiftRegistration', shiftRegistrationSchema);
`;

files['models/ShiftChangeRequest.js'] = String.raw`const mongoose = require('mongoose');

const shiftChangeRequestSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true },
    requesterIdolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currentRegistrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftRegistration', required: true },
    targetShiftSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftSlot', required: true },
    targetDate: { type: Date, required: true },
    targetIdolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShiftChangeRequest', shiftChangeRequestSchema);
`;

files['models/SoloLiveSchedule.js'] = String.raw`const mongoose = require('mongoose');

const soloLiveScheduleSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekNumber: { type: Number, required: true, min: 1, max: 5 },
    scheduleDate: { type: Date, required: true, index: true },
    plannedStartTime: { type: Date, required: true },
    plannedEndTime: { type: Date, required: true },
    plannedDurationMinutes: {
      type: Number,
      required: true,
      min: [60, 'Mỗi phiên LIVE đơn phải kéo dài tối thiểu 60 phút'],
    },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'APPROVED', index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectReason: { type: String, default: '' },
    liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SoloLiveSchedule', soloLiveScheduleSchema);
`;

files['models/LiveSession.js'] = String.raw`const mongoose = require('mongoose');

const evidenceSubSchema = new mongoose.Schema(
  {
    evidenceType: {
      type: String,
      enum: ['IDOL_STAT_SCREENSHOT', 'HOST_SUMMARY_SCREENSHOT'],
      default: 'IDOL_STAT_SCREENSHOT',
    },
    imageUrl: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    fileSizeBytes: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const liveSessionSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveType: { type: String, enum: ['GROUP', 'SOLO'], required: true },
    shiftRegistrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftRegistration', default: null },
    soloScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SoloLiveSchedule', default: null },
    plannedStartTime: { type: Date, required: true },
    plannedEndTime: { type: Date, required: true },
    actualStartTime: { type: Date, required: true },
    actualEndTime: { type: Date, default: null },
    actualDurationMinutes: { type: Number, default: 0 },
    approvedDurationMinutes: { type: Number, default: 0 },
    tiktokLiveUrl: { type: String, trim: true, default: '' },
    isHostSession: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'LIVE', 'WAITING_EVIDENCE', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'VIOLATION', 'INCOMPLETE'],
      default: 'LIVE',
      index: true,
    },
    evidences: [evidenceSubSchema],
    report: {
      reportedMinutes: { type: Number, default: 0 },
      totalViewers: { type: Number, default: 0 },
      peakConcurrentViewers: { type: Number, default: 0 },
      diamondsOrPoints: { type: Number, default: 0 },
      hostSummaryNote: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectOrViolationReason: { type: String, default: '' },
  },
  { timestamps: true }
);

liveSessionSchema.index(
  { idolId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'LIVE' } }
);

module.exports = mongoose.model('LiveSession', liveSessionSchema);
`;

files['models/KpiRule.js'] = String.raw`const mongoose = require('mongoose');

const kpiRuleSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    metricType: {
      type: String,
      enum: ['TOTAL_HOURS', 'GROUP_HOURS', 'SOLO_HOURS', 'COMPLETED_SHIFTS', 'COMPLETION_RATE', 'CUSTOM'],
      required: true,
    },
    liveTypeScope: { type: String, enum: ['ALL', 'GROUP', 'SOLO'], default: 'ALL' },
    versionNumber: { type: Number, default: 1 },
    formulaExpression: { type: String, required: true },
    targetValue: { type: Number, default: 0 },
    weightPercent: { type: Number, default: null },
    passCondition: { type: String, default: '' },
    failCondition: { type: String, default: '' },
    roundingRule: { type: String, enum: ['NONE', 'FLOOR_MINUTE', 'ROUND_2_DECIMALS'], default: 'ROUND_2_DECIMALS' },
    soloBonusTiers: [{ minSoloHours: { type: Number, required: true }, bonusAmount: { type: Number, required: true } }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

kpiRuleSchema.index({ workPeriodId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('KpiRule', kpiRuleSchema);
`;

files['models/KpiResult.js'] = String.raw`const mongoose = require('mongoose');

const kpiResultSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kpiRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'KpiRule', required: true },
    ruleSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    totalApprovedMinutes: { type: Number, default: 0 },
    groupApprovedMinutes: { type: Number, default: 0 },
    soloApprovedMinutes: { type: Number, default: 0 },
    completedShiftsCount: { type: Number, default: 0 },
    absentShiftsCount: { type: Number, default: 0 },
    rejectedSessionsCount: { type: Number, default: 0 },
    missingReportCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    calculatedValue: { type: Number, default: 0 },
    isPassed: { type: Boolean, default: true },
    isFinalized: { type: Boolean, default: false },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

kpiResultSchema.index({ workPeriodId: 1, idolId: 1, kpiRuleId: 1 }, { unique: true });

module.exports = mongoose.model('KpiResult', kpiResultSchema);
`;

files['models/Payroll.js'] = String.raw`const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedGroupHours: { type: Number, default: 0 },
    groupHourlyRateSnapshot: { type: Number, default: 50000 },
    groupLiveAmount: { type: Number, default: 0 },
    approvedSoloHours: { type: Number, default: 0 },
    soloBonusAmount: { type: Number, default: 0 },
    deductionAmount: { type: Number, default: 0 },
    totalPayableAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['DRAFT', 'FINALIZED', 'PAID'], default: 'DRAFT' },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

payrollSchema.index({ workPeriodId: 1, idolId: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', payrollSchema);
`;

files['models/Complaint.js'] = String.raw`const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },
    kpiResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'KpiResult', default: null },
    reason: { type: String, required: true, trim: true },
    proofImageUrl: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'], default: 'OPEN', index: true },
    adminResponse: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
`;

files['models/Notification.js'] = String.raw`const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['SHIFT', 'SWAP', 'LIVE_SESSION', 'KPI', 'COMPLAINT', 'SYSTEM'], default: 'SYSTEM' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
`;

files['models/AuditLog.js'] = String.raw`const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    entityName: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
`;

// ==================== 3. SERVICES ====================
files['services/auditLogService.js'] = String.raw`const AuditLog = require('../models/AuditLog');

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
`;

files['services/authService.js'] = String.raw`const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'idol_management_dev_secret_2026';

const signToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const loginUser = async ({ username, password }) => {
  if (!username || !password) {
    throw new AppError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu', 400);
  }

  const user = await User.findOne({ username: username.trim(), deletedAt: null });
  if (!user) throw new AppError('Tên đăng nhập hoặc mật khẩu không chính xác', 401);
  if (user.accountStatus === 'INVITED' || !user.password) {
    throw new AppError('Tài khoản chưa kích hoạt. Vui lòng thiết lập mật khẩu qua link lời mời.', 403);
  }
  if (user.accountStatus === 'LOCKED') {
    throw new AppError('Tài khoản đã bị khóa. Vui lòng liên hệ bộ phận Vận hành.', 403);
  }
  if (user.role === 'IDOL' && user.employmentStatus === 'RESIGNED') {
    throw new AppError('Nhân sự đã nghỉ việc, không thể đăng nhập.', 403);
  }

  let isMatch = false;
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password);
  } else if (user.password === password) {
    isMatch = true;
    user.password = await bcrypt.hash(password, 12);
  }

  if (!isMatch) throw new AppError('Tên đăng nhập hoặc mật khẩu không chính xác', 401);

  user.lastLoginAt = new Date();
  await user.save();

  const safeUser = user.toObject();
  delete safeUser.password;
  const token = signToken(user);

  return { token, accessToken: token, user: safeUser };
};

const activateIdolAccount = async ({ token, newPassword }) => {
  if (!token || !newPassword || newPassword.length < 6) {
    throw new AppError('Token không hợp lệ hoặc mật khẩu phải từ 6 ký tự', 400);
  }
  const user = await User.findOne({ activationToken: token.trim(), deletedAt: null });
  if (!user || user.accountStatus !== 'INVITED') {
    throw new AppError('Liên kết kích hoạt không hợp lệ hoặc đã sử dụng', 400);
  }
  if (user.activationExpiresAt && user.activationExpiresAt < new Date()) {
    throw new AppError('Liên kết kích hoạt đã hết hạn', 400);
  }

  user.password = await bcrypt.hash(newPassword, 12);
  user.accountStatus = 'ACTIVE';
  user.activationToken = null;
  user.activationExpiresAt = null;
  await user.save();
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email: (email || '').trim().toLowerCase(), deletedAt: null });
  if (!user) throw new AppError('Không tìm thấy tài khoản gắn với email này', 404);
  if (user.accountStatus === 'LOCKED') throw new AppError('Tài khoản đang bị khóa', 403);

  const resetToken = crypto.randomBytes(24).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();
  return resetToken;
};

const resetPassword = async ({ token, newPassword }) => {
  if (!token || !newPassword || newPassword.length < 6) {
    throw new AppError('Token không hợp lệ hoặc mật khẩu phải từ 6 ký tự', 400);
  }
  const user = await User.findOne({ resetPasswordToken: token.trim(), deletedAt: null });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new AppError('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 400);
  }

  user.password = await bcrypt.hash(newPassword, 12);
  user.resetPasswordToken = null;
  user.resetPasswordExpiresAt = null;
  if (user.accountStatus === 'INVITED') user.accountStatus = 'ACTIVE';
  await user.save();
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    throw new AppError('Mật khẩu mới phải từ 6 ký tự trở lên', 400);
  }
  const user = await User.findById(userId);
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new AppError('Mật khẩu hiện tại không chính xác', 400);

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
};

module.exports = { loginUser, activateIdolAccount, forgotPassword, resetPassword, changePassword };
`;

files['services/idolService.js'] = String.raw`const crypto = require('crypto');
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
`;

files['services/workPeriodService.js'] = String.raw`const WorkPeriod = require('../models/WorkPeriod');
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
`;

files['services/shiftService.js'] = String.raw`const WorkPeriod = require('../models/WorkPeriod');
const ShiftSlot = require('../models/ShiftSlot');
const ShiftRegistration = require('../models/ShiftRegistration');
const ShiftChangeRequest = require('../models/ShiftChangeRequest');
const SoloLiveSchedule = require('../models/SoloLiveSchedule');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const normalizeDateUTC = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new AppError('Định dạng ngày không hợp lệ', 400);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const resolveEditableWorkPeriod = async (shiftDate, workPeriodId) => {
  const period = workPeriodId
    ? await WorkPeriod.findById(workPeriodId)
    : await WorkPeriod.findOne({ startDate: { $lte: shiftDate }, endDate: { $gte: shiftDate } });

  if (!period) throw new AppError('Ngày đăng ký không nằm trong kỳ làm việc nào được mở', 400);
  if (period.status === 'LOCKED') throw new AppError('Kỳ làm việc đã bị KHÓA, không thể thay đổi lịch', 403);
  return period;
};

const findNextAvailableSlotNumber = (activeRegs, maxSlots) => {
  const occupied = new Set(activeRegs.map((r) => r.slotNumber));
  for (let i = 1; i <= maxSlots; i += 1) {
    if (!occupied.has(i)) return i;
  }
  return null;
};

const getGroupShiftBoard = async ({ workPeriodId, startDate, endDate }) => {
  const filter = { status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] } };
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (startDate && endDate) {
    filter.shiftDate = { $gte: normalizeDateUTC(startDate), $lte: normalizeDateUTC(endDate) };
  }

  const [slots, registrations] = await Promise.all([
    ShiftSlot.find({ type: 'GROUP', isActive: true }).sort({ startTime: 1 }).lean(),
    ShiftRegistration.find(filter)
      .populate('idolId', 'username name idolCode')
      .populate('shiftSlotId', 'name startTime endTime colorCode maxSlots')
      .populate('originalShiftSlotId', 'name colorCode')
      .sort({ shiftDate: 1, slotNumber: 1 })
      .lean(),
  ]);

  return { slots, registrations };
};

const registerGroupShift = async (idolId, { shiftSlotId, shiftDate, workPeriodId }, req) => {
  const normalizedDate = normalizeDateUTC(shiftDate);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  if (!period.registrationOpen) throw new AppError('Cổng đăng ký ca của kỳ này hiện đang đóng', 403);
  if (period.offWeekdays.includes(normalizedDate.getUTCDay())) {
    throw new AppError('Ngày này là ngày nghỉ cố định theo cấu hình kỳ', 400);
  }

  const slot = await ShiftSlot.findById(shiftSlotId);
  if (!slot || slot.type !== 'GROUP' || !slot.isActive) {
    throw new AppError('Khung giờ ca nhóm không hợp lệ', 404);
  }

  const maxSlots = slot.maxSlots || period.defaultMaxSlots;
  const myDailyCount = await ShiftRegistration.countDocuments({
    workPeriodId: period._id,
    idolId,
    shiftDate: normalizedDate,
    status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] },
  });
  if (myDailyCount >= period.maxGroupShiftsPerDay) {
    throw new AppError('Bạn đã đạt giới hạn tối đa ' + period.maxGroupShiftsPerDay + ' ca nhóm trong ngày này', 400);
  }

  const existingRegs = await ShiftRegistration.find({
    workPeriodId: period._id,
    shiftSlotId: slot._id,
    shiftDate: normalizedDate,
    status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] },
  }).lean();

  const slotNumber = findNextAvailableSlotNumber(existingRegs, maxSlots);
  if (!slotNumber) throw new AppError('Ca này đã đủ ' + maxSlots + ' slot', 409);

  const registration = await ShiftRegistration.create({
    workPeriodId: period._id,
    shiftSlotId: slot._id,
    idolId,
    shiftDate: normalizedDate,
    slotNumber,
    registrationType: 'SELF_REGISTERED',
    status: 'APPROVED',
  });

  const totalAfterInsert = await ShiftRegistration.countDocuments({
    workPeriodId: period._id,
    shiftSlotId: slot._id,
    shiftDate: normalizedDate,
    status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] },
  });
  if (totalAfterInsert > maxSlots) {
    await ShiftRegistration.deleteOne({ _id: registration._id });
    throw new AppError('Slot cuối cùng vừa được người khác đăng ký trước', 409);
  }

  await recordAudit({ actorUserId: idolId, action: 'REGISTER_GROUP_SHIFT', entityName: 'ShiftRegistration', entityId: registration._id, newValue: registration.toObject(), reason: 'Idol đăng ký ca nhóm', req });
  return registration;
};

const adminAssignShift = async (adminId, { idolId, shiftSlotId, shiftDate, isHost, workPeriodId }, req) => {
  const normalizedDate = normalizeDateUTC(shiftDate);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  const [idol, slot] = await Promise.all([
    User.findOne({ _id: idolId, role: 'IDOL', deletedAt: null }),
    ShiftSlot.findById(shiftSlotId),
  ]);
  if (!idol) throw new AppError('Không tìm thấy Idol', 404);
  if (!slot || slot.type !== 'GROUP') throw new AppError('Khung giờ ca nhóm không hợp lệ', 404);

  const maxSlots = slot.maxSlots || period.defaultMaxSlots;
  const existingRegs = await ShiftRegistration.find({
    workPeriodId: period._id,
    shiftSlotId: slot._id,
    shiftDate: normalizedDate,
    status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] },
  }).lean();

  const slotNumber = findNextAvailableSlotNumber(existingRegs, maxSlots);
  if (!slotNumber) throw new AppError('Ca đã đầy slot', 409);

  if (isHost) {
    await ShiftRegistration.updateMany(
      { workPeriodId: period._id, shiftSlotId: slot._id, shiftDate: normalizedDate, isHost: true },
      { $set: { isHost: false } }
    );
  }

  const registration = await ShiftRegistration.create({
    workPeriodId: period._id,
    shiftSlotId: slot._id,
    idolId: idol._id,
    shiftDate: normalizedDate,
    slotNumber,
    isHost: Boolean(isHost),
    registrationType: 'ADMIN_ASSIGNED',
    status: 'APPROVED',
  });

  await recordAudit({ actorUserId: adminId, action: 'ADMIN_ASSIGN_SHIFT', entityName: 'ShiftRegistration', entityId: registration._id, newValue: registration.toObject(), reason: 'Admin phân công ca', req });
  return registration;
};

const markShiftAbsent = async (adminId, registrationId, reason, req) => {
  const reg = await ShiftRegistration.findById(registrationId).populate('idolId');
  if (!reg) throw new AppError('Không tìm thấy lịch ca', 404);
  await resolveEditableWorkPeriod(reg.shiftDate, reg.workPeriodId);

  const oldStatus = reg.status;
  reg.status = 'ABSENT';
  await reg.save();

  if (oldStatus !== 'ABSENT' && reg.idolId) {
    await User.findByIdAndUpdate(reg.idolId._id, { $inc: { violationCount: 1 } });
  }

  await recordAudit({ actorUserId: adminId, action: 'MARK_SHIFT_ABSENT', entityName: 'ShiftRegistration', entityId: reg._id, oldValue: { status: oldStatus }, newValue: { status: 'ABSENT' }, reason: reason || 'Vắng mặt không xuất hiện tại ca', req });
  return reg;
};

const createShiftChangeRequest = async (idolId, { currentRegistrationId, targetShiftSlotId, targetDate, targetIdolId, reason }, req) => {
  if (!reason || !reason.trim()) throw new AppError('Vui lòng nhập lý do đổi ca', 400);

  const currentReg = await ShiftRegistration.findById(currentRegistrationId).populate('shiftSlotId');
  if (!currentReg || String(currentReg.idolId) !== String(idolId)) {
    throw new AppError('Ca hiện tại không hợp lệ', 403);
  }

  const period = await resolveEditableWorkPeriod(currentReg.shiftDate, currentReg.workPeriodId);
  const normalizedTargetDate = normalizeDateUTC(targetDate || currentReg.shiftDate);
  const targetSlot = await ShiftSlot.findById(targetShiftSlotId);
  if (!targetSlot || targetSlot.type !== 'GROUP') throw new AppError('Ca muốn đổi sang không hợp lệ', 404);

  const changeReq = await ShiftChangeRequest.create({
    workPeriodId: period._id,
    requesterIdolId: idolId,
    currentRegistrationId: currentReg._id,
    targetShiftSlotId: targetSlot._id,
    targetDate: normalizedTargetDate,
    targetIdolId: targetIdolId || null,
    reason: reason.trim(),
    status: 'PENDING',
  });

  return changeReq;
};

const reviewShiftChangeRequest = async (adminId, requestId, { action, reviewNote }, req) => {
  if (!['APPROVED', 'REJECTED'].includes(action)) {
    throw new AppError('Hành động duyệt chỉ chấp nhận APPROVED hoặc REJECTED', 400);
  }
  const changeReq = await ShiftChangeRequest.findById(requestId);
  if (!changeReq || changeReq.status !== 'PENDING') throw new AppError('Yêu cầu đổi ca không hợp lệ', 400);

  const period = await resolveEditableWorkPeriod(changeReq.targetDate, changeReq.workPeriodId);
  const currentReg = await ShiftRegistration.findById(changeReq.currentRegistrationId).populate('shiftSlotId');
  const targetSlot = await ShiftSlot.findById(changeReq.targetShiftSlotId);

  if (action === 'REJECTED') {
    changeReq.status = 'REJECTED';
    changeReq.reviewedBy = adminId;
    changeReq.reviewedAt = new Date();
    changeReq.reviewNote = reviewNote || '';
    await changeReq.save();
    return changeReq;
  }

  const oldSnapshot = currentReg.toObject();
  const rootSlotId = currentReg.originalShiftSlotId || currentReg.shiftSlotId._id;
  const rootColorCode = currentReg.originalColorCode || currentReg.shiftSlotId.colorCode;

  if (changeReq.targetIdolId) {
    const partnerReg = await ShiftRegistration.findOne({
      workPeriodId: period._id,
      shiftSlotId: targetSlot._id,
      shiftDate: changeReq.targetDate,
      idolId: changeReq.targetIdolId,
      status: 'APPROVED',
    }).populate('shiftSlotId');

    if (!partnerReg) throw new AppError('Không tìm thấy ca của Idol đối ứng', 404);

    const partnerRootSlotId = partnerReg.originalShiftSlotId || partnerReg.shiftSlotId._id;
    const partnerRootColor = partnerReg.originalColorCode || partnerReg.shiftSlotId.colorCode;

    currentReg.shiftSlotId = targetSlot._id;
    currentReg.shiftDate = changeReq.targetDate;
    currentReg.isSwapped = true;
    currentReg.originalShiftSlotId = rootSlotId;
    currentReg.originalColorCode = rootColorCode;
    currentReg.registrationType = 'SWAPPED';

    partnerReg.shiftSlotId = oldSnapshot.shiftSlotId._id;
    partnerReg.shiftDate = oldSnapshot.shiftDate;
    partnerReg.isSwapped = true;
    partnerReg.originalShiftSlotId = partnerRootSlotId;
    partnerReg.originalColorCode = partnerRootColor;
    partnerReg.registrationType = 'SWAPPED';

    await Promise.all([currentReg.save(), partnerReg.save()]);
  } else {
    const targetRegs = await ShiftRegistration.find({
      workPeriodId: period._id,
      shiftSlotId: targetSlot._id,
      shiftDate: changeReq.targetDate,
      status: { $in: ['PENDING', 'APPROVED', 'ABSENT'] },
    }).lean();

    const maxSlots = targetSlot.maxSlots || period.defaultMaxSlots;
    const nextSlotNum = findNextAvailableSlotNumber(targetRegs, maxSlots);
    if (!nextSlotNum) throw new AppError('Ca đích đã đầy slot', 409);

    currentReg.shiftSlotId = targetSlot._id;
    currentReg.shiftDate = changeReq.targetDate;
    currentReg.slotNumber = nextSlotNum;
    currentReg.isSwapped = true;
    currentReg.originalShiftSlotId = rootSlotId;
    currentReg.originalColorCode = rootColorCode;
    currentReg.registrationType = 'SWAPPED';
    await currentReg.save();
  }

  changeReq.status = 'APPROVED';
  changeReq.reviewedBy = adminId;
  changeReq.reviewedAt = new Date();
  changeReq.reviewNote = reviewNote || '';
  await changeReq.save();

  await recordAudit({ actorUserId: adminId, action: 'APPROVE_SHIFT_SWAP', entityName: 'ShiftRegistration', entityId: currentReg._id, oldValue: oldSnapshot, newValue: currentReg.toObject(), reason: changeReq.reason, req });
  return changeReq;
};

const registerSoloLive = async (idolId, { weekNumber, scheduleDate, plannedStartTime, plannedEndTime, workPeriodId }, req) => {
  const idol = await User.findById(idolId);
  if (!idol || !idol.canSoloLive) {
    throw new AppError('Tài khoản của bạn chưa được Vận hành cấp quyền đăng ký LIVE đơn', 403);
  }

  const start = new Date(plannedStartTime);
  const end = new Date(plannedEndTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError('Thời gian bắt đầu và kết thúc LIVE đơn không hợp lệ', 400);
  }

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes < 60) {
    throw new AppError('Theo quy định, mỗi phiên LIVE đơn phải kéo dài tối thiểu 60 phút', 400);
  }

  const normalizedDate = normalizeDateUTC(scheduleDate || start);
  const period = await resolveEditableWorkPeriod(normalizedDate, workPeriodId);

  return SoloLiveSchedule.create({
    workPeriodId: period._id,
    idolId,
    weekNumber: Number(weekNumber) || Math.min(5, Math.ceil(normalizedDate.getUTCDate() / 7)),
    scheduleDate: normalizedDate,
    plannedStartTime: start,
    plannedEndTime: end,
    plannedDurationMinutes: durationMinutes,
    status: 'APPROVED',
  });
};

const getSoloSchedules = async (user, { workPeriodId, weekNumber }) => {
  const filter = { status: { $ne: 'CANCELLED' } };
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (weekNumber) filter.weekNumber = Number(weekNumber);
  if (user.role === 'IDOL') filter.idolId = user._id;

  return SoloLiveSchedule.find(filter).populate('idolId', 'username name idolCode').sort({ scheduleDate: 1 }).lean();
};

const getShiftChangeRequests = async (user, { workPeriodId, status }) => {
  const filter = {};
  if (workPeriodId) filter.workPeriodId = workPeriodId;
  if (status) filter.status = status;
  if (user.role === 'IDOL') filter.requesterIdolId = user._id;

  return ShiftChangeRequest.find(filter)
    .populate('requesterIdolId', 'username name idolCode')
    .populate('targetIdolId', 'username name idolCode')
    .populate('targetShiftSlotId', 'name startTime endTime colorCode')
    .populate({ path: 'currentRegistrationId', populate: { path: 'shiftSlotId', select: 'name startTime endTime colorCode' } })
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  getGroupShiftBoard,
  registerGroupShift,
  adminAssignShift,
  markShiftAbsent,
  createShiftChangeRequest,
  reviewShiftChangeRequest,
  registerSoloLive,
  getSoloSchedules,
  getShiftChangeRequests,
};
`;

files['services/liveSessionService.js'] = String.raw`const LiveSession = require('../models/LiveSession');
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
`;

files['services/kpiEngineService.js'] = String.raw`const KpiRule = require('../models/KpiRule');
const KpiResult = require('../models/KpiResult');
const Payroll = require('../models/Payroll');
const WorkPeriod = require('../models/WorkPeriod');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const ShiftRegistration = require('../models/ShiftRegistration');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const evaluateSafeFormula = (expression, variables) => {
  let parsed = String(expression);
  const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const regex = new RegExp('\\b' + key + '\\b', 'g');
    parsed = parsed.replace(regex, String(Number(variables[key]) || 0));
  }

  if (!/^[0-9+\-*/().\s]+$/.test(parsed)) {
    throw new AppError('Công thức KPI chứa ký tự hoặc biến không hợp lệ: ' + expression, 400);
  }

  const tokens = parsed.match(/\d+(\.\d+)?|[+\-*/()]/g) || [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const values = [];
  const ops = [];

  const applyOp = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (op === '+') values.push(a + b);
    else if (op === '-') values.push(a - b);
    else if (op === '*') values.push(a * b);
    else if (op === '/') values.push(b === 0 ? 0 : a / b);
  };

  for (const token of tokens) {
    if (!Number.isNaN(Number(token))) values.push(Number(token));
    else if (token === '(') ops.push(token);
    else if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') applyOp();
      ops.pop();
    } else if (precedence[token]) {
      while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) applyOp();
      ops.push(token);
    }
  }
  while (ops.length) applyOp();

  return Number.isFinite(values[0]) ? values[0] : 0;
};

const applyRounding = (value, roundingRule) => {
  if (roundingRule === 'FLOOR_MINUTE') return Math.floor(value);
  if (roundingRule === 'ROUND_2_DECIMALS') return Math.round(value * 100) / 100;
  return value;
};

const saveKpiRule = async (adminId, payload, req) => {
  const period = await WorkPeriod.findById(payload.workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') throw new AppError('Kỳ đã khóa, không thể chỉnh sửa quy tắc KPI', 403);

  const code = payload.code.trim().toUpperCase();
  const existing = await KpiRule.findOne({ workPeriodId: period._id, code });

  if (existing) {
    existing.name = payload.name.trim();
    existing.metricType = payload.metricType;
    existing.liveTypeScope = payload.liveTypeScope || 'ALL';
    existing.formulaExpression = payload.formulaExpression.trim();
    existing.targetValue = Number(payload.targetValue) || 0;
    existing.roundingRule = payload.roundingRule || 'ROUND_2_DECIMALS';
    existing.soloBonusTiers = payload.soloBonusTiers || [];
    existing.versionNumber += 1;
    await existing.save();
    return existing;
  }

  return KpiRule.create({
    workPeriodId: period._id,
    code,
    name: payload.name.trim(),
    metricType: payload.metricType,
    liveTypeScope: payload.liveTypeScope || 'ALL',
    formulaExpression: payload.formulaExpression.trim(),
    targetValue: Number(payload.targetValue) || 0,
    roundingRule: payload.roundingRule || 'ROUND_2_DECIMALS',
    soloBonusTiers: payload.soloBonusTiers || [],
    createdBy: adminId,
  });
};

const aggregateIdolPeriodMetrics = async (workPeriodId, idolId) => {
  const [sessions, registrations] = await Promise.all([
    LiveSession.find({ workPeriodId, idolId }).lean(),
    ShiftRegistration.find({ workPeriodId, idolId, status: { $ne: 'CANCELLED' } }).lean(),
  ]);

  let groupApprovedMinutes = 0;
  let soloApprovedMinutes = 0;
  let completedShiftsCount = 0;
  let rejectedSessionsCount = 0;
  let missingReportCount = 0;

  for (const s of sessions) {
    if (s.status === 'APPROVED') {
      if (s.liveType === 'GROUP') {
        groupApprovedMinutes += s.approvedDurationMinutes || 0;
        completedShiftsCount += 1;
      } else {
        soloApprovedMinutes += s.approvedDurationMinutes || 0;
      }
    } else if (['REJECTED', 'VIOLATION'].includes(s.status)) {
      rejectedSessionsCount += 1;
    } else if (['WAITING_EVIDENCE', 'INCOMPLETE'].includes(s.status)) {
      missingReportCount += 1;
    }
  }

  const absentShiftsCount = registrations.filter((r) => r.status === 'ABSENT').length;
  const totalApprovedMinutes = groupApprovedMinutes + soloApprovedMinutes;

  return {
    totalApprovedMinutes,
    groupApprovedMinutes,
    soloApprovedMinutes,
    approvedGroupHours: Math.round((groupApprovedMinutes / 60) * 100) / 100,
    approvedSoloHours: Math.round((soloApprovedMinutes / 60) * 100) / 100,
    totalApprovedHours: Math.round((totalApprovedMinutes / 60) * 100) / 100,
    completedShiftsCount,
    absentShiftsCount,
    rejectedSessionsCount,
    missingReportCount,
  };
};

const calculatePeriodKpiAndPayroll = async (workPeriodId) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  const [idols, rules] = await Promise.all([
    User.find({ role: 'IDOL', deletedAt: null }).lean(),
    KpiRule.find({ workPeriodId: period._id, isActive: true }).lean(),
  ]);

  const effectiveRules = rules.length > 0
    ? rules
    : [{ _id: null, code: 'DEFAULT', name: 'Tổng giờ LIVE', formulaExpression: 'totalApprovedHours', targetValue: 0, roundingRule: 'ROUND_2_DECIMALS', soloBonusTiers: [] }];

  const summary = [];

  for (const idol of idols) {
    const metrics = await aggregateIdolPeriodMetrics(period._id, idol._id);

    for (const rule of effectiveRules) {
      const rawValue = evaluateSafeFormula(rule.formulaExpression, { ...metrics, targetValue: rule.targetValue || 0 });
      const calculatedValue = applyRounding(rawValue, rule.roundingRule);
      const completionRate = rule.targetValue > 0 ? Math.round((metrics.totalApprovedHours / rule.targetValue) * 10000) / 100 : 100;

      if (rule._id) {
        const existingResult = await KpiResult.findOne({ workPeriodId: period._id, idolId: idol._id, kpiRuleId: rule._id });
        if (!existingResult || !existingResult.isFinalized) {
          await KpiResult.findOneAndUpdate(
            { workPeriodId: period._id, idolId: idol._id, kpiRuleId: rule._id },
            {
              ruleSnapshot: rule,
              totalApprovedMinutes: metrics.totalApprovedMinutes,
              groupApprovedMinutes: metrics.groupApprovedMinutes,
              soloApprovedMinutes: metrics.soloApprovedMinutes,
              completedShiftsCount: metrics.completedShiftsCount,
              absentShiftsCount: metrics.absentShiftsCount,
              rejectedSessionsCount: metrics.rejectedSessionsCount,
              missingReportCount: metrics.missingReportCount,
              completionRate,
              calculatedValue,
              isPassed: rule.targetValue > 0 ? metrics.totalApprovedHours >= rule.targetValue : true,
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    const groupLiveAmount = Math.round(metrics.approvedGroupHours * period.groupHourlyRate);
    let soloBonusAmount = 0;
    const ruleWithTiers = effectiveRules.find((r) => Array.isArray(r.soloBonusTiers) && r.soloBonusTiers.length > 0);
    if (ruleWithTiers) {
      const matched = ruleWithTiers.soloBonusTiers.filter((t) => metrics.approvedSoloHours >= t.minSoloHours).sort((a, b) => b.minSoloHours - a.minSoloHours);
      if (matched.length > 0) soloBonusAmount = matched[0].bonusAmount;
    }

    const existingPayroll = await Payroll.findOne({ workPeriodId: period._id, idolId: idol._id });
    if (!existingPayroll || existingPayroll.status === 'DRAFT') {
      const payroll = await Payroll.findOneAndUpdate(
        { workPeriodId: period._id, idolId: idol._id },
        {
          approvedGroupHours: metrics.approvedGroupHours,
          groupHourlyRateSnapshot: period.groupHourlyRate,
          groupLiveAmount,
          approvedSoloHours: metrics.approvedSoloHours,
          soloBonusAmount,
          totalPayableAmount: groupLiveAmount + soloBonusAmount,
        },
        { upsert: true, new: true }
      ).lean();
      summary.push({ idol, metrics, payroll });
    } else {
      summary.push({ idol, metrics, payroll: existingPayroll });
    }
  }

  return summary;
};

const finalizePeriodKpi = async (adminId, workPeriodId, req) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  await calculatePeriodKpiAndPayroll(workPeriodId);
  const now = new Date();

  await Promise.all([
    KpiResult.updateMany({ workPeriodId: period._id }, { $set: { isFinalized: true, finalizedBy: adminId, finalizedAt: now } }),
    Payroll.updateMany({ workPeriodId: period._id, status: 'DRAFT' }, { $set: { status: 'FINALIZED', finalizedBy: adminId, finalizedAt: now } }),
  ]);

  await recordAudit({ actorUserId: adminId, action: 'FINALIZE_KPI', entityName: 'WorkPeriod', entityId: period._id, newValue: { finalizedAt: now }, reason: 'Chốt KPI tháng', req });
};

const unlockPeriodKpi = async (adminId, workPeriodId, reason, req) => {
  if (!reason || !reason.trim()) throw new AppError('Bắt buộc nhập lý do mở khóa KPI', 400);
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') throw new AppError('Kỳ làm việc đang khóa, hãy mở khóa kỳ trước', 403);

  await Promise.all([
    KpiResult.updateMany({ workPeriodId: period._id }, { $set: { isFinalized: false } }),
    Payroll.updateMany({ workPeriodId: period._id, status: 'FINALIZED' }, { $set: { status: 'DRAFT' } }),
  ]);

  await recordAudit({ actorUserId: adminId, action: 'UNLOCK_KPI', entityName: 'WorkPeriod', entityId: period._id, reason: reason.trim(), req });
};

module.exports = { saveKpiRule, aggregateIdolPeriodMetrics, calculatePeriodKpiAndPayroll, finalizePeriodKpi, unlockPeriodKpi };
`;

files['services/reportComplaintService.js'] = String.raw`const XLSX = require('xlsx');
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
`;

// ==================== 4. CONTROLLERS ====================
files['controllers/authController.js'] = String.raw`const authService = require('../services/authService');

exports.login = async (req, res, next) => {
  try {
    const data = await authService.loginUser(req.body);
    res.json({ success: true, message: 'Đăng nhập thành công', data });
  } catch (err) { next(err); }
};

exports.activate = async (req, res, next) => {
  try {
    await authService.activateIdolAccount(req.body);
    res.json({ success: true, message: 'Kích hoạt tài khoản thành công' });
  } catch (err) { next(err); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const resetToken = await authService.forgotPassword(req.body.email);
    res.json({ success: true, message: 'Đã tạo yêu cầu đặt lại mật khẩu', data: { resetToken } });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body);
    res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user._id, req.body);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) { next(err); }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};
`;

files['controllers/idolController.js'] = String.raw`const idolService = require('../services/idolService');

exports.getIdols = async (req, res, next) => {
  try { res.json({ success: true, data: await idolService.searchIdols(req.query) }); } catch (err) { next(err); }
};
exports.createIdol = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Tạo tài khoản Idol thành công', data: await idolService.createIdolAccount(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.updateIdol = async (req, res, next) => {
  try { res.json({ success: true, message: 'Cập nhật hồ sơ Idol thành công', data: await idolService.updateIdolByAdmin(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.updateAccountStatus = async (req, res, next) => {
  try { res.json({ success: true, message: 'Cập nhật trạng thái thành công', data: await idolService.updateIdolAccountStatus(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.reissueInvite = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã cấp lại mã kích hoạt mới', data: await idolService.reissueActivationInvite(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.updateOwnProfile = async (req, res, next) => {
  try { res.json({ success: true, message: 'Cập nhật thông tin cá nhân thành công', data: await idolService.updateOwnIdolProfile(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
`;

files['controllers/workPeriodController.js'] = String.raw`const workPeriodService = require('../services/workPeriodService');

exports.getPeriods = async (req, res, next) => {
  try { res.json({ success: true, data: await workPeriodService.getAllPeriods() }); } catch (err) { next(err); }
};
exports.createPeriod = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Tạo kỳ làm việc thành công', data: await workPeriodService.createPeriod(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.updatePeriodConfig = async (req, res, next) => {
  try { res.json({ success: true, message: 'Cập nhật cấu hình kỳ thành công', data: await workPeriodService.updatePeriodConfig(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.lockPeriod = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã khóa kỳ làm việc', data: await workPeriodService.lockPeriod(req.user._id, req.params.id, req.body.reason, req) }); } catch (err) { next(err); }
};
exports.unlockPeriod = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã mở khóa kỳ làm việc', data: await workPeriodService.unlockPeriod(req.user._id, req.params.id, req.body.reason, req) }); } catch (err) { next(err); }
};
exports.getShiftSlots = async (req, res, next) => {
  try { res.json({ success: true, data: await workPeriodService.getShiftSlots() }); } catch (err) { next(err); }
};
exports.createShiftSlot = async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await workPeriodService.createShiftSlot(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.updateShiftSlot = async (req, res, next) => {
  try { res.json({ success: true, data: await workPeriodService.updateShiftSlot(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
`;

files['controllers/shiftController.js'] = String.raw`const shiftService = require('../services/shiftService');

exports.getGroupBoard = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getGroupShiftBoard(req.query) }); } catch (err) { next(err); }
};
exports.registerGroupShift = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đăng ký ca nhóm thành công', data: await shiftService.registerGroupShift(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.adminAssignShift = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Phân công ca thành công', data: await shiftService.adminAssignShift(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.markAbsent = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã ghi nhận vắng mặt (OFF)', data: await shiftService.markShiftAbsent(req.user._id, req.params.id, req.body.reason, req) }); } catch (err) { next(err); }
};
exports.getChangeRequests = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getShiftChangeRequests(req.user, req.query) }); } catch (err) { next(err); }
};
exports.createChangeRequest = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đã gửi yêu cầu đổi ca', data: await shiftService.createShiftChangeRequest(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.reviewChangeRequest = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã xử lý yêu cầu đổi ca', data: await shiftService.reviewShiftChangeRequest(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.getSoloSchedules = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getSoloSchedules(req.user, req.query) }); } catch (err) { next(err); }
};
exports.registerSoloLive = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đăng ký LIVE đơn thành công', data: await shiftService.registerSoloLive(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
`;

files['controllers/liveSessionController.js'] = String.raw`const liveSessionService = require('../services/liveSessionService');

exports.getActive = async (req, res, next) => {
  try { res.json({ success: true, data: await liveSessionService.getActiveSession(req.user._id) }); } catch (err) { next(err); }
};
exports.listSessions = async (req, res, next) => {
  try { res.json({ success: true, data: await liveSessionService.listLiveSessions(req.user, req.query) }); } catch (err) { next(err); }
};
exports.checkIn = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Bắt đầu phiên LIVE thành công', data: await liveSessionService.checkInLive(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.checkOut = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã kết thúc phiên LIVE', data: await liveSessionService.checkOutLive(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.uploadEvidence = async (req, res, next) => {
  try { res.json({ success: true, message: 'Tải ảnh bằng chứng thành công', data: await liveSessionService.uploadSessionEvidence(req.user._id, req.params.id, { file: req.file, evidenceType: req.body.evidenceType }) }); } catch (err) { next(err); }
};
exports.submitReport = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã gửi báo cáo số liệu', data: await liveSessionService.submitSessionReport(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.reviewSession = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã cập nhật kết quả duyệt', data: await liveSessionService.reviewLiveSession(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.adminAdjustTime = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã điều chỉnh thời gian phiên LIVE', data: await liveSessionService.adminAdjustSessionTime(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
`;

files['controllers/kpiReportController.js'] = String.raw`const KpiRule = require('../models/KpiRule');
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
`;

files['controllers/auditLogController.js'] = String.raw`const auditLogService = require('../services/auditLogService');

exports.getAuditLogs = async (req, res, next) => {
  try { res.json({ success: true, data: await auditLogService.searchAuditLogs(req.query) }); } catch (err) { next(err); }
};
`;

// ==================== 5. ROUTES & SERVER ====================
files['routes/apiRoutes.js'] = String.raw`const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/authMiddleware');
const { uploadEvidenceImage } = require('../middlewares/uploadMiddleware');
const authController = require('../controllers/authController');
const idolController = require('../controllers/idolController');
const workPeriodController = require('../controllers/workPeriodController');
const shiftController = require('../controllers/shiftController');
const liveSessionController = require('../controllers/liveSessionController');
const kpiReportController = require('../controllers/kpiReportController');
const auditLogController = require('../controllers/auditLogController');

// 1. Auth
router.post('/auth/login', authController.login);
router.post('/auth/activate', authController.activate);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);
router.put('/auth/change-password', protect, authController.changePassword);
router.get('/auth/me', protect, authController.getMe);

// 2. Nhân sự Idol
router.get('/admin/idols', protect, authorize('ADMIN'), idolController.getIdols);
router.post('/admin/idols', protect, authorize('ADMIN'), idolController.createIdol);
router.put('/admin/idols/:id', protect, authorize('ADMIN'), idolController.updateIdol);
router.patch('/admin/idols/:id/account-status', protect, authorize('ADMIN'), idolController.updateAccountStatus);
router.post('/admin/idols/:id/reissue-invite', protect, authorize('ADMIN'), idolController.reissueInvite);
router.put('/idol/profile', protect, authorize('IDOL'), idolController.updateOwnProfile);

// 3. Kỳ làm việc & Khung giờ
router.get('/work-periods', protect, workPeriodController.getPeriods);
router.post('/work-periods', protect, authorize('ADMIN'), workPeriodController.createPeriod);
router.put('/work-periods/:id/config', protect, authorize('ADMIN'), workPeriodController.updatePeriodConfig);
router.patch('/work-periods/:id/lock', protect, authorize('ADMIN'), workPeriodController.lockPeriod);
router.patch('/work-periods/:id/unlock', protect, authorize('ADMIN'), workPeriodController.unlockPeriod);

router.get('/shift-slots', protect, workPeriodController.getShiftSlots);
router.post('/shift-slots', protect, authorize('ADMIN'), workPeriodController.createShiftSlot);
router.put('/shift-slots/:id', protect, authorize('ADMIN'), workPeriodController.updateShiftSlot);

// 4. Lịch Ca Nhóm, Đổi Ca & Live Đơn
router.get('/shifts/board', protect, shiftController.getGroupBoard);
router.post('/shifts/register', protect, authorize('IDOL'), shiftController.registerGroupShift);
router.post('/shifts/admin-assign', protect, authorize('ADMIN'), shiftController.adminAssignShift);
router.patch('/shifts/:id/absent', protect, authorize('ADMIN'), shiftController.markAbsent);

router.get('/shift-changes', protect, shiftController.getChangeRequests);
router.post('/shift-changes', protect, authorize('IDOL'), shiftController.createChangeRequest);
router.put('/shift-changes/:id/review', protect, authorize('ADMIN'), shiftController.reviewChangeRequest);

router.get('/solo-schedules', protect, shiftController.getSoloSchedules);
router.post('/solo-schedules', protect, authorize('IDOL'), shiftController.registerSoloLive);

// 5. Theo dõi Phiên LIVE
router.get('/live-sessions/active', protect, authorize('IDOL'), liveSessionController.getActive);
router.get('/live-sessions', protect, liveSessionController.listSessions);
router.post('/live-sessions/check-in', protect, authorize('IDOL'), liveSessionController.checkIn);
router.post('/live-sessions/:id/check-out', protect, authorize('IDOL'), liveSessionController.checkOut);
router.post('/live-sessions/:id/evidence', protect, authorize('IDOL'), uploadEvidenceImage.single('image'), liveSessionController.uploadEvidence);
router.post('/live-sessions/:id/report', protect, authorize('IDOL'), liveSessionController.submitReport);
router.put('/live-sessions/:id/review', protect, authorize('ADMIN'), liveSessionController.reviewSession);
router.put('/live-sessions/:id/admin-adjust', protect, authorize('ADMIN'), liveSessionController.adminAdjustTime);

// 6. KPI, Khiếu nại, Dashboard & Excel
router.get('/kpi/rules', protect, kpiReportController.getKpiRules);
router.post('/kpi/rules', protect, authorize('ADMIN'), kpiReportController.saveKpiRule);
router.post('/kpi/calculate', protect, authorize('ADMIN'), kpiReportController.calculateKpi);
router.post('/kpi/finalize', protect, authorize('ADMIN'), kpiReportController.finalizeKpi);
router.post('/kpi/unlock', protect, authorize('ADMIN'), kpiReportController.unlockKpi);
router.get('/kpi/my-summary', protect, authorize('IDOL'), kpiReportController.getMyKpiSummary);

router.get('/complaints', protect, kpiReportController.getComplaints);
router.post('/complaints', protect, authorize('IDOL'), kpiReportController.createComplaint);
router.put('/complaints/:id/resolve', protect, authorize('ADMIN'), kpiReportController.resolveComplaint);

router.get('/dashboard/admin', protect, authorize('ADMIN'), kpiReportController.getAdminDashboard);
router.get('/reports/export-excel', protect, authorize('ADMIN'), kpiReportController.exportExcel);

// 7. Audit Logs
router.get('/admin/audit-logs', protect, authorize('ADMIN'), auditLogController.getAuditLogs);

module.exports = router;
`;

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(__dirname, relPath);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('✓ Đã ghi:', relPath);
}

console.log('\n🎉 Khởi tạo xong toàn bộ 32 file Backend! Đang sẵn sàng chạy server.js.');
