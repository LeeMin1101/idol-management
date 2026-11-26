const mongoose = require('mongoose');

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
