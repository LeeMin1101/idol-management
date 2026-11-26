const KpiRule = require('../models/KpiRule');
const KpiResult = require('../models/KpiResult');
const Payroll = require('../models/Payroll');
const WorkPeriod = require('../models/WorkPeriod');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const ShiftRegistration = require('../models/ShiftRegistration');
const { AppError } = require('../middlewares/errorMiddleware');
const { recordAudit } = require('./auditLogService');

const evaluateSafeFormula = (expression, variables) => {
  let parsed = String(expression);
  const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const regex = new RegExp('\\b' + key + '\\b', 'g');
    parsed = parsed.replace(regex, String(Number(variables[key]) || 0));
  }

  if (!/^[0-9+\-*/().\s]+$/.test(parsed)) {
    throw new AppError('Công thức KPI chứa ký tự hoặc biến không hợp lệ: ' + expression, 400);
  }

  const tokens = parsed.match(/\d+(\.\d+)?|[+\-*/()]/g) || [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const values = [];
  const ops = [];

  const applyOp = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (op === '+') values.push(a + b);
    else if (op === '-') values.push(a - b);
    else if (op === '*') values.push(a * b);
    else if (op === '/') values.push(b === 0 ? 0 : a / b);
  };

  for (const token of tokens) {
    if (!Number.isNaN(Number(token))) values.push(Number(token));
    else if (token === '(') ops.push(token);
    else if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') applyOp();
      ops.pop();
    } else if (precedence[token]) {
      while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) applyOp();
      ops.push(token);
    }
  }
  while (ops.length) applyOp();

  return Number.isFinite(values[0]) ? values[0] : 0;
};

const applyRounding = (value, roundingRule) => {
  if (roundingRule === 'FLOOR_MINUTE') return Math.floor(value);
  if (roundingRule === 'ROUND_2_DECIMALS') return Math.round(value * 100) / 100;
  return value;
};

