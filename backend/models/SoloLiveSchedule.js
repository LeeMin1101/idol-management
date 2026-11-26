const mongoose = require('mongoose');

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
