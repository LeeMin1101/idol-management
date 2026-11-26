import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  CalendarRange,
  Crown,
  UserX,
  Plus,
  Lock,
  Unlock,
  CalendarPlus,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import axiosClient from '../../api/axiosClient';

const COLOR_HEADER = {
  blue: 'bg-blue-950/80 border-blue-600 text-blue-300',
  red: 'bg-red-950/80 border-red-600 text-red-300',
  pink: 'bg-pink-950/80 border-pink-600 text-pink-300',
  purple: 'bg-purple-950/80 border-purple-600 text-purple-300',
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
  { value: 0, label: 'Chủ nhật' },
];

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

const getNextMonthDefaults = () => {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const nextMonthDate = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth() + 1, 1));
  const year = nextMonthDate.getUTCFullYear();
  const month = nextMonthDate.getUTCMonth() + 1;
  const code = `${year}-${String(month).padStart(2, '0')}`;
  const name = `Tháng ${String(month).padStart(2, '0')}/${year}`;
  const startDate = `${code}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${code}-${String(lastDay).padStart(2, '0')}`;

  return {
    code,
    name,
    startDate,
    endDate,
    groupHourlyRate: 50000,
    defaultMaxSlots: 8,
    maxGroupShiftsPerDay: 1,
    offWeekdays: [],
  };
};

