import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { LayoutDashboard, Lock, Unlock, Plus, History } from 'lucide-react';
import axiosClient from '../../api/axiosClient';
export default function AdminDashboard() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [stats, setStats] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  const [newPeriodModal, setNewPeriodModal] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    code: '',
    name: '',
    startDate: '',
    endDate: '',
    groupHourlyRate: 50000,
    defaultMaxSlots: 8,
    maxGroupShiftsPerDay: 1,
  });

  const loadPeriods = useCallback(async () => {
    try {
      const res = await axiosClient.get('/work-periods');
      const list = res.data || [];
      setPeriods(list);
      if (list.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(list[0]._id);
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    Promise.all([
      axiosClient.get(`/dashboard/admin?workPeriodId=${selectedPeriodId}`),
      axiosClient.get('/admin/audit-logs?limit=15'),
    ])
      .then(([dashRes, logRes]) => {
        setStats(dashRes.data);
        setAuditLogs(logRes.data?.items || []);
      })
      .catch((err) => toast.error(err.message));
  }, [selectedPeriodId]);

  const handleCreatePeriod = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.post('/work-periods', periodForm);
      toast.success('Đã tạo kỳ làm việc mới!');
      setNewPeriodModal(false);
      loadPeriods();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleLockPeriod = async (period) => {
    const isLocked = period.status === 'LOCKED';
    const reason = window.prompt(`Nhập lý do ${isLocked ? 'MỞ KHÓA' : 'KHÓA'} kỳ ${period.name}:`);
    if (!reason) return;
    try {
      await axiosClient.patch(`/work-periods/${period._id}/${isLocked ? 'unlock' : 'lock'}`, { reason });
      toast.success(`Đã ${isLocked ? 'mở khóa' : 'khóa'} kỳ ${period.name}`);
      loadPeriods();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-400" />
            Tổng Quan Vận Hành & Cấu Hình Kỳ
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Giám sát trực tuyến Idol đang phát sóng, phiên chờ duyệt KPI và nhật ký thao tác hệ thống
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            onClick={() => setNewPeriodModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tạo kỳ mới
          </button>
        </div>
      </div>

      {/* Cards thống kê */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Idol đang hoạt động</div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.activeIdols} / {stats.totalIdols}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Đang phát sóng LIVE</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{stats.currentlyLiveCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Phiên chờ duyệt KPI</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{stats.pendingReviewCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="text-xs text-slate-400">Tổng giờ LIVE đã duyệt</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.totalApprovedHours}h</div>
          </div>
        </div>
      )}

      {/* Danh sách Kỳ làm việc */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Danh sách Kỳ làm việc & Đơn giá cấu hình</h2>
        <div className="space-y-2.5">
          {periods.map((p) => (
            <div
              key={p._id}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-sm"
            >
              <div>
                <span className="font-bold text-white">{p.name}</span> ({p.code}) • Đơn giá nhóm:{' '}
                <span className="text-emerald-400 font-semibold">
                  {(p.groupHourlyRate || 50000).toLocaleString('vi-VN')} đ/h
                </span>{' '}
                • Tối đa {p.defaultMaxSlots} slot/ca
              </div>
              <button
                onClick={() => handleToggleLockPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  p.status === 'LOCKED' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {p.status === 'LOCKED' ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> Mở khóa kỳ
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Khóa kỳ
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Nhật ký Audit Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" /> Nhật ký Audit Logs gần nhất
        </h2>
        <div className="space-y-2 text-xs">
          {auditLogs.map((log) => (
            <div key={log._id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between gap-4">
              <div>
                <span className="font-semibold text-indigo-400">{log.actorUserId?.name || 'System'}</span> thực hiện{' '}
                <span className="font-mono text-amber-300">{log.action}</span> ({log.entityName})
                {log.reason && <span className="text-slate-400"> — {log.reason}</span>}
              </div>
              <span className="text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal tạo kỳ mới */}
      {newPeriodModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreatePeriod}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Tạo kỳ làm việc mới</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Mã kỳ (VD: 2026-12)</label>
                <input
                  type="text"
                  required
                  value={periodForm.code}
                  onChange={(e) => setPeriodForm({ ...periodForm, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  required
                  value={periodForm.name}
                  onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                  placeholder="Tháng 12/2026"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  required
                  value={periodForm.startDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Ngày kết thúc</label>
                <input
                  type="date"
                  required
                  value={periodForm.endDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Đơn giá LIVE nhóm (VNĐ/giờ)</label>
              <input
                type="number"
                required
                value={periodForm.groupHourlyRate}
                onChange={(e) => setPeriodForm({ ...periodForm, groupHourlyRate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewPeriodModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-xs text-white font-semibold cursor-pointer"
              >
                Tạo kỳ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}