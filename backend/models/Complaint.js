const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },
    kpiResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'KpiResult', default: null },
    reason: { type: String, required: true, trim: true },
    proofImageUrl: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'], default: 'OPEN', index: true },
    adminResponse: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