const AdminSchedule = () => {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [activeMonthCode, setActiveMonthCode] = useState(() => getCurrentMonthCodeVN());
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateKeyVN());

  const [shiftSlots, setShiftSlots] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [soloSchedules, setSoloSchedules] = useState([]);
  const [idols, setIdols] = useState([]);
  const [loading, setLoading] = useState(false);

  const [assignForm, setAssignForm] = useState({
    idolId: '',
    shiftSlotId: '',
    isHost: false,
  });

  const [createPeriodModal, setCreatePeriodModal] = useState({
    open: false,
    ...getNextMonthDefaults(),
  });

  const activePeriod = useMemo(
    () => periods.find((p) => p._id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  // Tải danh sách kỳ tháng (tự động tạo kỳ tháng mới khi qua tháng) & danh sách Idol
  const initMeta = useCallback(async () => {
    try {
      const [periodsRes, idolsRes] = await Promise.all([
        axiosClient.get('/work-periods'),
        axiosClient.get('/admin/idols?limit=100'),
      ]);

      const periodList = periodsRes.data || [];
      setPeriods(periodList);
      setIdols((idolsRes.data?.items || []).filter((u) => u.isActive !== false));

      const currentMonthPeriod = periodList.find((p) => p.isCurrentMonth) || periodList[0];
      if (currentMonthPeriod) {
        setSelectedPeriodId(currentMonthPeriod._id);
        const startStr = currentMonthPeriod.startDate?.slice(0, 10);
        const endStr = currentMonthPeriod.endDate?.slice(0, 10);
        const todayStr = getTodayDateKeyVN();
        setSelectedDate(todayStr >= startStr && todayStr <= endStr ? todayStr : startStr);
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => {
    initMeta();
  }, [initMeta]);

  // Tự động reset sang kỳ tháng mới nếu đồng hồ bước sang tháng tiếp theo
  useEffect(() => {
    const timer = setInterval(() => {
      const latestMonth = getCurrentMonthCodeVN();
      if (latestMonth !== activeMonthCode) {
        setActiveMonthCode(latestMonth);
        toast.info(`Đã sang tháng mới (${latestMonth}) — Hệ thống tự động làm mới bảng đăng ký ca!`);
        initMeta();
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [activeMonthCode, initMeta]);

  // Tải bảng ca nhóm & lịch LIVE đơn theo ngày đang chọn
  const fetchSchedule = useCallback(async () => {
    if (!selectedPeriodId || !selectedDate) return;
    setLoading(true);
    try {
      const [boardRes, soloRes] = await Promise.all([
        axiosClient.get(
          `/shifts/board?workPeriodId=${selectedPeriodId}&startDate=${selectedDate}&endDate=${selectedDate}`
        ),
        axiosClient.get(`/solo-schedules?workPeriodId=${selectedPeriodId}`),
      ]);

      const groups = boardRes.data?.slots || [];
      setShiftSlots(groups);
      setRegistrations(boardRes.data?.registrations || []);

      const daySolos = (soloRes.data || []).filter(
        (s) => s.scheduleDate?.slice(0, 10) === selectedDate
      );
      setSoloSchedules(daySolos);

      if (groups.length > 0 && !assignForm.shiftSlotId) {
        setAssignForm((prev) => ({ ...prev, shiftSlotId: groups[0]._id }));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, selectedDate, assignForm.shiftSlotId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleSelectPeriod = (newPeriodId) => {
    setSelectedPeriodId(newPeriodId);
    const found = periods.find((p) => p._id === newPeriodId);
    if (found) {
      const startStr = found.startDate?.slice(0, 10);
      const endStr = found.endDate?.slice(0, 10);
      const todayStr = getTodayDateKeyVN();
      setSelectedDate(todayStr >= startStr && todayStr <= endStr ? todayStr : startStr);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignForm.idolId || !assignForm.shiftSlotId) return;
    try {
      await axiosClient.post('/shifts/admin-assign', {
        workPeriodId: selectedPeriodId,
        idolId: assignForm.idolId,
        shiftSlotId: assignForm.shiftSlotId,
        shiftDate: selectedDate,
        isHost: assignForm.isHost,
      });
      toast.success('Đã phân công Idol vào ca thành công');
      setAssignForm((prev) => ({ ...prev, idolId: '', isHost: false }));
      fetchSchedule();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleMarkAbsent = async (reg) => {
    const reason = window.prompt(
      `Xác nhận đánh dấu VẮNG MẶT (OFF) cho ${reg.idolId?.name || reg.idolId?.username}. Nhập lý do:`
    );
    if (reason === null) return;
    try {
      await axiosClient.patch(`/shifts/${reg._id}/absent`, {
        reason: reason || 'Vắng mặt không xuất hiện tại ca đã đăng ký',
      });
      toast.warning('Đã ghi nhận vắng mặt (OFF)');
      fetchSchedule();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleLockPeriod = async () => {
    if (!activePeriod) return;
    const isLocked = activePeriod.status === 'LOCKED';
    const reason = window.prompt(
      isLocked
        ? `Nhập lý do MỞ KHÓA & mở lại đăng ký cả tháng cho ${activePeriod.name}:`
        : `Nhập lý do KHÓA kỳ ${activePeriod.name} (đóng đăng ký & chốt lịch):`
    );
    if (reason === null) return;

    try {
      const endpoint = isLocked
        ? `/work-periods/${activePeriod._id}/unlock`
        : `/work-periods/${activePeriod._id}/lock`;
      await axiosClient.patch(endpoint, { reason });
      toast.success(
        isLocked ? `Đã mở khóa ${activePeriod.name}` : `Đã khóa kỳ ${activePeriod.name}`
      );
      initMeta();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateNextPeriod = async (e) => {
    e.preventDefault();
    try {
      await axiosClient.post('/work-periods', {
        code: createPeriodModal.code,
        name: createPeriodModal.name,
        startDate: `${createPeriodModal.startDate}T00:00:00.000Z`,
        endDate: `${createPeriodModal.endDate}T23:59:59.999Z`,
        status: 'OPEN',
        registrationOpen: true,
        groupHourlyRate: Number(createPeriodModal.groupHourlyRate),
        defaultMaxSlots: Number(createPeriodModal.defaultMaxSlots),
        maxGroupShiftsPerDay: Number(createPeriodModal.maxGroupShiftsPerDay),
        offWeekdays: createPeriodModal.offWeekdays,
      });
      toast.success(`Đã mở trước kỳ đăng ký ${createPeriodModal.name}`);
      setCreatePeriodModal({ open: false, ...getNextMonthDefaults() });
      initMeta();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleOffWeekday = (dayVal) => {
    setCreatePeriodModal((prev) => {
      const exists = prev.offWeekdays.includes(dayVal);
      return {
        ...prev,
        offWeekdays: exists
          ? prev.offWeekdays.filter((d) => d !== dayVal)
          : [...prev.offWeekdays, dayVal],
      };
    });
  };

  const isPeriodLocked = activePeriod?.status === 'LOCKED';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      {/* Thanh điều khiển Kỳ tháng & Ngày */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <CalendarRange className="text-indigo-400" />
            Điều Phối Ca Live & Kỳ Tháng
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Mở đăng ký trọn cả tháng • Tự động reset bảng mới khi qua tháng khác • Tối đa{' '}
            {activePeriod?.defaultMaxSlots || 8} slot/ca
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Chọn kỳ tháng */}
          <select
            value={selectedPeriodId}
            onChange={(e) => handleSelectPeriod(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
          >
            {periods.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} {p.isCurrentMonth ? '(Hiện tại)' : ''}
              </option>
            ))}
          </select>

          {/* Chọn ngày trong tháng */}
          <input
            type="date"
            value={selectedDate}
            min={activePeriod?.startDate?.slice(0, 10)}
            max={activePeriod?.endDate?.slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
          />

          {/* Khóa / Mở khóa kỳ */}
          {activePeriod && (
            <button
              type="button"
              onClick={handleToggleLockPeriod}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                isPeriodLocked
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white'
              }`}
            >
              {isPeriodLocked ? (
                <>
                  <Unlock size={15} /> Mở khóa kỳ
                </>
              ) : (
                <>
                  <Lock size={15} /> Khóa kỳ
                </>
              )}
            </button>
          )}

          {/* Mở trước kỳ tháng sau */}
          <button
            type="button"
            onClick={() => setCreatePeriodModal({ open: true, ...getNextMonthDefaults() })}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
          >
            <CalendarPlus size={15} /> Mở kỳ tháng sau
          </button>
        </div>
      </div>

      {/* Trạng thái cổng đăng ký tháng */}
      {activePeriod && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <span>
              Kỳ áp dụng: <strong className="text-white">{activePeriod.name}</strong> (
              {activePeriod.startDate?.slice(0, 10)} → {activePeriod.endDate?.slice(0, 10)})
            </span>
            <span>
              Đơn giá ca nhóm:{' '}
              <strong className="text-emerald-400">
                {(activePeriod.groupHourlyRate || 0).toLocaleString('vi-VN')} đ/h
              </strong>
            </span>
            <span>
              Định mức: <strong>{activePeriod.maxGroupShiftsPerDay} ca/ngày</strong>
            </span>
          </div>

          <div>
            {isPeriodLocked ? (
              <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                <XCircle size={14} /> Đã khóa & đóng đăng ký
              </span>
            ) : activePeriod.registrationOpen ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 size={14} /> Đang mở đăng ký trọn tháng
              </span>
            ) : (
              <span className="text-amber-400 font-semibold">Đã đóng cổng đăng ký</span>
            )}
          </div>
        </div>
      )}

      {/* Form Admin xếp nhanh Idol vào ca */}
      {!isPeriodLocked && (
        <form
          onSubmit={handleAssign}
          className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-3"
        >
          <span className="text-xs font-semibold uppercase text-indigo-400 px-2">Xếp nhanh:</span>
          <select
            required
            value={assignForm.idolId}
            onChange={(e) => setAssignForm({ ...assignForm, idolId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white min-w-[200px]"
          >
            <option value="">-- Chọn Idol --</option>
            {idols.map((i) => (
              <option key={i._id} value={i._id}>
                {i.name} ({i.idolCode || i.username})
              </option>
            ))}
          </select>

          <select
            value={assignForm.shiftSlotId}
            onChange={(e) => setAssignForm({ ...assignForm, shiftSlotId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
          >
            {shiftSlots.map((slot) => (
              <option key={slot._id} value={slot._id}>
                {slot.name} ({slot.startTime} - {slot.endTime})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer px-2">
            <input
              type="checkbox"
              checked={assignForm.isHost}
              onChange={(e) => setAssignForm({ ...assignForm, isHost: e.target.checked })}
              className="rounded"
            />
            <span>Chỉ định làm Host ca</span>
          </label>

          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus size={16} /> Thêm vào ca
          </button>

          {loading && <span className="text-xs text-indigo-400 ml-auto">Đang đồng bộ...</span>}
        </form>
      )}

      {/* Bảng 4 cột Ca Nhóm */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {shiftSlots.map((slot) => {
          const slotRegs = registrations.filter(
            (r) => String(r.shiftSlotId?._id || r.shiftSlotId) === String(slot._id)
          );
          return (
            <div
              key={slot._id}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
            >
              <div
                className={`p-4 border-b-2 ${
                  COLOR_HEADER[slot.colorCode] || 'bg-slate-800 border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-base">{slot.name}</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-black/30">
                    {slotRegs.length}/{slot.maxSlots}
                  </span>
                </div>
                <p className="text-xs opacity-75 mt-0.5">
                  {slot.startTime} - {slot.endTime}
                </p>
              </div>

              <div className="p-3 space-y-2 flex-1">
                {slotRegs.map((reg) => (
                  <div
                    key={reg._id}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                      reg.status === 'ABSENT'
                        ? 'bg-red-950/30 border-red-900/60 text-red-300 line-through'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-slate-500">#{reg.slotNumber}</span>
                        <span>{reg.idolId?.name || reg.idolId?.username}</span>
                        {reg.isHost && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/40">
                            <Crown size={10} /> HOST
                          </span>
                        )}
                      </div>
                      {reg.isSwapped && (
                        <span className="text-[11px] text-amber-400">
                          ⇄ Đổi từ: {reg.originalShiftSlotId?.name || 'ca gốc'}
                        </span>
                      )}
                      {reg.status === 'ABSENT' && (
                        <span className="text-[10px] font-bold text-rose-400 block">
                          ● OFF (Vắng mặt)
                        </span>
                      )}
                    </div>

                    {!isPeriodLocked && reg.status === 'APPROVED' && (
                      <button
                        onClick={() => handleMarkAbsent(reg)}
                        title="Đánh dấu vắng (OFF)"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition cursor-pointer"
                      >
                        <UserX size={15} />
                      </button>
                    )}
                  </div>
                ))}

                {slotRegs.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-6">Chưa có Idol đăng ký</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Danh sách Live Đơn trong ngày */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-base font-bold text-emerald-400 mb-3">
          Danh Sách Live Đơn Ngày {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('vi-VN')} (
          {soloSchedules.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {soloSchedules.map((s) => (
            <div
              key={s._id}
              className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center text-xs"
            >
              <div>
                <div className="font-bold text-white">
                  {s.idolId?.name || s.idolId?.username}
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Tuần {s.weekNumber} • {s.plannedDurationMinutes} phút
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold">
                {s.status}
              </span>
            </div>
          ))}
          {soloSchedules.length === 0 && (
            <p className="text-xs text-slate-500">Không có lịch Live Đơn trong ngày này.</p>
          )}
        </div>
      </div>

      {/* Modal Mở trước kỳ tháng kế tiếp */}
      {createPeriodModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateNextPeriod}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Mở trước kỳ đăng ký tháng mới</h3>
            <p className="text-xs text-slate-400">
              Bảng đăng ký ca sẽ tự động reset hoàn toàn trống cho tháng mới để Idol đăng ký cả tháng.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Mã kỳ (YYYY-MM)</label>
                <input
                  type="text"
                  required
                  value={createPeriodModal.code}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, code: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  required
                  value={createPeriodModal.name}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Từ ngày</label>
                <input
                  type="date"
                  required
                  value={createPeriodModal.startDate}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, startDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Đến ngày</label>
                <input
                  type="date"
                  required
                  value={createPeriodModal.endDate}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, endDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Đơn giá (đ/h)</label>
                <input
                  type="number"
                  required
                  value={createPeriodModal.groupHourlyRate}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, groupHourlyRate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Slot tối đa/ca</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={createPeriodModal.defaultMaxSlots}
                  onChange={(e) =>
                    setCreatePeriodModal({ ...createPeriodModal, defaultMaxSlots: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Ca tối đa/ngày</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={createPeriodModal.maxGroupShiftsPerDay}
                  onChange={(e) =>
                    setCreatePeriodModal({
                      ...createPeriodModal,
                      maxGroupShiftsPerDay: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                Ngày nghỉ cố định của nhóm (nếu có)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_OPTIONS.map((w) => {
                  const active = createPeriodModal.offWeekdays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => toggleOffWeekday(w.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                        active
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreatePeriodModal({ open: false, ...getNextMonthDefaults() })}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold cursor-pointer"
              >
                Tạo & Mở đăng ký
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminSchedule;