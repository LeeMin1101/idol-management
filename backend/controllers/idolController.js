const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

// Lấy danh sách nhân sự Idol (Admin)
const getIdols = async (req, res, next) => {
  try {
    const { search, accountStatus, status } = req.query;
    const filter = { role: 'IDOL' };

    const resolvedStatus = accountStatus || status;
    if (resolvedStatus && resolvedStatus !== 'ALL') {
      filter.accountStatus = resolvedStatus;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { name: regex },
        { stageName: regex },
        { username: regex },
        { email: regex },
        { phone: regex },
        { tiktokUsername: regex },
      ];
    }

    const idols = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: idols,
    });
  } catch (err) {
    next(err);
  }
};

// Tạo tài khoản Idol mới và sinh mã kích hoạt (Admin)
const createIdol = async (req, res, next) => {
  try {
    const {
      name,
      fullName,
      username,
      email,
      phone,
      stageName,
      tiktokUsername,
      tiktokProfileUrl,
      hourlyRate,
      groupHourlyRate,
      soloHourlyRate,
    } = req.body;

    const resolvedName = (name || fullName || '').trim();
    if (!resolvedName) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập họ tên Idol',
      });
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
    const resolvedUsername = username
      ? String(username).trim().toLowerCase()
      : normalizedEmail || `idol_${Date.now()}`;

    const duplicateConditions = [{ username: resolvedUsername }];
    if (normalizedEmail) {
      duplicateConditions.push({ email: normalizedEmail });
    }

    const existingUser = await User.findOne({ $or: duplicateConditions });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Tên đăng nhập hoặc email đã tồn tại trong hệ thống',
      });
    }

    const inviteToken = crypto.randomBytes(24).toString('hex');
    const inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);

    const idolPayload = {
      name: resolvedName,
      username: resolvedUsername,
      password: tempPassword,
      role: 'IDOL',
      accountStatus: 'PENDING_ACTIVATION',
      inviteToken,
      activationToken: inviteToken,
      inviteExpiresAt,
    };

    if (normalizedEmail) idolPayload.email = normalizedEmail;
    if (phone !== undefined) idolPayload.phone = String(phone).trim();
    if (stageName !== undefined) idolPayload.stageName = String(stageName).trim();
    if (tiktokUsername !== undefined) idolPayload.tiktokUsername = String(tiktokUsername).trim();
    if (tiktokProfileUrl !== undefined) idolPayload.tiktokProfileUrl = String(tiktokProfileUrl).trim();
    if (hourlyRate !== undefined) idolPayload.hourlyRate = Number(hourlyRate) || 0;
    if (groupHourlyRate !== undefined) idolPayload.groupHourlyRate = Number(groupHourlyRate) || 0;
    if (soloHourlyRate !== undefined) idolPayload.soloHourlyRate = Number(soloHourlyRate) || 0;

    const createdIdol = await User.create(idolPayload);
    const idolObj = createdIdol.toObject();
    delete idolObj.password;

    const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
    const activationUrl = `${clientOrigin}/activate?token=${inviteToken}`;

    res.status(201).json({
      success: true,
      message: 'Đã tạo hồ sơ Idol và mã kích hoạt tài khoản',
      data: idolObj,
      inviteToken,
      activationUrl,
    });
  } catch (err) {
    next(err);
  }
};

