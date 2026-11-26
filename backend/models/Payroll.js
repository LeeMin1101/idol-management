const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    workPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkPeriod', required: true },
    idolId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedGroupHours: { type: Number, default: 0 },
    groupHourlyRateSnapshot: { type: Number, default: 50000 },
    groupLiveAmount: { type: Number, default: 0 },
    approvedSoloHours: { type: Number, default: 0 },
    soloBonusAmount: { type: Number, default: 0 },
    deductionAmount: { type: Number, default: 0 },
    totalPayableAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['DRAFT', 'FINALIZED', 'PAID'], default: 'DRAFT' },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

payrollSchema.index({ workPeriodId: 1, idolId: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', payrollSchema);
