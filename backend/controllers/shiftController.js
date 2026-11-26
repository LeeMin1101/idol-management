const shiftService = require('../services/shiftService');

exports.getGroupBoard = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getGroupShiftBoard(req.query) }); } catch (err) { next(err); }
};
exports.registerGroupShift = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đăng ký ca nhóm thành công', data: await shiftService.registerGroupShift(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.registerFullMonth = async (req, res, next) => {
  try {
    const result = await shiftService.registerFullMonth(req.user._id, req.body, req);
    res.status(201).json({
      success: true,
      message: `Đã đăng ký thành công ${result.registeredCount} ngày trong tháng (bỏ qua ${result.skippedCount} ngày không khả dụng)`,
      data: result,
    });
  } catch (err) { next(err); }
};
exports.cancelGroupShift = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã hủy đăng ký ca thành công', data: await shiftService.cancelGroupShift(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.adminAssignShift = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Phân công ca thành công', data: await shiftService.adminAssignShift(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.toggleShiftHost = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã cập nhật vai trò Host ca', data: await shiftService.toggleShiftHost(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.adminRemoveShift = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã xóa Idol khỏi ca', data: await shiftService.adminRemoveShift(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.markAbsent = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã ghi nhận vắng mặt (OFF)', data: await shiftService.markShiftAbsent(req.user._id, req.params.id, req.body.reason, req) }); } catch (err) { next(err); }
};
exports.getChangeRequests = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getShiftChangeRequests(req.user, req.query) }); } catch (err) { next(err); }
};
exports.createChangeRequest = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đã gửi yêu cầu đổi ca', data: await shiftService.createShiftChangeRequest(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.reviewChangeRequest = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã xử lý yêu cầu đổi ca', data: await shiftService.reviewShiftChangeRequest(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.getSoloSchedules = async (req, res, next) => {
  try { res.json({ success: true, data: await shiftService.getSoloSchedules(req.user, req.query) }); } catch (err) { next(err); }
};
exports.registerSoloLive = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Đăng ký LIVE đơn thành công', data: await shiftService.registerSoloLive(req.user._id, req.body, req) }); } catch (err) { next(err); }
};