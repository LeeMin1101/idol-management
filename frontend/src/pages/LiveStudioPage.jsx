import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  Radio,
  Play,
  Square,
  Upload,
  FileText,
  AlertCircle,
  Clock,
  Crown,
  MessageSquareWarning,
  Wallet,
  Sparkles,
  Loader2,
} from 'lucide-react';
import axiosClient, { resolveAssetUrl } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';

const formatSeconds = (totalSec) => {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export default function LiveStudioPage() {
  const { user } = useAuth();

  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [activeSession, setActiveSession] = useState(null);
  const [myShifts, setMyShifts] = useState([]);
  const [mySoloSchedules, setMySoloSchedules] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [kpiSummary, setKpiSummary] = useState(null);

  // Form Check-in
  const [liveType, setLiveType] = useState('GROUP');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [tiktokLiveUrl, setTiktokLiveUrl] = useState('');

  // Form bằng chứng & báo cáo sau Check-out
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [aiExtractNote, setAiExtractNote] = useState('');
  const [reportForm, setReportForm] = useState({
    reportedMinutes: '',
    totalViewers: '',
    peakConcurrentViewers: '',
    diamondsOrPoints: '',
    hostSummaryNote: '',
  });

  // Modal khiếu nại
  const [complaintModal, setComplaintModal] = useState({
    open: false,
    sessionId: null,
    reason: '',
  });

  // Đồng bộ lệch giờ Client - Server
  useEffect(() => {
    const syncClock = async () => {
      try {
        const t0 = Date.now();
        const res = await axiosClient.get('/health');
        const t1 = Date.now();
        const serverMs = new Date(res.serverTime).getTime();
        const rttHalf = (t1 - t0) / 2;
        setServerOffsetMs(serverMs - (t0 + rttHalf));
      } catch {
        // Giữ offset = 0 nếu không lấy được giờ server
      }
    };

    syncClock();
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    axiosClient
      .get('/work-periods')
      .then((res) => {
        const list = res.data || [];
        setPeriods(list);
        if (list.length > 0) setSelectedPeriodId(list[0]._id);
      })
      .catch((err) => toast.error(err.message));
  }, []);

  const loadAllData = useCallback(async () => {
    if (!selectedPeriodId) return;
    try {
      const [activeRes, boardRes, soloRes, histRes, kpiRes] = await Promise.all([
        axiosClient.get('/live-sessions/active'),
        axiosClient.get(`/shifts/board?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/solo-schedules?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/live-sessions?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/kpi/my-summary?workPeriodId=${selectedPeriodId}`),
      ]);

      setActiveSession(activeRes.data || null);

      const availableGroup = (boardRes.data?.registrations || []).filter(
        (r) =>
          String(r.idolId?._id || r.idolId) === String(user?._id) &&
          r.status === 'APPROVED' &&
          !r.liveSessionId
      );
      const availableSolo = (soloRes.data || []).filter(
        (s) => s.status === 'APPROVED' && !s.liveSessionId
      );

      setMyShifts(availableGroup);
      setMySoloSchedules(availableSolo);
      setSessionHistory(histRes.data || []);
      setKpiSummary(kpiRes.data || null);

      if (activeRes.data) {
        setReportForm((prev) => ({
          ...prev,
          reportedMinutes:
            prev.reportedMinutes !== ''
              ? prev.reportedMinutes
              : (activeRes.data.actualDurationMinutes ?? 0),
        }));
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [selectedPeriodId, user?._id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedTargetId) {
      return toast.error('Vui lòng chọn ca đăng ký trước khi bắt đầu LIVE');
    }
    try {
      await axiosClient.post('/live-sessions/check-in', {
        liveType,
        shiftRegistrationId: liveType === 'GROUP' ? selectedTargetId : null,
        soloScheduleId: liveType === 'SOLO' ? selectedTargetId : null,
        tiktokLiveUrl,
      });
      toast.success('Đã bắt đầu ghi nhận phiên LIVE theo giờ Server!');
      setTiktokLiveUrl('');
      setSelectedTargetId('');
      loadAllData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCheckOut = async () => {
    if (!activeSession) return;
    if (!window.confirm('Xác nhận kết thúc phiên LIVE hiện tại?')) return;
    try {
      await axiosClient.post(`/live-sessions/${activeSession._id}/check-out`);
      toast.info('Đã kết thúc LIVE. Vui lòng tải ảnh chụp báo cáo số liệu.');
      loadAllData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUploadEvidence = async (selectedFile = null) => {
    const fileToUpload = selectedFile instanceof File ? selectedFile : evidenceFile;
    if (!fileToUpload || !activeSession) {
      return toast.error('Vui lòng chọn tệp ảnh JPG/PNG/WEBP');
    }

    const formData = new FormData();
    formData.append('image', fileToUpload);
    formData.append(
      'evidenceType',
      activeSession.isHostSession ? 'HOST_SUMMARY_SCREENSHOT' : 'IDOL_STAT_SCREENSHOT'
    );

    setUploading(true);
    try {
      const res = await axiosClient.post(`/live-sessions/${activeSession._id}/evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const stats = res.data?.extractedStats;
      await loadAllData();

      if (res.data?.aiExtracted && stats) {
        const resolvedMinutes =
          stats.actualMinutes > 0
            ? stats.actualMinutes
            : (activeSession.actualDurationMinutes ?? 0);

        setReportForm((prev) => ({
          ...prev,
          reportedMinutes: resolvedMinutes,
          totalViewers: stats.totalViews ?? 0,
          peakConcurrentViewers: stats.peakViewers ?? 0,
          diamondsOrPoints: stats.diamonds ?? 0,
        }));
        setAiExtractNote(
          `AI (${stats.detectedPlatform || 'Livestream'}) đã tự động điền: ${resolvedMinutes} phút • ${stats.totalViews ?? 0} lượt xem • Peak ${stats.peakViewers ?? 0} • ${stats.diamonds ?? 0} điểm KPI`
        );
        toast.success('Đã tải ảnh lên và AI tự động điền thông số!');
      } else {
        setAiExtractNote('');
        toast.warning(res.message || 'Đã tải ảnh lên nhưng AI chưa trích xuất được số liệu.');
      }

      setEvidenceFile(null);
    } catch (err) {
      toast.error(err.message || 'Lỗi khi tải ảnh lên máy chủ');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await axiosClient.post(`/live-sessions/${activeSession._id}/report`, {
        reportedMinutes: Number(reportForm.reportedMinutes) || 0,
        totalViewers: Number(reportForm.totalViewers) || 0,
        peakConcurrentViewers: Number(reportForm.peakConcurrentViewers) || 0,
        diamondsOrPoints: Number(reportForm.diamondsOrPoints) || 0,
        hostSummaryNote: reportForm.hostSummaryNote,
      });
      toast.success('Đã gửi báo cáo số liệu chờ Vận hành duyệt!');
      setAiExtractNote('');
      setReportForm({
        reportedMinutes: '',
        totalViewers: '',
        peakConcurrentViewers: '',
        diamondsOrPoints: '',
        hostSummaryNote: '',
      });
      loadAllData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.post('/complaints', {
        workPeriodId: selectedPeriodId,
        liveSessionId: complaintModal.sessionId,
        reason: complaintModal.reason,
      });
      toast.success('Đã gửi khiếu nại tới bộ phận Vận hành');
      setComplaintModal({ open: false, sessionId: null, reason: '' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const elapsedSeconds =
    activeSession?.status === 'LIVE'
      ? (nowTick + serverOffsetMs - new Date(activeSession.actualStartTime).getTime()) / 1000
      : 0;

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Chọn kỳ */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
            Phòng LIVE & Chấm Công Thời Gian Thực
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Thời gian bắt đầu/kết thúc được chốt trực tiếp trên máy chủ • Bắt buộc nộp ảnh bằng
            chứng sau mỗi phiên
          </p>
        </div>

        <select
          value={selectedPeriodId}
          onChange={(e) => {
            setSelectedPeriodId(e.target.value);
            setSelectedTargetId('');
          }}
          className="bg-slate-950 border border-slate-700 text-sm text-white px-3.5 py-2 rounded-xl"
        >
          {periods.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Thống kê KPI & Công tạm tính cá nhân */}
      {kpiSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Giờ LIVE Nhóm (Đã duyệt)</div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">
              {kpiSummary.metrics?.approvedGroupHours || 0}h
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Hoàn thành {kpiSummary.metrics?.completedShiftsCount || 0} ca
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Giờ LIVE Đơn (Đã duyệt)</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {kpiSummary.metrics?.approvedSoloHours || 0}h
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Yêu cầu ≥ 60 phút/phiên</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Ca vắng (OFF) / Vi phạm</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {kpiSummary.metrics?.absentShiftsCount || 0} /{' '}
              {kpiSummary.metrics?.rejectedSessionsCount || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Thiếu báo cáo: {kpiSummary.metrics?.missingReportCount || 0}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-amber-400" /> Thu nhập tạm tính
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {(kpiSummary.payroll?.totalPayableAmount || 0).toLocaleString('vi-VN')} đ
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Trạng thái: {kpiSummary.payroll?.status || 'DRAFT'}
            </div>
          </div>
        </div>
      )}

      {/* Khu vực điều khiển phiên LIVE hiện tại */}
      {!activeSession ? (
        <form
          onSubmit={handleCheckIn}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-white">Bắt đầu phiên LIVE mới (Check-in)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Hình thức LIVE</label>
              <select
                value={liveType}
                onChange={(e) => {
                  setLiveType(e.target.value);
                  setSelectedTargetId('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                <option value="GROUP">LIVE Ca Nhóm</option>
                <option value="SOLO">LIVE Đơn (Cá nhân)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                {liveType === 'GROUP'
                  ? 'Chọn ca nhóm đã đăng ký'
                  : 'Chọn lịch LIVE đơn đã đăng ký'}
              </label>
              <select
                required
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                <option value="">-- Chọn lịch hợp lệ --</option>
                {liveType === 'GROUP'
                  ? myShifts.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.shiftDate?.slice(0, 10)} • {s.shiftSlotId?.name} (
                        {s.shiftSlotId?.startTime}-{s.shiftSlotId?.endTime}){' '}
                        {s.isHost ? '[HOST CA]' : ''}
                      </option>
                    ))
                  : mySoloSchedules.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.scheduleDate?.slice(0, 10)} • Tuần {s.weekNumber} (
                        {s.plannedDurationMinutes} phút)
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Link phòng LIVE TikTok (Tùy chọn)
              </label>
              <input
                type="url"
                value={tiktokLiveUrl}
                onChange={(e) => setTiktokLiveUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" /> Bắt đầu LIVE (Chốt giờ Server)
          </button>
        </form>
      ) : activeSession.status === 'LIVE' ? (
        <div className="bg-gradient-to-r from-rose-950/60 to-slate-900 border border-rose-500/40 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold">
              <Radio className="w-3.5 h-3.5 animate-ping" /> ĐANG PHÁT SÓNG ({activeSession.liveType})
              {activeSession.isHostSession && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px]">
                  HOST CA
                </span>
              )}
            </div>
            <div className="text-3xl font-mono font-extrabold text-white tracking-wider pt-1">
              {formatSeconds(elapsedSeconds)}
            </div>
            <p className="text-xs text-slate-300">
              Bắt đầu lúc: {new Date(activeSession.actualStartTime).toLocaleTimeString('vi-VN')}
            </p>
          </div>

          <button
            onClick={handleCheckOut}
            className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Square className="w-4 h-4" /> Kết thúc LIVE (Check-out)
          </button>
        </div>
      ) : (
        /* Trạng thái WAITING_EVIDENCE: Nộp ảnh bằng chứng & AI tự điền báo cáo số liệu */
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Hoàn tất phiên LIVE ({activeSession.actualDurationMinutes} phút) — Nộp ảnh bằng
                chứng & Báo cáo
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Chọn ảnh chụp màn hình thống kê sau buổi LIVE, AI sẽ tự động đọc và điền các thông
                số vào biểu mẫu bên dưới.
              </p>
            </div>
            {activeSession.isHostSession && (
              <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center gap-1">
                <Crown className="w-4 h-4" /> Trách nhiệm Host Ca
              </span>
            )}
          </div>

          {/* Bước 1: Tải ảnh bằng chứng & AI trích xuất */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-200">
              Bước 1: Chọn ảnh chụp báo cáo số liệu (JPG, PNG, WEBP ≤ 5MB)
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  setEvidenceFile(file);
                  setAiExtractNote('');
                  if (file) {
                    handleUploadEvidence(file);
                  }
                }}
                className="text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-slate-800 file:text-white hover:file:bg-slate-700 cursor-pointer"
              />
              <button
                type="button"
                disabled={uploading || !evidenceFile}
                onClick={() => handleUploadEvidence()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI đang đọc thông số...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" /> Tải ảnh lên & AI điền số liệu
                  </>
                )}
              </button>
            </div>

            {aiExtractNote && (
              <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl">
                <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{aiExtractNote}</span>
              </div>
            )}

            {activeSession.evidences?.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-2">
                {activeSession.evidences.map((ev) => (
                  <a
                    key={ev._id}
                    href={resolveAssetUrl(ev.imageUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-24 h-24 rounded-lg overflow-hidden border border-emerald-500/50"
                  >
                    <img
                      src={resolveAssetUrl(ev.imageUrl)}
                      alt="Bằng chứng"
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Bước 2: Form báo cáo số liệu (AI tự điền) */}
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Số phút thực tế</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={reportForm.reportedMinutes}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, reportedMinutes: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-sm text-white ${
                    aiExtractNote ? 'border-emerald-500/50' : 'border-slate-800'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tổng lượt xem</label>
                <input
                  type="number"
                  min={0}
                  value={reportForm.totalViewers}
                  onChange={(e) => setReportForm({ ...reportForm, totalViewers: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-sm text-white ${
                    aiExtractNote ? 'border-emerald-500/50' : 'border-slate-800'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Mắt xem cao nhất (Peak)</label>
                <input
                  type="number"
                  min={0}
                  value={reportForm.peakConcurrentViewers}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, peakConcurrentViewers: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-sm text-white ${
                    aiExtractNote ? 'border-emerald-500/50' : 'border-slate-800'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kim cương / Điểm KPI</label>
                <input
                  type="number"
                  min={0}
                  value={reportForm.diamondsOrPoints}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, diamondsOrPoints: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-sm text-white ${
                    aiExtractNote ? 'border-emerald-500/50' : 'border-slate-800'
                  }`}
                />
              </div>
            </div>

            {activeSession.isHostSession && (
              <div>
                <label className="block text-xs font-semibold text-amber-300 mb-1">
                  Báo cáo tổng kết ca của Host ca (Bắt buộc)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reportForm.hostSummaryNote}
                  onChange={(e) =>
                    setReportForm({ ...reportForm, hostSummaryNote: e.target.value })
                  }
                  placeholder="Ghi nhận tình hình thành viên tham gia ca nhóm, sự cố kỹ thuật (nếu có)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-sm text-white"
                />
              </div>
            )}

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" /> Gửi báo cáo cho Vận hành duyệt
            </button>
          </form>
        </div>
      )}

      {/* Lịch sử phiên LIVE trong kỳ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-base font-bold text-white mb-4">Lịch sử phiên LIVE & Đối soát KPI</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 px-3">Loại</th>
                <th className="py-3 px-3">Thời gian thực tế</th>
                <th className="py-3 px-3">Thời lượng duyệt</th>
                <th className="py-3 px-3">Bằng chứng</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-3 text-right">Đối soát</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {sessionHistory.map((item) => (
                <tr key={item._id}>
                  <td className="py-3 px-3 font-medium">
                    {item.liveType === 'GROUP'
                      ? item.shiftRegistrationId?.shiftSlotId?.name || 'Ca Nhóm'
                      : 'LIVE Đơn'}
                    {item.isHostSession && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                        HOST
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-300">
                    <Clock className="w-3 h-3 inline mr-1 text-slate-400" />
                    {new Date(item.actualStartTime).toLocaleString('vi-VN')} (
                    {item.actualDurationMinutes}p)
                  </td>
                  <td className="py-3 px-3 font-semibold text-emerald-400">
                    {item.approvedDurationMinutes} phút
                  </td>
                  <td className="py-3 px-3">
                    {item.evidences?.[0] ? (
                      <a
                        href={resolveAssetUrl(item.evidences[0].imageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline"
                      >
                        Xem ảnh ({item.evidences.length})
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Chưa có</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        item.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : item.status === 'PENDING_REVIEW'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.rejectOrViolationReason && (
                      <div className="text-[11px] text-rose-400 mt-0.5">
                        {item.rejectOrViolationReason}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() =>
                        setComplaintModal({ open: true, sessionId: item._id, reason: '' })
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquareWarning className="w-3.5 h-3.5 text-amber-400" /> Khiếu nại
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal gửi khiếu nại */}
      {complaintModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateComplaint}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Gửi khiếu nại đối soát phiên LIVE</h3>
            <textarea
              required
              rows={4}
              value={complaintModal.reason}
              onChange={(e) => setComplaintModal({ ...complaintModal, reason: e.target.value })}
              placeholder="Mô tả chi tiết sai lệch giờ LIVE, ảnh bằng chứng hoặc KPI..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComplaintModal({ open: false, sessionId: null, reason: '' })}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold cursor-pointer"
              >
                Gửi khiếu nại
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}