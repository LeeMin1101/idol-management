const crypto = require('crypto');
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