// Cập nhật thông tin Idol (Admin)
const updateIdol = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      fullName,
      email,
      phone,
      stageName,
      bio,
      tiktokUsername,
      tiktokProfileUrl,
      accountStatus,
      hourlyRate,
      groupHourlyRate,
      soloHourlyRate,
      bankInfo,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
    } = req.body;

    const updateFields = {};
    const resolvedName = name ?? fullName;
    if (resolvedName !== undefined) updateFields.name = String(resolvedName).trim();
    if (email !== undefined) updateFields.email = String(email).trim().toLowerCase();
    if (phone !== undefined) updateFields.phone = String(phone).trim();
    if (stageName !== undefined) updateFields.stageName = String(stageName).trim();
    if (bio !== undefined) updateFields.bio = String(bio).trim();
    if (tiktokUsername !== undefined) updateFields.tiktokUsername = String(tiktokUsername).trim();
    if (tiktokProfileUrl !== undefined) updateFields.tiktokProfileUrl = String(tiktokProfileUrl).trim();
    if (accountStatus !== undefined) updateFields.accountStatus = accountStatus;
    if (hourlyRate !== undefined) updateFields.hourlyRate = Number(hourlyRate) || 0;
    if (groupHourlyRate !== undefined) updateFields.groupHourlyRate = Number(groupHourlyRate) || 0;
    if (soloHourlyRate !== undefined) updateFields.soloHourlyRate = Number(soloHourlyRate) || 0;

    if (
      bankInfo ||
      bankName !== undefined ||
      bankAccountNumber !== undefined ||
      bankAccountHolder !== undefined
    ) {
      const resolvedBank = {
        bankName: String(bankInfo?.bankName ?? bankName ?? '').trim(),
        accountNumber: String(bankInfo?.accountNumber ?? bankAccountNumber ?? '').trim(),
        accountHolder: String(bankInfo?.accountHolder ?? bankAccountHolder ?? '').trim().toUpperCase(),
      };
      updateFields.bankInfo = resolvedBank;
      updateFields.bankName = resolvedBank.bankName;
      updateFields.bankAccountNumber = resolvedBank.accountNumber;
      updateFields.bankAccountHolder = resolvedBank.accountHolder;
    }

    const updated = await User.findOneAndUpdate(
      { _id: id, role: 'IDOL' },
      { $set: updateFields },
      { new: true, runValidators: true, strict: false }
    ).select('-password');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân sự Idol',
      });
    }

    res.json({
      success: true,
      message: 'Đã cập nhật thông tin Idol',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Thay đổi trạng thái tài khoản Idol (Admin)
const updateAccountStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { accountStatus, status } = req.body;
    const nextStatus = accountStatus || status;

    if (!nextStatus) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu trạng thái tài khoản cần cập nhật',
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: id, role: 'IDOL' },
      { $set: { accountStatus: nextStatus } },
      { new: true, strict: false }
    ).select('-password');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân sự Idol',
      });
    }

    res.json({
      success: true,
      message: `Đã chuyển trạng thái tài khoản sang ${nextStatus}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// Cấp lại mã kích hoạt tài khoản cho Idol (Admin)
const reissueInvite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const inviteToken = crypto.randomBytes(24).toString('hex');
    const inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const updated = await User.findOneAndUpdate(
      { _id: id, role: 'IDOL' },
      {
        $set: {
          accountStatus: 'PENDING_ACTIVATION',
          inviteToken,
          activationToken: inviteToken,
          inviteExpiresAt,
        },
      },
      { new: true, strict: false }
    ).select('-password');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân sự Idol',
      });
    }

    const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
    const activationUrl = `${clientOrigin}/activate?token=${inviteToken}`;

    res.json({
      success: true,
      message: 'Đã cấp lại mã kích hoạt mới cho Idol',
      data: updated,
      inviteToken,
      activationUrl,
    });
  } catch (err) {
    next(err);
  }
};

// Idol tự cập nhật hồ sơ cá nhân và tài khoản ngân hàng
const updateOwnProfile = async (req, res, next) => {
  try {
    const {
      name,
      fullName,
      stageName,
      phone,
      bio,
      tiktokUsername,
      tiktokProfileUrl,
      bankInfo,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
    } = req.body;

    const updateFields = {};
    const resolvedName = name ?? fullName;
    if (resolvedName !== undefined && String(resolvedName).trim()) {
      updateFields.name = String(resolvedName).trim();
    }
    if (stageName !== undefined) updateFields.stageName = String(stageName).trim();
    if (phone !== undefined) updateFields.phone = String(phone).trim();
    if (bio !== undefined) updateFields.bio = String(bio).trim();
    if (tiktokUsername !== undefined) updateFields.tiktokUsername = String(tiktokUsername).trim();
    if (tiktokProfileUrl !== undefined) updateFields.tiktokProfileUrl = String(tiktokProfileUrl).trim();

    if (
      bankInfo ||
      bankName !== undefined ||
      bankAccountNumber !== undefined ||
      bankAccountHolder !== undefined
    ) {
      const resolvedBank = {
        bankName: String(bankInfo?.bankName ?? bankName ?? '').trim(),
        accountNumber: String(bankInfo?.accountNumber ?? bankAccountNumber ?? '').trim(),
        accountHolder: String(bankInfo?.accountHolder ?? bankAccountHolder ?? '').trim().toUpperCase(),
      };
      updateFields.bankInfo = resolvedBank;
      updateFields.bankName = resolvedBank.bankName;
      updateFields.bankAccountNumber = resolvedBank.accountNumber;
      updateFields.bankAccountHolder = resolvedBank.accountHolder;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true, strict: false }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin tài khoản',
      });
    }

    res.json({
      success: true,
      message: 'Đã lưu thông tin hồ sơ cá nhân',
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

// Idol cập nhật ảnh đại diện
const updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn tệp ảnh JPG, PNG hoặc WEBP',
      });
    }

    const normalizedPath = req.file.path
      ? '/' + req.file.path.replace(/\\/g, '/').replace(/^.*?uploads\//, 'uploads/')
      : `/uploads/evidences/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl: normalizedPath } },
      { new: true, strict: false }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin tài khoản',
      });
    }

    res.json({
      success: true,
      message: 'Đã cập nhật ảnh đại diện',
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getIdols,
  createIdol,
  updateIdol,
  updateAccountStatus,
  reissueInvite,
  updateOwnProfile,
  updateAvatar,
};