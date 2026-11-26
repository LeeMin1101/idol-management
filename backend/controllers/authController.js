const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middlewares/errorMiddleware');

let bcrypt = null;
try {
  bcrypt = require('bcryptjs');
} catch {
  try {
    bcrypt = require('bcrypt');
  } catch {
    bcrypt = null;
  }
}

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const verifyPassword = async (plainPassword, user) => {
  if (typeof user.comparePassword === 'function') {
    return user.comparePassword(plainPassword);
  }
  if (bcrypt && user.password?.startsWith('$2')) {
    return bcrypt.compare(plainPassword, user.password);
  }
  return plainPassword === user.password;
};

exports.login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const loginId = (username || email || '').trim();
    if (!loginId || !password) {
      throw new AppError('Vui lòng nhập tài khoản và mật khẩu', 400);
    }

    const user = await User.findOne({
      $or: [{ username: loginId }, { email: loginId.toLowerCase() }],
      deletedAt: null,
    }).select('+password');

    if (!user || !(await verifyPassword(password, user))) {
      throw new AppError('Tài khoản hoặc mật khẩu không chính xác', 401);
    }

    if (user.isActive === false) {
      throw new AppError('Tài khoản của bạn đã bị khóa, vui lòng liên hệ Vận hành', 403);
    }

    const token = signToken(user);
    const userObj = user.toObject();
    delete userObj.password;

    res.json({
      success: true,
      token,
      data: { token, user: userObj },
      user: userObj,
    });
  } catch (err) {
    next(err);
  }
};

exports.activate = async (req, res, next) => {
  try {
    const { token, inviteToken, password } = req.body;
    const rawToken = token || inviteToken;
    if (!rawToken || !password || password.length < 6) {
      throw new AppError('Mã kích hoạt hoặc mật khẩu (tối thiểu 6 ký tự) không hợp lệ', 400);
    }

    const user = await User.findOne({
      inviteToken: rawToken,
      deletedAt: null,
    }).select('+password');

    if (!user) {
      throw new AppError('Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng', 400);
    }

    user.password = password;
    user.isActive = true;
    user.inviteToken = undefined;
    user.inviteExpiresAt = undefined;
    await user.save();

    const authToken = signToken(user);
    const userObj = user.toObject();
    delete userObj.password;

    res.json({
      success: true,
      message: 'Kích hoạt tài khoản thành công',
      token: authToken,
      data: { token: authToken, user: userObj },
      user: userObj,
    });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { username, email } = req.body;
    const loginId = (username || email || '').trim();
    if (!loginId) throw new AppError('Vui lòng nhập username hoặc email', 400);

    const user = await User.findOne({
      $or: [{ username: loginId }, { email: loginId.toLowerCase() }],
      deletedAt: null,
    });

    if (!user) {
      throw new AppError('Không tìm thấy tài khoản tương ứng', 404);
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Đã tạo mã khôi phục mật khẩu (hiệu lực 15 phút)',
      data: { resetToken },
    });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, resetToken, newPassword, password } = req.body;
    const rawToken = token || resetToken;
    const nextPass = newPassword || password;

    if (!rawToken || !nextPass || nextPass.length < 6) {
      throw new AppError('Mã khôi phục hoặc mật khẩu mới không hợp lệ', 400);
    }

    const user = await User.findOne({
      resetPasswordToken: rawToken,
      resetPasswordExpires: { $gt: new Date() },
      deletedAt: null,
    }).select('+password');

    if (!user) {
      throw new AppError('Mã khôi phục không hợp lệ hoặc đã hết hạn', 400);
    }

    user.password = nextPass;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { oldPassword, currentPassword, newPassword } = req.body;
    const oldPass = oldPassword || currentPassword;

    if (!oldPass || !newPassword || newPassword.length < 6) {
      throw new AppError('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 6 ký tự)', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await verifyPassword(oldPass, user))) {
      throw new AppError('Mật khẩu hiện tại không chính xác', 400);
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: req.user,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
};