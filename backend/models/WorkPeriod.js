const mongoose = require('mongoose');

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
