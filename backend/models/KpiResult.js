const mongoose = require('mongoose');

const kpiResultSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kpiRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'KpiRule', required: true },
    ruleSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    totalApprovedMinutes: { type: Number, default: 0 },
    groupApprovedMinutes: { type: Number, default: 0 },
    soloApprovedMinutes: { type: Number, default: 0 },
    completedShiftsCount: { type: Number, default: 0 },
    absentShiftsCount: { type: Number, default: 0 },
    rejectedSessionsCount: { type: Number, default: 0 },
    missingReportCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    calculatedValue: { type: Number, default: 0 },
    isPassed: { type: Boolean, default: true },
    isFinalized: { type: Boolean, default: false },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

kpiResultSchema.index({ workPeriodId: 1, idolId: 1, kpiRuleId: 1 }, { unique: true });

module.exports = mongoose.model('KpiResult', kpiResultSchema);
