const bcrypt = require('bcryptjs');
const User = require('../models/User');

// GET /api/users/me
exports.getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me
exports.updateMyProfile = async (req, res, next) => {
  try {
    const {
      name,
      fullName,
      stageName,
      phone,
      bio,
      tiktokUsername,
      tiktokProfileUrl,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
    } = req.body;

    const updatePayload = {};
    const resolvedName = name ?? fullName;
    if (resolvedName !== undefined) updatePayload.name = String(resolvedName).trim();
    if (stageName !== undefined) updatePayload.stageName = String(stageName).trim();
    if (phone !== undefined) updatePayload.phone = String(phone).trim();
    if (bio !== undefined) updatePayload.bio = String(bio).trim();
    if (tiktokUsername !== undefined) updatePayload.tiktokUsername = String(tiktokUsername).trim();
    if (tiktokProfileUrl !== undefined) updatePayload.tiktokProfileUrl = String(tiktokProfileUrl).trim();

    if (bankName !== undefined || bankAccountNumber !== undefined || bankAccountHolder !== undefined) {
      updatePayload.bankInfo = {
        bankName: String(bankName || '').trim(),
        accountNumber: String(bankAccountNumber || '').trim(),
        accountHolder: String(bankAccountHolder || '').trim().toUpperCase(),
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Cập nhật hồ sơ thành công',
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/users/me/avatar
exports.updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn tệp ảnh hợp lệ' });
    }

    const normalizedPath = req.file.path
      ? '/' + req.file.path.replace(/\\/g, '/').replace(/^.*?uploads\//, 'uploads/')
      : `/uploads/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl: normalizedPath } },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Đã cập nhật ảnh đại diện',
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me/password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
      });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
};