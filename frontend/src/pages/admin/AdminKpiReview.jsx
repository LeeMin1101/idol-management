import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calculator,
  Lock,
  Unlock,
  Download,
  Clock,
  Crown,
} from 'lucide-react';
import axiosClient, { resolveAssetUrl } from '../../api/axiosClient';

const toLocalDateTimeInput = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AdminKpiReview() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [subTab, setSubTab] = useState('SESSIONS'); // 'SESSIONS' | 'PAYROLL' | 'COMPLAINTS'

  const [sessions, setSessions] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal chỉnh sửa giờ khi Idol quên check-out
  const [adjustModal, setAdjustModal] = useState({
    open: false,
    session: null,
    actualStartTime: '',
    actualEndTime: '',
    reason: '',
  });

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

  const loadData = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    try {
      const [sessRes, compRes] = await Promise.all([
        axiosClient.get(`/live-sessions?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/complaints?workPeriodId=${selectedPeriodId}`),
      ]);
      setSessions(sessRes.data || []);
      setComplaints(compRes.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReviewSession = async (sessionId, decision, defaultMinutes) => {
    let reason = '';
    let approvedDurationMinutes = defaultMinutes;

    if (decision === 'APPROVED') {
      const inputMin = window.prompt('Xác nhận số phút LIVE hợp lệ được duyệt:', String(defaultMinutes));
      if (inputMin === null) return;
      approvedDurationMinutes = Number(inputMin);
    } else {
      reason = window.prompt(
        decision === 'VIOLATION'
          ? 'Nhập lý do đánh dấu VI PHẠM (sẽ tăng bộ đếm vi phạm Idol):'
          : 'Nhập lý do TỪ CHỐI bằng chứng:'
      );
      if (!reason) return;
    }

    try {
      await axiosClient.put(`/live-sessions/${sessionId}/review`, {
        decision,
        approvedDurationMinutes,
        reason,
      });
      toast.success(`Đã cập nhật trạng thái phiên LIVE: ${decision}`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAdjustTimeSubmit = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.put(`/live-sessions/${adjustModal.session._id}/admin-adjust`, {
        actualStartTime: new Date(adjustModal.actualStartTime).toISOString(),
        actualEndTime: new Date(adjustModal.actualEndTime).toISOString(),
        reason: adjustModal.reason,
      });
      toast.success('Đã cập nhật thời gian phiên LIVE & ghi Audit Log');
      setAdjustModal({ open: false, session: null, actualStartTime: '', actualEndTime: '', reason: '' });
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRunKpiCalculation = async () => {
    try {
      const res = await axiosClient.post('/kpi/calculate', { workPeriodId: selectedPeriodId });
      setPayrollSummary(res.data || []);
      toast.success('Đã chạy KPI Engine & cập nhật bảng công tạm tính!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleFinalizeKpi = async () => {
    if (!window.confirm('Xác nhận CHỐT KPI & Đóng băng số liệu công tháng này?')) return;
    try {
      await axiosClient.post('/kpi/finalize', { workPeriodId: selectedPeriodId });
      toast.success('Đã chốt KPI tháng thành công!');
      handleRunKpiCalculation();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUnlockKpi = async () => {
    const reason = window.prompt('Nhập lý do MỞ KHÓA KPI tháng (sẽ ghi nhật ký hệ thống):');
    if (!reason) return;
    try {
      await axiosClient.post('/kpi/unlock', { workPeriodId: selectedPeriodId, reason });
      toast.warning('Đã mở khóa KPI tháng');
      handleRunKpiCalculation();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      const token = localStorage.getItem('idol_mgmt_token');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${baseUrl}/reports/export-excel?workPeriodId=${selectedPeriodId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Không thể xuất file Excel');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BaoCao_KPI_Cong_${selectedPeriodId}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Đã tải xuống báo cáo Excel (.xlsx)');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResolveComplaint = async (complaintId, status) => {
    const adminResponse = window.prompt('Nhập phản hồi xử lý khiếu nại gửi tới Idol:');
    if (!adminResponse) return;
    try {
      await axiosClient.put(`/complaints/${complaintId}/resolve`, { status, adminResponse });
      toast.success('Đã xử lý phiếu khiếu nại');
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const pendingSessionsCount = sessions.filter((s) => s.status === 'PENDING_REVIEW').length;
  const openComplaintsCount = complaints.filter((c) => c.status === 'OPEN').length;

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white">Duyệt Bằng Chứng KPI, Tính Công & Đối Soát</h1>
          <p className="text-xs text-slate-400 mt-1">
            Kiểm duyệt ảnh báo cáo phiên LIVE, xử lý quên check-out, chạy KPI Engine và xuất báo cáo Excel
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-sm text-white px-3.5 py-2 rounded-xl"
          >
            {periods.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Xuất Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setSubTab('SESSIONS')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
            subTab === 'SESSIONS' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'
          }`}
        >
          Duyệt Phiên LIVE
          {pendingSessionsCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-slate-950 font-bold">
              {pendingSessionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setSubTab('PAYROLL');
            handleRunKpiCalculation();
          }}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
            subTab === 'PAYROLL' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'
          }`}
        >
          <Calculator className="w-4 h-4" /> KPI Engine & Bảng Công
        </button>

        <button
          onClick={() => setSubTab('COMPLAINTS')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
            subTab === 'COMPLAINTS' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'
          }`}
        >
          Khiếu nại Idol
          {openComplaintsCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-rose-600 text-white">{openComplaintsCount}</span>
          )}
        </button>
      </div>

      {/* TAB 1: DUYỆT PHIÊN LIVE & BẰNG CHỨNG */}
      {subTab === 'SESSIONS' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-slate-400">Đang tải danh sách phiên LIVE...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có phiên LIVE nào được ghi nhận trong kỳ.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s._id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-start justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white text-base">{s.idolId?.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs text-indigo-300">
                      {s.liveType === 'GROUP' ? s.shiftRegistrationId?.shiftSlotId?.name || 'Ca Nhóm' : 'LIVE Đơn'}
                    </span>
                    {s.isHostSession && (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold inline-flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> HOST CA
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                        s.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : s.status === 'PENDING_REVIEW'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400">
                    Server ghi nhận: {new Date(s.actualStartTime).toLocaleString('vi-VN')} →{' '}
                    {s.actualEndTime ? new Date(s.actualEndTime).toLocaleTimeString('vi-VN') : 'Chưa check-out'} (
                    <strong className="text-slate-200">{s.actualDurationMinutes} phút</strong>)
                  </div>

                  {s.report?.submittedAt && (
                    <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      Báo cáo: {s.report.reportedMinutes}p • View: {s.report.totalViewers} • Peak:{' '}
                      {s.report.peakConcurrentViewers} • Kim cương: {s.report.diamondsOrPoints}
                      {s.report.hostSummaryNote && (
                        <div className="text-amber-300 mt-1">Ghi chú Host ca: {s.report.hostSummaryNote}</div>
                      )}
                    </div>
                  )}

                  {/* Ảnh bằng chứng */}
                  {s.evidences?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {s.evidences.map((ev) => (
                        <a
                          key={ev._id}
                          href={resolveAssetUrl(ev.imageUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-20 h-20 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500"
                        >
                          <img src={resolveAssetUrl(ev.imageUrl)} alt="Evidence" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nút thao tác Vận hành */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      setAdjustModal({
                        open: true,
                        session: s,
                        actualStartTime: toLocalDateTimeInput(s.actualStartTime),
                        actualEndTime: toLocalDateTimeInput(s.actualEndTime),
                        reason: '',
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" /> Sửa giờ
                  </button>

                  <button
                    onClick={() => handleReviewSession(s._id, 'APPROVED', s.actualDurationMinutes)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt hợp lệ
                  </button>

                  <button
                    onClick={() => handleReviewSession(s._id, 'REJECTED', 0)}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs text-white font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Từ chối
                  </button>

                  <button
                    onClick={() => handleReviewSession(s._id, 'VIOLATION', 0)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs text-white font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Vi phạm
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: KPI ENGINE & BẢNG CÔNG */}
      {subTab === 'PAYROLL' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">Tổng hợp KPI & Bảng công kỳ</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRunKpiCalculation}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" /> Tính lại KPI
              </button>
              <button
                onClick={handleFinalizeKpi}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" /> Chốt KPI tháng
              </button>
              <button
                onClick={handleUnlockKpi}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" /> Mở khóa KPI
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-3 px-3">Idol</th>
                  <th className="py-3 px-3">Ca hoàn thành</th>
                  <th className="py-3 px-3">Ca vắng (OFF)</th>
                  <th className="py-3 px-3">Giờ Nhóm</th>
                  <th className="py-3 px-3">Tiền LIVE Nhóm</th>
                  <th className="py-3 px-3">Giờ Đơn</th>
                  <th className="py-3 px-3">Tổng thực nhận</th>
                  <th className="py-3 px-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {payrollSummary.map((row) => (
                  <tr key={row.idol?._id}>
                    <td className="py-3 px-3 font-semibold text-white">
                      {row.idol?.name}{' '}
                      <span className="text-xs text-slate-400">({row.idol?.idolCode || row.idol?.username})</span>
                    </td>
                    <td className="py-3 px-3">{row.metrics?.completedShiftsCount || 0}</td>
                    <td className="py-3 px-3 text-rose-400">{row.metrics?.absentShiftsCount || 0}</td>
                    <td className="py-3 px-3 text-indigo-300">{row.metrics?.approvedGroupHours || 0}h</td>
                    <td className="py-3 px-3">{(row.payroll?.groupLiveAmount || 0).toLocaleString('vi-VN')} đ</td>
                    <td className="py-3 px-3 text-emerald-300">{row.metrics?.approvedSoloHours || 0}h</td>
                    <td className="py-3 px-3 font-bold text-amber-400">
                      {(row.payroll?.totalPayableAmount || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-xs">{row.payroll?.status || 'DRAFT'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: XỬ LÝ KHIẾU NẠI */}
      {subTab === 'COMPLAINTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-bold text-white">Danh sách khiếu nại từ Idol</h2>
          {complaints.length === 0 ? (
            <p className="text-sm text-slate-400">Không có phiếu khiếu nại nào.</p>
          ) : (
            complaints.map((c) => (
              <div
                key={c._id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    Idol: <span className="text-indigo-400">{c.idolId?.name}</span> • Trạng thái:{' '}
                    <span className="text-amber-300">{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-300">Nội dung: {c.reason}</p>
                  {c.adminResponse && <p className="text-xs text-emerald-400">Phản hồi: {c.adminResponse}</p>}
                </div>
                {c.status === 'OPEN' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolveComplaint(c._id, 'RESOLVED')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs text-white font-semibold cursor-pointer"
                    >
                      Chấp nhận & Phản hồi
                    </button>
                    <button
                      onClick={() => handleResolveComplaint(c._id, 'REJECTED')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-xs text-white font-semibold cursor-pointer"
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal điều chỉnh thời gian quên Check-out */}
      {adjustModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAdjustTimeSubmit}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Điều chỉnh giờ phiên LIVE</h3>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Thời gian bắt đầu</label>
              <input
                type="datetime-local"
                required
                value={adjustModal.actualStartTime}
                onChange={(e) => setAdjustModal({ ...adjustModal, actualStartTime: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Thời gian kết thúc</label>
              <input
                type="datetime-local"
                required
                value={adjustModal.actualEndTime}
                onChange={(e) => setAdjustModal({ ...adjustModal, actualEndTime: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Lý do điều chỉnh (Bắt buộc ghi Audit Log)</label>
              <textarea
                required
                rows={3}
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                placeholder="VD: Idol quên bấm kết thúc ca do rớt mạng, đối chiếu ảnh TikTok Studio..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustModal({ open: false, session: null, actualStartTime: '', actualEndTime: '', reason: '' })}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-xs text-white font-semibold cursor-pointer"
              >
                Lưu điều chỉnh
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}