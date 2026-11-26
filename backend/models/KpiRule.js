const mongoose = require('mongoose');

const kpiRuleSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    metricType: {
      type: String,
      enum: ['TOTAL_HOURS', 'GROUP_HOURS', 'SOLO_HOURS', 'COMPLETED_SHIFTS', 'COMPLETION_RATE', 'CUSTOM'],
      required: true,
    },
    liveTypeScope: { type: String, enum: ['ALL', 'GROUP', 'SOLO'], default: 'ALL' },
    versionNumber: { type: Number, default: 1 },
    formulaExpression: { type: String, required: true },
    targetValue: { type: Number, default: 0 },
    weightPercent: { type: Number, default: null },
    passCondition: { type: String, default: '' },
    failCondition: { type: String, default: '' },
    roundingRule: { type: String, enum: ['NONE', 'FLOOR_MINUTE', 'ROUND_2_DECIMALS'], default: 'ROUND_2_DECIMALS' },
    soloBonusTiers: [{ minSoloHours: { type: Number, required: true }, bonusAmount: { type: Number, required: true } }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

kpiRuleSchema.index({ workPeriodId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('KpiRule', kpiRuleSchema);