const saveKpiRule = async (adminId, payload, req) => {
  const period = await WorkPeriod.findById(payload.workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') throw new AppError('Kỳ đã khóa, không thể chỉnh sửa quy tắc KPI', 403);

  const code = payload.code.trim().toUpperCase();
  const existing = await KpiRule.findOne({ workPeriodId: period._id, code });

  if (existing) {
    existing.name = payload.name.trim();
    existing.metricType = payload.metricType;
    existing.liveTypeScope = payload.liveTypeScope || 'ALL';
    existing.formulaExpression = payload.formulaExpression.trim();
    existing.targetValue = Number(payload.targetValue) || 0;
    existing.roundingRule = payload.roundingRule || 'ROUND_2_DECIMALS';
    existing.soloBonusTiers = payload.soloBonusTiers || [];
    existing.versionNumber += 1;
    await existing.save();
    return existing;
  }

  return KpiRule.create({
    workPeriodId: period._id,
    code,
    name: payload.name.trim(),
    metricType: payload.metricType,
    liveTypeScope: payload.liveTypeScope || 'ALL',
    formulaExpression: payload.formulaExpression.trim(),
    targetValue: Number(payload.targetValue) || 0,
    roundingRule: payload.roundingRule || 'ROUND_2_DECIMALS',
    soloBonusTiers: payload.soloBonusTiers || [],
    createdBy: adminId,
  });
};

const aggregateIdolPeriodMetrics = async (workPeriodId, idolId) => {
  const [sessions, registrations] = await Promise.all([
    LiveSession.find({ workPeriodId, idolId }).lean(),
    ShiftRegistration.find({ workPeriodId, idolId, status: { $ne: 'CANCELLED' } }).lean(),
  ]);

  let groupApprovedMinutes = 0;
  let soloApprovedMinutes = 0;
  let completedShiftsCount = 0;
  let rejectedSessionsCount = 0;
  let missingReportCount = 0;

  for (const s of sessions) {
    if (s.status === 'APPROVED') {
      if (s.liveType === 'GROUP') {
        groupApprovedMinutes += s.approvedDurationMinutes || 0;
        completedShiftsCount += 1;
      } else {
        soloApprovedMinutes += s.approvedDurationMinutes || 0;
      }
    } else if (['REJECTED', 'VIOLATION'].includes(s.status)) {
      rejectedSessionsCount += 1;
    } else if (['WAITING_EVIDENCE', 'INCOMPLETE'].includes(s.status)) {
      missingReportCount += 1;
    }
  }

  const absentShiftsCount = registrations.filter((r) => r.status === 'ABSENT').length;
  const totalApprovedMinutes = groupApprovedMinutes + soloApprovedMinutes;

  return {
    totalApprovedMinutes,
    groupApprovedMinutes,
    soloApprovedMinutes,
    approvedGroupHours: Math.round((groupApprovedMinutes / 60) * 100) / 100,
    approvedSoloHours: Math.round((soloApprovedMinutes / 60) * 100) / 100,
    totalApprovedHours: Math.round((totalApprovedMinutes / 60) * 100) / 100,
    completedShiftsCount,
    absentShiftsCount,
    rejectedSessionsCount,
    missingReportCount,
  };
};

const calculatePeriodKpiAndPayroll = async (workPeriodId) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  const [idols, rules] = await Promise.all([
    User.find({ role: 'IDOL', deletedAt: null }).lean(),
    KpiRule.find({ workPeriodId: period._id, isActive: true }).lean(),
  ]);

  const effectiveRules = rules.length > 0
    ? rules
    : [{ _id: null, code: 'DEFAULT', name: 'Tổng giờ LIVE', formulaExpression: 'totalApprovedHours', targetValue: 0, roundingRule: 'ROUND_2_DECIMALS', soloBonusTiers: [] }];

  const summary = [];

  for (const idol of idols) {
    const metrics = await aggregateIdolPeriodMetrics(period._id, idol._id);

    for (const rule of effectiveRules) {
      const rawValue = evaluateSafeFormula(rule.formulaExpression, { ...metrics, targetValue: rule.targetValue || 0 });
      const calculatedValue = applyRounding(rawValue, rule.roundingRule);
      const completionRate = rule.targetValue > 0 ? Math.round((metrics.totalApprovedHours / rule.targetValue) * 10000) / 100 : 100;

      if (rule._id) {
        const existingResult = await KpiResult.findOne({ workPeriodId: period._id, idolId: idol._id, kpiRuleId: rule._id });
        if (!existingResult || !existingResult.isFinalized) {
          await KpiResult.findOneAndUpdate(
            { workPeriodId: period._id, idolId: idol._id, kpiRuleId: rule._id },
            {
              ruleSnapshot: rule,
              totalApprovedMinutes: metrics.totalApprovedMinutes,
              groupApprovedMinutes: metrics.groupApprovedMinutes,
              soloApprovedMinutes: metrics.soloApprovedMinutes,
              completedShiftsCount: metrics.completedShiftsCount,
              absentShiftsCount: metrics.absentShiftsCount,
              rejectedSessionsCount: metrics.rejectedSessionsCount,
              missingReportCount: metrics.missingReportCount,
              completionRate,
              calculatedValue,
              isPassed: rule.targetValue > 0 ? metrics.totalApprovedHours >= rule.targetValue : true,
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    const groupLiveAmount = Math.round(metrics.approvedGroupHours * period.groupHourlyRate);
    let soloBonusAmount = 0;
    const ruleWithTiers = effectiveRules.find((r) => Array.isArray(r.soloBonusTiers) && r.soloBonusTiers.length > 0);
    if (ruleWithTiers) {
      const matched = ruleWithTiers.soloBonusTiers.filter((t) => metrics.approvedSoloHours >= t.minSoloHours).sort((a, b) => b.minSoloHours - a.minSoloHours);
      if (matched.length > 0) soloBonusAmount = matched[0].bonusAmount;
    }

    const existingPayroll = await Payroll.findOne({ workPeriodId: period._id, idolId: idol._id });
    if (!existingPayroll || existingPayroll.status === 'DRAFT') {
      const payroll = await Payroll.findOneAndUpdate(
        { workPeriodId: period._id, idolId: idol._id },
        {
          approvedGroupHours: metrics.approvedGroupHours,
          groupHourlyRateSnapshot: period.groupHourlyRate,
          groupLiveAmount,
          approvedSoloHours: metrics.approvedSoloHours,
          soloBonusAmount,
          totalPayableAmount: groupLiveAmount + soloBonusAmount,
        },
        { upsert: true, new: true }
      ).lean();
      summary.push({ idol, metrics, payroll });
    } else {
      summary.push({ idol, metrics, payroll: existingPayroll });
    }
  }

  return summary;
};

const finalizePeriodKpi = async (adminId, workPeriodId, req) => {
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);

  await calculatePeriodKpiAndPayroll(workPeriodId);
  const now = new Date();

  await Promise.all([
    KpiResult.updateMany({ workPeriodId: period._id }, { $set: { isFinalized: true, finalizedBy: adminId, finalizedAt: now } }),
    Payroll.updateMany({ workPeriodId: period._id, status: 'DRAFT' }, { $set: { status: 'FINALIZED', finalizedBy: adminId, finalizedAt: now } }),
  ]);

  await recordAudit({ actorUserId: adminId, action: 'FINALIZE_KPI', entityName: 'WorkPeriod', entityId: period._id, newValue: { finalizedAt: now }, reason: 'Chốt KPI tháng', req });
};

const unlockPeriodKpi = async (adminId, workPeriodId, reason, req) => {
  if (!reason || !reason.trim()) throw new AppError('Bắt buộc nhập lý do mở khóa KPI', 400);
  const period = await WorkPeriod.findById(workPeriodId);
  if (!period) throw new AppError('Không tìm thấy kỳ làm việc', 404);
  if (period.status === 'LOCKED') throw new AppError('Kỳ làm việc đang khóa, hãy mở khóa kỳ trước', 403);

  await Promise.all([
    KpiResult.updateMany({ workPeriodId: period._id }, { $set: { isFinalized: false } }),
    Payroll.updateMany({ workPeriodId: period._id, status: 'FINALIZED' }, { $set: { status: 'DRAFT' } }),
  ]);

  await recordAudit({ actorUserId: adminId, action: 'UNLOCK_KPI', entityName: 'WorkPeriod', entityId: period._id, reason: reason.trim(), req });
};

module.exports = { saveKpiRule, aggregateIdolPeriodMetrics, calculatePeriodKpiAndPayroll, finalizePeriodKpi, unlockPeriodKpi };
