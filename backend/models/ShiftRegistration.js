const mongoose = require('mongoose');

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
