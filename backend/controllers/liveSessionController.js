const liveSessionService = require('../services/liveSessionService');
const { extractLiveStatsFromImage } = require('../services/aiVisionService');

exports.getActive = async (req, res, next) => {
  try { res.json({ success: true, data: await liveSessionService.getActiveSession(req.user._id) }); } catch (err) { next(err); }
};
exports.listSessions = async (req, res, next) => {
  try { res.json({ success: true, data: await liveSessionService.listLiveSessions(req.user, req.query) }); } catch (err) { next(err); }
};
exports.checkIn = async (req, res, next) => {
  try { res.status(201).json({ success: true, message: 'Bắt đầu phiên LIVE thành công', data: await liveSessionService.checkInLive(req.user._id, req.body, req) }); } catch (err) { next(err); }
};
exports.checkOut = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã kết thúc phiên LIVE', data: await liveSessionService.checkOutLive(req.user._id, req.params.id, req) }); } catch (err) { next(err); }
};
exports.uploadEvidence = async (req, res, next) => {
  try {
    const uploadResult = await liveSessionService.uploadSessionEvidence(req.user._id, req.params.id, {
      file: req.file,
      evidenceType: req.body.evidenceType,
    });

    const aiResult = req.file
      ? await extractLiveStatsFromImage(req.file)
      : { success: false, message: 'Không tìm thấy tệp ảnh', stats: null };

    const baseData = uploadResult?.toObject ? uploadResult.toObject() : (uploadResult || {});

    res.json({
      success: true,
      message: aiResult.success
        ? 'Tải ảnh thành công! AI đã tự động điền thông số phiên LIVE.'
        : `Tải ảnh bằng chứng thành công (${aiResult.message})`,
      data: {
        ...baseData,
        session: baseData,
        aiExtracted: aiResult.success,
        extractedStats: aiResult.stats,
      },
    });
  } catch (err) {
    next(err);
  }
};
exports.submitReport = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã gửi báo cáo số liệu', data: await liveSessionService.submitSessionReport(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.reviewSession = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã cập nhật kết quả duyệt', data: await liveSessionService.reviewLiveSession(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};
exports.adminAdjustTime = async (req, res, next) => {
  try { res.json({ success: true, message: 'Đã điều chỉnh thời gian phiên LIVE', data: await liveSessionService.adminAdjustSessionTime(req.user._id, req.params.id, req.body, req) }); } catch (err) { next(err); }
};