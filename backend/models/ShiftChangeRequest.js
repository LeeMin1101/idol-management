const mongoose = require('mongoose');

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
