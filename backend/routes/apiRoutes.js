const express = require('express');
const router = express.Router();

const User = require('../models/User');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { uploadEvidenceImage } = require('../middlewares/uploadMiddleware');
const authController = require('../controllers/authController');
const idolController = require('../controllers/idolController');
const workPeriodController = require('../controllers/workPeriodController');
const shiftController = require('../controllers/shiftController');
const liveSessionController = require('../controllers/liveSessionController');
const kpiReportController = require('../controllers/kpiReportController');
const auditLogController = require('../controllers/auditLogController');

const handleIdolAvatarUpload =
  typeof idolController.updateAvatar === 'function'
    ? idolController.updateAvatar
    : async (req, res, next) => {
        try {
          if (!req.file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn tệp ảnh hợp lệ' });
          }

          const normalizedPath = req.file.path
            ? '/' + req.file.path.replace(/\\/g, '/').replace(/^.*?uploads\//, 'uploads/')
            : `/uploads/evidences/${req.file.filename}`;

          const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { avatarUrl: normalizedPath } },
            { new: true, strict: false }
          ).select('-password');

          res.json({
            success: true,
            message: 'Đã cập nhật ảnh đại diện',
            data: updatedUser,
          });
        } catch (err) {
          next(err);
        }
      };

// 1. Auth
router.post('/auth/login', authController.login);
router.post('/auth/activate', authController.activate);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);
router.put('/auth/change-password', protect, authController.changePassword);
router.get('/auth/me', protect, authController.getMe);

// 2. Nhân sự Idol
router.get('/admin/idols', protect, authorize('ADMIN'), idolController.getIdols);
router.post('/admin/idols', protect, authorize('ADMIN'), idolController.createIdol);
router.put('/admin/idols/:id', protect, authorize('ADMIN'), idolController.updateIdol);
router.patch('/admin/idols/:id', protect, authorize('ADMIN'), idolController.updateIdol);
router.patch('/admin/idols/:id/account-status', protect, authorize('ADMIN'), idolController.updateAccountStatus);
router.post('/admin/idols/:id/reissue-invite', protect, authorize('ADMIN'), idolController.reissueInvite);
router.put('/idol/profile', protect, authorize('IDOL'), idolController.updateOwnProfile);
router.post(
  '/idol/profile/avatar',
  protect,
  authorize('IDOL'),
  uploadEvidenceImage.single('image'),
  handleIdolAvatarUpload
);

// 3. Kỳ làm việc & Khung giờ
router.get('/work-periods', protect, workPeriodController.getPeriods);
router.post('/work-periods', protect, authorize('ADMIN'), workPeriodController.createPeriod);
router.put('/work-periods/:id/config', protect, authorize('ADMIN'), workPeriodController.updatePeriodConfig);
router.patch('/work-periods/:id/lock', protect, authorize('ADMIN'), workPeriodController.lockPeriod);
router.patch('/work-periods/:id/unlock', protect, authorize('ADMIN'), workPeriodController.unlockPeriod);

router.get('/shift-slots', protect, workPeriodController.getShiftSlots);
router.post('/shift-slots', protect, authorize('ADMIN'), workPeriodController.createShiftSlot);
router.put('/shift-slots/:id', protect, authorize('ADMIN'), workPeriodController.updateShiftSlot);

// 4. Lịch Ca Nhóm, Đổi Ca & Live Đơn
router.get('/shifts/board', protect, shiftController.getGroupBoard);
router.post('/shifts/register', protect, authorize('IDOL'), shiftController.registerGroupShift);
router.post('/shifts/register-month', protect, authorize('IDOL'), shiftController.registerFullMonth);
router.delete('/shifts/:id', protect, authorize('IDOL'), shiftController.cancelGroupShift);
router.post('/shifts/admin-assign', protect, authorize('ADMIN'), shiftController.adminAssignShift);
router.patch('/shifts/admin/:id/host', protect, authorize('ADMIN'), shiftController.toggleShiftHost);
router.delete('/shifts/admin/:id', protect, authorize('ADMIN'), shiftController.adminRemoveShift);
router.patch('/shifts/:id/absent', protect, authorize('ADMIN'), shiftController.markAbsent);

router.get('/shift-changes', protect, shiftController.getChangeRequests);
router.post('/shift-changes', protect, authorize('IDOL'), shiftController.createChangeRequest);
router.put('/shift-changes/:id/review', protect, authorize('ADMIN'), shiftController.reviewChangeRequest);

router.get('/solo-schedules', protect, shiftController.getSoloSchedules);
router.post('/solo-schedules', protect, authorize('IDOL'), shiftController.registerSoloLive);

// 5. Theo dõi Phiên LIVE
router.get('/live-sessions/active', protect, authorize('IDOL'), liveSessionController.getActive);
router.get('/live-sessions', protect, liveSessionController.listSessions);
router.post('/live-sessions/check-in', protect, authorize('IDOL'), liveSessionController.checkIn);
router.post('/live-sessions/:id/check-out', protect, authorize('IDOL'), liveSessionController.checkOut);
router.post('/live-sessions/:id/evidence', protect, authorize('IDOL'), uploadEvidenceImage.single('image'), liveSessionController.uploadEvidence);
router.post('/live-sessions/:id/report', protect, authorize('IDOL'), liveSessionController.submitReport);
router.put('/live-sessions/:id/review', protect, authorize('ADMIN'), liveSessionController.reviewSession);
router.put('/live-sessions/:id/admin-adjust', protect, authorize('ADMIN'), liveSessionController.adminAdjustTime);

// 6. KPI, Khiếu nại, Dashboard & Excel
router.get('/kpi/rules', protect, kpiReportController.getKpiRules);
router.post('/kpi/rules', protect, authorize('ADMIN'), kpiReportController.saveKpiRule);
router.post('/kpi/calculate', protect, authorize('ADMIN'), kpiReportController.calculateKpi);
router.post('/kpi/finalize', protect, authorize('ADMIN'), kpiReportController.finalizeKpi);
router.post('/kpi/unlock', protect, authorize('ADMIN'), kpiReportController.unlockKpi);
router.get('/kpi/my-summary', protect, authorize('IDOL'), kpiReportController.getMyKpiSummary);

router.get('/complaints', protect, kpiReportController.getComplaints);
router.post('/complaints', protect, authorize('IDOL'), kpiReportController.createComplaint);
router.put('/complaints/:id/resolve', protect, authorize('ADMIN'), kpiReportController.resolveComplaint);

router.get('/dashboard/admin', protect, authorize('ADMIN'), kpiReportController.getAdminDashboard);
router.get('/reports/export-excel', protect, authorize('ADMIN'), kpiReportController.exportExcel);

// 7. Audit Logs
router.get('/admin/audit-logs', protect, authorize('ADMIN'), auditLogController.getAuditLogs);

module.exports = router;