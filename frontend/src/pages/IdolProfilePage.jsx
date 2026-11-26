import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  User,
  Camera,
  Mail,
  Phone,
  Calendar,
  Radio,
  Clock,
  Wallet,
  CreditCard,
  ShieldCheck,
  Save,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Crown,
  Loader2,
} from 'lucide-react';
import axiosClient, { resolveAssetUrl } from '../api/axiosClient';
import { useAuth } from '../context/AuthContext';

export default function IdolProfilePage() {
  const { user, setUser } = useAuth();

  const [profile, setProfile] = useState(user || null);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  const [kpiSummary, setKpiSummary] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [mySoloSchedules, setMySoloSchedules] = useState([]);

  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    stageName: '',
    phone: '',
    bio: '',
    tiktokUsername: '',
    tiktokProfileUrl: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const syncFormFromUser = useCallback((u) => {
    if (!u) return;
    setFormData({
      name: u.name || u.fullName || '',
      stageName: u.stageName || '',
      phone: u.phone || '',
      bio: u.bio || '',
      tiktokUsername: u.tiktokUsername || '',
      tiktokProfileUrl: u.tiktokProfileUrl || '',
      bankName: u.bankInfo?.bankName || u.bankName || '',
      bankAccountNumber: u.bankInfo?.accountNumber || u.bankAccountNumber || '',
      bankAccountHolder: u.bankInfo?.accountHolder || u.bankAccountHolder || '',
    });
  }, []);

  // Tải thông tin hồ sơ từ /auth/me và danh sách kỳ làm việc
  useEffect(() => {
    const initProfile = async () => {
      setLoading(true);
      try {
        const [meResult, periodResult] = await Promise.allSettled([
          axiosClient.get('/auth/me'),
          axiosClient.get('/work-periods'),
        ]);

        const rawMe = meResult.status === 'fulfilled' ? meResult.value : null;
        const userData = rawMe?.data || rawMe?.user || user;

        setProfile(userData);
        syncFormFromUser(userData);

        if (periodResult.status === 'fulfilled') {
          const periodList = periodResult.value?.data || [];
          setPeriods(periodList);
          if (periodList.length > 0) {
            setSelectedPeriodId(periodList[0]._id);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    initProfile();
  }, [user?._id, syncFormFromUser]);

  // Tải KPI, ca đăng ký & nhật ký phiên LIVE theo kỳ đang chọn
  const loadRelatedStats = useCallback(async () => {
    if (!selectedPeriodId || !profile?._id) return;
    try {
      const [kpiRes, histRes, boardRes, soloRes] = await Promise.all([
        axiosClient.get(`/kpi/my-summary?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/live-sessions?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/shifts/board?workPeriodId=${selectedPeriodId}`),
        axiosClient.get(`/solo-schedules?workPeriodId=${selectedPeriodId}`),
      ]);

      setKpiSummary(kpiRes.data || null);
      setRecentSessions(histRes.data || []);

      const filteredShifts = (boardRes.data?.registrations || []).filter(
        (r) => String(r.idolId?._id || r.idolId) === String(profile._id)
      );
      setMyShifts(filteredShifts);
      setMySoloSchedules(soloRes.data || []);
    } catch (err) {
      toast.error(err.message);
    }
  }, [selectedPeriodId, profile?._id]);

  useEffect(() => {
    loadRelatedStats();
  }, [loadRelatedStats]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const payload = new FormData();
    payload.append('image', file);

    setUploadingAvatar(true);
    try {
      const res = await axiosClient.post('/idol/profile/avatar', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = res.data || res.user;
      if (updated) {
        setProfile(updated);
        if (typeof setUser === 'function') setUser(updated);
      }
      toast.success(res.message || 'Đã cập nhật ảnh đại diện!');
    } catch (err) {
      toast.error(err.message || 'Lỗi tải ảnh đại diện');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axiosClient.put('/idol/profile', {
        ...formData,
        fullName: formData.name,
        bankInfo: {
          bankName: formData.bankName,
          accountNumber: formData.bankAccountNumber,
          accountHolder: formData.bankAccountHolder,
        },
      });
      const updated = res.data || res.user;
      if (updated) {
        setProfile(updated);
        syncFormFromUser(updated);
        if (typeof setUser === 'function') setUser(updated);
      }
      toast.success(res.message || 'Đã lưu thông tin hồ sơ');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('Mật khẩu xác nhận không khớp');
    }
    setSaving(true);
    try {
      const res = await axiosClient.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        oldPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success(res.message || 'Đổi mật khẩu thành công');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-300 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        <span className="text-sm">Đang tải hồ sơ Idol...</span>
      </div>
    );
  }

  const displayName = profile?.stageName || profile?.name || profile?.fullName || 'Idol';
  const accountState = profile?.accountStatus || profile?.status || 'ACTIVE';
  const totalApprovedHours =
    (Number(kpiSummary?.metrics?.approvedGroupHours) || 0) +
    (Number(kpiSummary?.metrics?.approvedSoloHours) || 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header Banner & Thông tin định danh Idol */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center">
              {profile?.avatarUrl ? (
                <img
                  src={resolveAssetUrl(profile.avatarUrl)}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-9 h-9 text-slate-400" />
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg cursor-pointer">
              {uploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingAvatar}
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">{displayName}</h1>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                {profile?.role || 'IDOL'}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> {accountState}
              </span>
            </div>

            {profile?.name && profile?.stageName && (
              <div className="text-xs text-slate-400">Họ tên thật: {profile.name}</div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-0.5">
              {(profile?.email || profile?.username) && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />{' '}
                  {profile?.email || profile?.username}
                </span>
              )}
              {profile?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" /> {profile.phone}
                </span>
              )}
              {profile?.createdAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" /> Tham gia:{' '}
                  {new Date(profile.createdAt).toLocaleDateString('vi-VN')}
                </span>
              )}
            </div>

            {profile?.tiktokProfileUrl && (
              <a
                href={profile.tiktokProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline pt-0.5"
              >
                <Radio className="w-3.5 h-3.5" />
                {profile.tiktokUsername || 'Kênh TikTok LIVE'}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-[11px] text-slate-400">Kỳ đối soát KPI</span>
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
        </div>
      </div>

      {/* 4 Thẻ thống kê hiệu suất Idol trong kỳ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400">Tổng giờ LIVE duyệt</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {totalApprovedHours.toFixed(1)}h
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Nhóm: {kpiSummary?.metrics?.approvedGroupHours || 0}h • Đơn:{' '}
            {kpiSummary?.metrics?.approvedSoloHours || 0}h
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400">Ca hoàn thành / Đăng ký</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {kpiSummary?.metrics?.completedShiftsCount || 0} / {myShifts.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Lịch LIVE đơn: {mySoloSchedules.length} phiên
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400">Vắng ca (OFF) / Vi phạm</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">
            {kpiSummary?.metrics?.absentShiftsCount || 0} /{' '}
            {kpiSummary?.metrics?.rejectedSessionsCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Thiếu báo cáo: {kpiSummary?.metrics?.missingReportCount || 0}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-amber-400" /> Thu nhập tạm tính
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {(kpiSummary?.payroll?.totalPayableAmount || 0).toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Phiếu lương: {kpiSummary?.payroll?.status || 'DRAFT'}
          </div>
        </div>
      </div>

      {/* Thanh chuyển Tab */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'info'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Thông tin cá nhân & Ngân hàng
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'activity'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Lịch đăng ký & Phiên LIVE ({recentSessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'security'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Bảo mật & Mật khẩu
        </button>
      </div>

      {/* TAB 1: Thông tin cá nhân, Kênh TikTok & Tài khoản nhận lương */}
      {activeTab === 'info' && (
        <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" /> Thông tin định danh & Kênh LIVE
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Họ và tên thật</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Nghệ danh (Stage Name)</label>
                <input
                  type="text"
                  value={formData.stageName}
                  onChange={(e) => setFormData({ ...formData, stageName: e.target.value })}
                  placeholder="VD: MinMin, Hana..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Số điện thoại liên hệ</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="09xx xxx xxx"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">TikTok ID (@username)</label>
                <input
                  type="text"
                  value={formData.tiktokUsername}
                  onChange={(e) => setFormData({ ...formData, tiktokUsername: e.target.value })}
                  placeholder="@idol_live"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Link kênh TikTok LIVE</label>
              <input
                type="url"
                value={formData.tiktokProfileUrl}
                onChange={(e) => setFormData({ ...formData, tiktokProfileUrl: e.target.value })}
                placeholder="https://www.tiktok.com/@..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Giới thiệu ngắn / Phong cách LIVE</label>
              <textarea
                rows={3}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Ca hát, trò chuyện, PK giao lưu..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>
          </div>

          {/* Cột thông tin ngân hàng */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" /> Tài khoản nhận lương
              </h2>
              <p className="text-xs text-slate-400">
                Dùng để bộ phận Kế toán giải ngân thu nhập cuối kỳ đối soát.
              </p>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tên ngân hàng</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="VD: Vietcombank, MB Bank, Techcombank..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Số tài khoản</label>
                <input
                  type="text"
                  value={formData.bankAccountNumber}
                  onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                  placeholder="Nhập số tài khoản"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tên chủ tài khoản (Không dấu)</label>
                <input
                  type="text"
                  value={formData.bankAccountHolder}
                  onChange={(e) => setFormData({ ...formData, bankAccountHolder: e.target.value })}
                  placeholder="NGUYEN VAN A"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Lưu thay đổi hồ sơ
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Lịch đăng ký ca & Lịch sử phiên LIVE */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-base font-bold text-white mb-4">
              Ca LIVE Nhóm đã đăng ký ({myShifts.length})
            </h3>
            {myShifts.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có ca đăng ký nào trong kỳ này.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myShifts.map((shift) => (
                  <div
                    key={shift._id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                        {shift.shiftSlotId?.name || 'Ca Nhóm'}
                        {shift.isHost && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] inline-flex items-center gap-0.5">
                            <Crown className="w-3 h-3" /> HOST
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {shift.shiftDate?.slice(0, 10)} • {shift.shiftSlotId?.startTime} -{' '}
                        {shift.shiftSlotId?.endTime}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                        shift.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : shift.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {shift.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-base font-bold text-white mb-4">
              Nhật ký phiên LIVE trong kỳ ({recentSessions.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-3 px-3">Hình thức</th>
                    <th className="py-3 px-3">Thời gian bắt đầu</th>
                    <th className="py-3 px-3">Thực tế / Duyệt</th>
                    <th className="py-3 px-3">KPI (Lượt xem / Điểm)</th>
                    <th className="py-3 px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {recentSessions.map((item) => (
                    <tr key={item._id}>
                      <td className="py-3 px-3 font-medium">
                        {item.liveType === 'GROUP'
                          ? item.shiftRegistrationId?.shiftSlotId?.name || 'LIVE Nhóm'
                          : 'LIVE Đơn'}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-300">
                        <Clock className="w-3 h-3 inline mr-1 text-slate-400" />
                        {new Date(item.actualStartTime).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span className="text-slate-300">{item.actualDurationMinutes}p</span> /{' '}
                        <span className="text-emerald-400 font-semibold">
                          {item.approvedDurationMinutes}p
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-300">
                        {item.report?.totalViewers ?? 0} views •{' '}
                        <span className="text-amber-400 font-semibold">
                          {item.report?.diamondsOrPoints ?? 0} điểm
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : item.status === 'PENDING_REVIEW'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {item.status === 'APPROVED' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recentSessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-500">
                        Chưa ghi nhận phiên LIVE nào trong kỳ này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Đổi mật khẩu */}
      {activeTab === 'security' && (
        <form
          onSubmit={handleChangePassword}
          className="max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" /> Đổi mật khẩu đăng nhập
          </h2>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Mật khẩu hiện tại</label>
            <input
              type="password"
              required
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
            <input
              type="password"
              required
              minLength={6}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              required
              minLength={6}
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
          >
            {saving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
        </form>
      )}
    </div>
  );
}