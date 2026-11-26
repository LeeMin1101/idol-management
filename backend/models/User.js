const mongoose = require('mongoose');

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
