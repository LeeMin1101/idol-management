import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  Calendar,
  CalendarRange,
  Crown,
  RefreshCw,
  Plus,
  Trash2,
  UserX,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Sparkles,
} from 'lucide-react';
import axiosClient from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';

const COLOR_STYLES = {
  blue: 'bg-blue-500/15 border-blue-500/40 text-blue-200',
  red: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
  pink: 'bg-pink-500/15 border-pink-500/40 text-pink-200',
  purple: 'bg-purple-500/15 border-purple-500/40 text-purple-200',
  default: 'bg-slate-800 border-slate-700 text-slate-200',
};

const HEADER_BADGE = {
  blue: 'bg-blue-600 text-white',
  red: 'bg-rose-600 text-white',
  pink: 'bg-pink-600 text-white',
  purple: 'bg-purple-600 text-white',
  default: 'bg-slate-700 text-white',
};

const WEEKDAY_LABELS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const toDateKeyUTC = (dateObj) => {
  const d = new Date(dateObj);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
};

const getCurrentMonthCodeVN = () => {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getTodayDateKeyVN = () => {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-${String(
    vnNow.getUTCDate()
  ).padStart(2, '0')}`;
};

export default function ShiftBoard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState('GROUP'); // 'GROUP' | 'SWAPS' | 'SOLO'
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [activeMonthCode, setActiveMonthCode] = useState(() => getCurrentMonthCodeVN());
  const [weekFilter, setWeekFilter] = useState('ALL'); // 'ALL' | '1' | '2' | '3' | '4' | '5'

  const [slots, setSlots] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [soloSchedules, setSoloSchedules] = useState([]);
  const [idolList, setIdolList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Đăng ký nhanh cả tháng (Idol)
  const [bulkMonthModal, setBulkMonthModal] = useState({
    open: false,
    shiftSlotId: '',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    submitting: false,
  });

  // Modal Xin đổi ca (Idol)
  const [swapModal, setSwapModal] = useState({
    open: false,
    currentReg: null,
    targetShiftSlotId: '',
    targetDate: '',
    targetIdolId: '',
    reason: '',
  });

  // Modal Admin phân công & chỉ định Host ca
  const [assignModal, setAssignModal] = useState({
    open: false,
    shiftSlot: null,
    shiftDate: '',
    idolId: '',
    isHost: false,
  });

  // Form đăng ký LIVE đơn (Idol)
  const [soloForm, setSoloForm] = useState({
    scheduleDate: getTodayDateKeyVN(),
    startTime: '14:00',
    endTime: '15:30',
  });

  const activePeriod = useMemo(
    () => periods.find((p) => p._id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  const monthDays = useMemo(() => {
    if (!activePeriod?.startDate || !activePeriod?.endDate) return [];
    const start = new Date(activePeriod.startDate);
    const end = new Date(activePeriod.endDate);
    const list = [];

    for (
      let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const d = new Date(cursor);
      const dayOfMonth = d.getUTCDate();
      const weekOfMonth = Math.ceil(dayOfMonth / 7);
      list.push({
        dateObj: d,
        dateKey: toDateKeyUTC(d),
        weekdayIndex: d.getUTCDay(),
        weekOfMonth,
        label: `${WEEKDAY_LABELS[d.getUTCDay()]} • ${String(dayOfMonth).padStart(2, '0')}/${String(
          d.getUTCMonth() + 1
        ).padStart(2, '0')}`,
      });
    }
    return list;
  }, [activePeriod]);

  const visibleDays = useMemo(() => {
    if (weekFilter === 'ALL') return monthDays;
    return monthDays.filter((d) => d.weekOfMonth === Number(weekFilter));
  }, [monthDays, weekFilter]);

  const initMeta = useCallback(async () => {
    try {
      const res = await axiosClient.get('/work-periods');
      const list = res.data || [];
      setPeriods(list);

      const currentMonthPeriod = list.find((p) => p.isCurrentMonth) || list[0];
      if (currentMonthPeriod) {
        setSelectedPeriodId(currentMonthPeriod._id);
      }

      if (isAdmin) {
        const idolRes = await axiosClient.get('/admin/idols?limit=100');
        setIdolList(idolRes.data?.items || []);
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [isAdmin]);

  useEffect(() => {
    initMeta();
  }, [initMeta]);

  // Tự động reset sang bảng đăng ký tháng mới khi đồng hồ bước sang tháng tiếp theo
  useEffect(() => {
    const interval = setInterval(() => {
      const latestMonthCode = getCurrentMonthCodeVN();
      if (latestMonthCode !== activeMonthCode) {
        setActiveMonthCode(latestMonthCode);
        setWeekFilter('ALL');
        toast.info(`Đã bước sang tháng mới (${latestMonthCode}) — Bảng đăng ký ca đã được làm mới!`);
        initMeta();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [activeMonthCode, initMeta]);

  const loadBoardData = useCallback(async () => {
    if (!selectedPeriodId || monthDays.length === 0) return;
    setLoading(true);
    try {
      const startDate = monthDays[0].dateKey;
      const endDate = monthDays[monthDays.length - 1].dateKey;

      const [boardResult, swapResult, soloResult] = await Promise.allSettled([
        axiosClient.get(
          `/shifts/board?workPeriodId=${selectedPeriodId}&startDate=${startDate}&endDate=${endDate}`
        ),
        axiosClient.get(`/shift-changes?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/solo-schedules?workPeriodId=${selectedPeriodId}`),
      ]);

      if (boardResult.status === 'fulfilled') {
        setSlots(boardResult.value.data?.slots || []);
        setRegistrations(boardResult.value.data?.registrations || []);
      } else {
        toast.error(boardResult.reason?.message || 'Không tải được bảng lịch ca');
      }

      if (swapResult.status === 'fulfilled') {
        setChangeRequests(swapResult.value.data || []);
      }

      if (soloResult.status === 'fulfilled') {
        setSoloSchedules(soloResult.value.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, monthDays]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  const handleSelfRegister = async (shiftSlotId, shiftDate) => {
    try {
      await axiosClient.post('/shifts/register', {
        workPeriodId: selectedPeriodId,
        shiftSlotId,
        shiftDate,
      });
      toast.success('Đăng ký ca nhóm thành công!');
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleBulkMonthSubmit = async (e) => {
    e.preventDefault();
    if (!bulkMonthModal.shiftSlotId) {
      return toast.error('Vui lòng chọn khung giờ ca');
    }
    if (bulkMonthModal.weekdays.length === 0) {
      return toast.error('Vui lòng chọn ít nhất 1 ngày trong tuần');
    }

    setBulkMonthModal((prev) => ({ ...prev, submitting: true }));
    try {
      const res = await axiosClient.post('/shifts/register-month', {
        workPeriodId: selectedPeriodId,
        shiftSlotId: bulkMonthModal.shiftSlotId,
        weekdays: bulkMonthModal.weekdays,
      });
      toast.success(res.message || 'Đã đăng ký ca cả tháng thành công!');
      setBulkMonthModal({
        open: false,
        shiftSlotId: '',
        weekdays: [1, 2, 3, 4, 5, 6, 0],
        submitting: false,
      });
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
      setBulkMonthModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const toggleBulkWeekday = (dayIdx) => {
    setBulkMonthModal((prev) => {
      const exists = prev.weekdays.includes(dayIdx);
      return {
        ...prev,
        weekdays: exists
          ? prev.weekdays.filter((d) => d !== dayIdx)
          : [...prev.weekdays, dayIdx],
      };
    });
  };

  const handleCancelShift = async (regId, dateKey, slotName) => {
    if (!window.confirm(`Xác nhận hủy đăng ký ${slotName} ngày ${dateKey}?`)) return;
    try {
      await axiosClient.delete(`/shifts/${regId}`);
      toast.info('Đã hủy ca đăng ký');
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAdminAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.post('/shifts/admin-assign', {
        workPeriodId: selectedPeriodId,
        idolId: assignModal.idolId,
        shiftSlotId: assignModal.shiftSlot._id,
        shiftDate: assignModal.shiftDate,
        isHost: assignModal.isHost,
      });
      toast.success('Đã phân công ca thành công');
      setAssignModal({ open: false, shiftSlot: null, shiftDate: '', idolId: '', isHost: false });
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleMarkAbsent = async (regId, idolName) => {
    const reason = window.prompt(`Xác nhận đánh dấu VẮNG MẶT (OFF) cho ${idolName}. Nhập lý do:`);
    if (reason === null) return;
    try {
      await axiosClient.patch(`/shifts/${regId}/absent`, {
        reason: reason || 'Vắng mặt không xuất hiện tại ca đã đăng ký',
      });
      toast.warning(`Đã ghi nhận ${idolName} vắng mặt (OFF)`);
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateSwapRequest = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.post('/shift-changes', {
        currentRegistrationId: swapModal.currentReg._id,
        targetShiftSlotId: swapModal.targetShiftSlotId,
        targetDate: swapModal.targetDate,
        targetIdolId: swapModal.targetIdolId || null,
        reason: swapModal.reason,
      });
      toast.success('Đã gửi yêu cầu đổi ca tới Vận hành');
      setSwapModal({
        open: false,
        currentReg: null,
        targetShiftSlotId: '',
        targetDate: '',
        targetIdolId: '',
        reason: '',
      });
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReviewSwap = async (requestId, action) => {
    const reviewNote =
      action === 'REJECTED'
        ? window.prompt('Nhập lý do từ chối yêu cầu đổi ca:') || ''
        : 'Đã duyệt điều phối';
    try {
      await axiosClient.put(`/shift-changes/${requestId}/review`, { action, reviewNote });
      toast.success(
        action === 'APPROVED' ? 'Đã duyệt đổi ca (giữ màu ca gốc)' : 'Đã từ chối yêu cầu đổi ca'
      );
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRegisterSolo = async (e) => {
    e.preventDefault();
    try {
      const plannedStartTime = `${soloForm.scheduleDate}T${soloForm.startTime}:00.000Z`;
      const plannedEndTime = `${soloForm.scheduleDate}T${soloForm.endTime}:00.000Z`;
      await axiosClient.post('/solo-schedules', {
        workPeriodId: selectedPeriodId,
        scheduleDate: soloForm.scheduleDate,
        plannedStartTime,
        plannedEndTime,
      });
      toast.success('Đăng ký lịch LIVE đơn thành công!');
      loadBoardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const pendingSwapsCount = changeRequests.filter((c) => c.status === 'PENDING').length;
  const isPeriodOpen = activePeriod?.status !== 'LOCKED' && activePeriod?.registrationOpen;

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Bộ chọn Kỳ làm việc */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Điều phối Lịch Ca Cả Tháng & LIVE Đơn
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Mở đăng ký trọn cả tháng • Tự động reset sang bảng mới khi qua tháng khác • Tối đa{' '}
            {activePeriod?.defaultMaxSlots || 8} slot/ca
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isAdmin && isPeriodOpen && slots.length > 0 && (
            <button
              onClick={() =>
                setBulkMonthModal({
                  open: true,
                  shiftSlotId: slots[0]?._id || '',
                  weekdays: [1, 2, 3, 4, 5, 6, 0],
                  submitting: false,
                })
              }
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarRange className="w-4 h-4" /> Đăng ký nhanh cả tháng
            </button>
          )}

          <select
            value={selectedPeriodId}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value);
              setWeekFilter('ALL');
            }}
            className="bg-slate-950 border border-slate-700 text-sm text-white px-3.5 py-2 rounded-xl"
          >
            {periods.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} {p.isCurrentMonth ? '(Tháng hiện tại)' : ''} —{' '}
                {p.status === 'LOCKED'
                  ? 'Đã khóa'
                  : p.registrationOpen
                  ? 'Đang mở ĐK'
                  : 'Đã đóng ĐK'}
              </option>
            ))}
          </select>

          {!isPeriodOpen && activePeriod && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium">
              <Lock className="w-3.5 h-3.5" />
              {activePeriod.status === 'LOCKED' ? 'Kỳ đã khóa' : 'Đã đóng đăng ký'}
            </span>
          )}
        </div>
      </div>

      {/* Tabs chuyển đổi nghiệp vụ */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('GROUP')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
            activeTab === 'GROUP'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          Bảng Lịch Ca Nhóm ({monthDays.length} ngày)
        </button>

        <button
          onClick={() => setActiveTab('SWAPS')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'SWAPS'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Yêu cầu Đổi ca
          {pendingSwapsCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-rose-600 text-white">
              {pendingSwapsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SOLO')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'SOLO'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Lịch LIVE Đơn (≥ 60 phút)
        </button>
      </div>

      {/* TAB 1: BẢNG LỊCH CA NHÓM CẢ THÁNG */}
      {activeTab === 'GROUP' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `Cả tháng (${monthDays.length} ngày)` },
                { id: '1', label: 'Tuần 1 (01-07)' },
                { id: '2', label: 'Tuần 2 (08-14)' },
                { id: '3', label: 'Tuần 3 (15-21)' },
                { id: '4', label: 'Tuần 4 (22-28)' },
                { id: '5', label: 'Cuối tháng (29-31)' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setWeekFilter(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                    weekFilter === item.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {loading && <span className="text-xs text-indigo-400">Đang đồng bộ lịch tháng...</span>}
          </div>

          <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80">
                  <th className="sticky left-0 z-20 bg-slate-950 p-3.5 text-left text-xs font-semibold text-slate-300 min-w-[165px] border-r border-slate-800">
                    Khung Giờ Ca
                  </th>
                  {visibleDays.map((day) => {
                    const isOff = activePeriod?.offWeekdays?.includes(day.weekdayIndex);
                    return (
                      <th
                        key={day.dateKey}
                        className={`p-3 text-center text-xs font-semibold border-l border-slate-800 min-w-[160px] ${
                          isOff ? 'bg-rose-950/25 text-rose-300' : 'text-slate-200'
                        }`}
                      >
                        <div>{day.label}</div>
                        {isOff && (
                          <span className="text-[10px] uppercase tracking-wider text-rose-400">
                            Nghỉ nhóm
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleDays.length + 1}
                      className="p-8 text-center text-sm text-slate-400"
                    >
                      {loading
                        ? 'Đang tải danh sách khung giờ ca...'
                        : 'Chưa có khung giờ ca nhóm nào được cấu hình. Vui lòng liên hệ Admin tạo các khung giờ ca (Ca Sáng, Ca Chiều, Ca Tối...).'}
                    </td>
                  </tr>
                ) : (
                  slots.map((slot) => (
                    <tr key={slot._id} className="border-b border-slate-800/80 align-top">
                      <td className="sticky left-0 z-10 bg-slate-900 p-3.5 border-r border-slate-800">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
                            HEADER_BADGE[slot.colorCode] || HEADER_BADGE.default
                          }`}
                        >
                          {slot.name}
                        </span>
                        <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {slot.startTime} - {slot.endTime}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Tối đa {slot.maxSlots} slot
                        </div>
                      </td>

                      {visibleDays.map((day) => {
                        const isOff = activePeriod?.offWeekdays?.includes(day.weekdayIndex);
                        const cellRegs = registrations.filter(
                          (r) =>
                            String(r.shiftSlotId?._id || r.shiftSlotId) === String(slot._id) &&
                            toDateKeyUTC(r.shiftDate) === day.dateKey
                        );
                        const myReg = cellRegs.find(
                          (r) => String(r.idolId?._id || r.idolId) === String(user?._id)
                        );
                        const isFull = cellRegs.length >= (slot.maxSlots || 8);
                        const canRegister = !isAdmin && !isOff && !myReg && !isFull && isPeriodOpen;

                        return (
                          <td
                            key={day.dateKey}
                            className={`p-2.5 border-l border-slate-800 min-w-[160px] ${
                              isOff ? 'bg-slate-950/50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                              <span>
                                Slot: {cellRegs.length}/{slot.maxSlots}
                              </span>
                              {isFull && <span className="text-amber-400 font-semibold">Đầy</span>}
                            </div>

                            <div className="space-y-1.5">
                              {cellRegs.map((reg) => {
                                const displayColor =
                                  reg.isSwapped && reg.originalColorCode
                                    ? reg.originalColorCode
                                    : slot.colorCode;
                                const isOwn =
                                  String(reg.idolId?._id || reg.idolId) === String(user?._id);

                                return (
                                  <div
                                    key={reg._id}
                                    className={`p-2 rounded-xl border text-xs transition ${
                                      reg.status === 'ABSENT'
                                        ? 'bg-rose-950/40 border-rose-700/60 text-rose-300 opacity-80'
                                        : COLOR_STYLES[displayColor] || COLOR_STYLES.default
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 font-semibold">
                                      <span className="truncate">
                                        #{reg.slotNumber} {reg.idolId?.name || 'Idol'}
                                      </span>
                                      {reg.isHost && (
                                        <span
                                          title="Host ca chịu trách nhiệm báo cáo tổng kết"
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold shrink-0"
                                        >
                                          <Crown className="w-2.5 h-2.5" /> HOST
                                        </span>
                                      )}
                                    </div>

                                    {reg.isSwapped && (
                                      <div className="text-[10px] opacity-85 mt-0.5">
                                        ⇄ Đổi từ {reg.originalShiftSlotId?.name || 'ca gốc'}
                                      </div>
                                    )}

                                    {reg.status === 'ABSENT' && (
                                      <div className="text-[10px] font-bold text-rose-400 mt-0.5">
                                        ● OFF (Vắng mặt)
                                      </div>
                                    )}

                                    {/* Nút xin đổi ca & hủy ca cho chính Idol sở hữu */}
                                    {isOwn &&
                                      reg.status === 'APPROVED' &&
                                      activePeriod?.status !== 'LOCKED' && (
                                        <div className="mt-1.5 flex gap-1">
                                          <button
                                            onClick={() =>
                                              setSwapModal({
                                                open: true,
                                                currentReg: reg,
                                                targetShiftSlotId: slots[0]?._id || '',
                                                targetDate: day.dateKey,
                                                targetIdolId: '',
                                                reason: '',
                                              })
                                            }
                                            className="flex-1 py-1 px-1.5 rounded-lg bg-slate-950/60 hover:bg-slate-950 text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                                          >
                                            <RefreshCw className="w-3 h-3" /> Đổi ca
                                          </button>

                                          {isPeriodOpen && !reg.liveSessionId && (
                                            <button
                                              onClick={() =>
                                                handleCancelShift(reg._id, day.dateKey, slot.name)
                                              }
                                              title="Hủy ca đã đăng ký"
                                              className="py-1 px-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-[11px] flex items-center justify-center cursor-pointer"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}

                                    {/* Nút Admin đánh dấu vắng mặt OFF */}
                                    {isAdmin &&
                                      reg.status === 'APPROVED' &&
                                      activePeriod?.status !== 'LOCKED' && (
                                        <button
                                          onClick={() =>
                                            handleMarkAbsent(reg._id, reg.idolId?.name)
                                          }
                                          className="mt-1.5 w-full py-1 px-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                          <UserX className="w-3 h-3" /> Đánh dấu OFF
                                        </button>
                                      )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Nút tự đăng ký cho Idol */}
                            {canRegister && (
                              <button
                                onClick={() => handleSelfRegister(slot._id, day.dateKey)}
                                className="mt-2 w-full py-1.5 px-2 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 text-xs text-slate-300 hover:text-indigo-300 flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" /> Đăng ký
                              </button>
                            )}

                            {/* Nút Admin phân công / chỉ định Host */}
                            {isAdmin && !isOff && !isFull && activePeriod?.status !== 'LOCKED' && (
                              <button
                                onClick={() =>
                                  setAssignModal({
                                    open: true,
                                    shiftSlot: slot,
                                    shiftDate: day.dateKey,
                                    idolId: idolList[0]?._id || '',
                                    isHost: false,
                                  })
                                }
                                className="mt-2 w-full py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-xs text-slate-300 hover:text-white flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" /> Phân công
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DANH SÁCH YÊU CẦU ĐỔI CA */}
      {activeTab === 'SWAPS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-bold text-white">Danh sách yêu cầu đổi ca trong tháng</h2>
          {changeRequests.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có yêu cầu đổi ca nào.</p>
          ) : (
            <div className="space-y-3">
              {changeRequests.map((req) => (
                <div
                  key={req._id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-white">
                      Idol: <span className="text-indigo-400">{req.requesterIdolId?.name}</span> • Từ{' '}
                      <span className="text-amber-300">
                        {req.currentRegistrationId?.shiftSlotId?.name}
                      </span>{' '}
                      →{' '}
                      <span className="text-emerald-400">{req.targetShiftSlotId?.name}</span> (Ngày{' '}
                      {toDateKeyUTC(req.targetDate)})
                    </div>
                    <p className="text-xs text-slate-400">Lý do: {req.reason}</p>
                    {req.reviewNote && (
                      <p className="text-xs text-slate-300">Phản hồi Vận hành: {req.reviewNote}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        req.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300'
                          : req.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {req.status}
                    </span>

                    {isAdmin && req.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleReviewSwap(req._id, 'APPROVED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                        </button>
                        <button
                          onClick={() => handleReviewSwap(req._id, 'REJECTED')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LỊCH LIVE ĐƠN */}
      {activeTab === 'SOLO' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {!isAdmin && (
            <form
              onSubmit={handleRegisterSolo}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <h3 className="text-base font-bold text-white">Đăng ký phiên LIVE Đơn</h3>
              <p className="text-xs text-slate-400">
                Yêu cầu tài khoản đã được cấp quyền LIVE đơn và thời lượng tối thiểu 60 phút/phiên.
              </p>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Ngày LIVE</label>
                <input
                  type="date"
                  required
                  value={soloForm.scheduleDate}
                  onChange={(e) => setSoloForm({ ...soloForm, scheduleDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Giờ bắt đầu</label>
                  <input
                    type="time"
                    required
                    value={soloForm.startTime}
                    onChange={(e) => setSoloForm({ ...soloForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Giờ kết thúc</label>
                  <input
                    type="time"
                    required
                    value={soloForm.endTime}
                    onChange={(e) => setSoloForm({ ...soloForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer"
              >
                Xác nhận đăng ký LIVE Đơn
              </button>
            </form>
          )}

          <div
            className={`${
              isAdmin ? 'lg:col-span-3' : 'lg:col-span-2'
            } bg-slate-900 border border-slate-800 rounded-2xl p-5`}
          >
            <h3 className="text-base font-bold text-white mb-4">
              Danh sách lịch LIVE Đơn đã đăng ký
            </h3>
            {soloSchedules.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có lịch LIVE đơn nào trong tháng này.</p>
            ) : (
              <div className="space-y-2.5">
                {soloSchedules.map((s) => (
                  <div
                    key={s._id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-sm"
                  >
                    <div>
                      <span className="font-semibold text-indigo-400">{s.idolId?.name}</span> • Tuần{' '}
                      {s.weekNumber} • Ngày {toDateKeyUTC(s.scheduleDate)}
                      <div className="text-xs text-slate-400 mt-0.5">
                        Thời lượng đăng ký: {s.plannedDurationMinutes} phút
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-semibold">
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL ĐĂNG KÝ NHANH CẢ THÁNG (IDOL) */}
      {bulkMonthModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleBulkMonthSubmit}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-emerald-400" />
              Đăng ký ca trọn cả tháng ({activePeriod?.name})
            </h3>
            <p className="text-xs text-slate-400">
              Hệ thống tự động điền ca vào tất cả các ngày khả dụng còn lại trong tháng (bỏ qua ngày
              đã đăng ký, ngày nghỉ hoặc ca đã đầy).
            </p>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Chọn khung giờ ca cố định</label>
              <select
                required
                value={bulkMonthModal.shiftSlotId}
                onChange={(e) =>
                  setBulkMonthModal({ ...bulkMonthModal, shiftSlotId: e.target.value })
                }
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {slots.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-2">
                Áp dụng cho các thứ trong tuần
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                  const active = bulkMonthModal.weekdays.includes(dayIdx);
                  return (
                    <button
                      key={dayIdx}
                      type="button"
                      onClick={() => toggleBulkWeekday(dayIdx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        active
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {WEEKDAY_LABELS[dayIdx]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setBulkMonthModal({
                    open: false,
                    shiftSlotId: '',
                    weekdays: [1, 2, 3, 4, 5, 6, 0],
                    submitting: false,
                  })
                }
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={bulkMonthModal.submitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs text-white font-semibold cursor-pointer"
              >
                {bulkMonthModal.submitting ? 'Đang đăng ký...' : 'Xác nhận đăng ký cả tháng'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL XIN ĐỔI CA (IDOL) */}
      {swapModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateSwapRequest}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Gửi yêu cầu đổi ca nhóm</h3>
            <p className="text-xs text-slate-400">
              Hệ thống sẽ tự động giữ nguyên màu sắc ca gốc trên bảng lịch sau khi Vận hành phê
              duyệt.
            </p>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Ngày muốn đổi sang</label>
              <input
                type="date"
                required
                value={swapModal.targetDate}
                onChange={(e) => setSwapModal({ ...swapModal, targetDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Khung giờ ca muốn chuyển sang
              </label>
              <select
                required
                value={swapModal.targetShiftSlotId}
                onChange={(e) =>
                  setSwapModal({ ...swapModal, targetShiftSlotId: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {slots.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Lý do đổi ca (Bắt buộc)</label>
              <textarea
                required
                rows={3}
                value={swapModal.reason}
                onChange={(e) => setSwapModal({ ...swapModal, reason: e.target.value })}
                placeholder="Trình bày lý do để Admin xét duyệt..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSwapModal({ ...swapModal, open: false })}
                className="px-4 py-2 rounded-xl bg-slate-800 text-sm text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold cursor-pointer"
              >
                Gửi yêu cầu
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL ADMIN PHÂN CÔNG & CHỈ ĐỊNH HOST */}
      {assignModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAdminAssignSubmit}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">
              Phân công {assignModal.shiftSlot?.name} ({assignModal.shiftDate})
            </h3>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Chọn Idol</label>
              <select
                required
                value={assignModal.idolId}
                onChange={(e) => setAssignModal({ ...assignModal, idolId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              >
                {idolList.map((idol) => (
                  <option key={idol._id} value={idol._id}>
                    {idol.name} ({idol.idolCode || idol.username})
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={assignModal.isHost}
                onChange={(e) => setAssignModal({ ...assignModal, isHost: e.target.checked })}
                className="rounded border-slate-700"
              />
              Chỉ định làm Host ca (Chịu trách nhiệm báo cáo tổng kết ca)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setAssignModal({
                    open: false,
                    shiftSlot: null,
                    shiftDate: '',
                    idolId: '',
                    isHost: false,
                  })
                }
                className="px-4 py-2 rounded-xl bg-slate-800 text-sm text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold cursor-pointer"
              >
                Xác nhận phân công
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}