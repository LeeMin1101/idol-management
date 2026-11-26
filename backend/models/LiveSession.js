const mongoose = require('mongoose');

const evidenceSubSchema = new mongoose.Schema(
  {
    evidenceType: {
      type: String,
      enum: ['IDOL_STAT_SCREENSHOT', 'HOST_SUMMARY_SCREENSHOT'],
      default: 'IDOL_STAT_SCREENSHOT',
    },
    imageUrl: { type: String, required: true },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    fileSizeBytes: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const liveSessionSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveType: { type: String, enum: ['GROUP', 'SOLO'], required: true },
    shiftRegistrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftRegistration', default: null },
    soloScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'SoloLiveSchedule', default: null },
    plannedStartTime: { type: Date, required: true },
    plannedEndTime: { type: Date, required: true },
    actualStartTime: { type: Date, required: true },
    actualEndTime: { type: Date, default: null },
    actualDurationMinutes: { type: Number, default: 0 },
    approvedDurationMinutes: { type: Number, default: 0 },
    tiktokLiveUrl: { type: String, trim: true, default: '' },
    isHostSession: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'LIVE', 'WAITING_EVIDENCE', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'VIOLATION', 'INCOMPLETE'],
      default: 'LIVE',
      index: true,
    },
    evidences: [evidenceSubSchema],
    report: {
      reportedMinutes: { type: Number, default: 0 },
      totalViewers: { type: Number, default: 0 },
      peakConcurrentViewers: { type: Number, default: 0 },
      diamondsOrPoints: { type: Number, default: 0 },
      hostSummaryNote: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectOrViolationReason: { type: String, default: '' },
  },
  { timestamps: true }
);

liveSessionSchema.index(
  { idolId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'LIVE' } }
);

module.exports = mongoose.model('LiveSession', liveSessionSchema);
