import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  Users,
  UserPlus,
  Copy,
  ShieldAlert,
  Lock,
  Unlock,
  Sparkles,
  Search,
} from 'lucide-react';
import axiosClient from '../api/axiosClient';

export default function IdolManager() {
  const [idols, setIdols] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);

  const [form, setForm] = useState({
    username: '',
    name: '',
    fullName: '',
    idolCode: '',
    email: '',
    phone: '',
    larkId: '',
    canSoloLive: false,
  });

  const loadIdols = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/admin/idols?keyword=${encodeURIComponent(keyword)}&limit=100`);
      setIdols(res.data?.items || []);
    } catch (err) {
      toast.error(err.message);
    }
  }, [keyword]);

  useEffect(() => {
    loadIdols();
  }, [loadIdols]);

  const handleCreateIdol = async (e) => {
    e.preventDefault();
    try {
      const res = await axiosClient.post('/admin/idols', form);
      toast.success('Đã tạo hồ sơ Idol & mã lời mời kích hoạt!');
      setCreatedInvite(res.data);
      setCreateModalOpen(false);
      setForm({
        username: '',
        name: '',
        fullName: '',
        idolCode: '',
        email: '',
        phone: '',
        larkId: '',
        canSoloLive: false,
      });
      loadIdols();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleSoloPermission = async (idol) => {
    try {
      await axiosClient.put(`/admin/idols/${idol._id}`, {
        canSoloLive: !idol.canSoloLive,
        reason: `Thay đổi quyền LIVE đơn cho ${idol.name}`,
      });
      toast.success(`Đã ${!idol.canSoloLive ? 'cấp' : 'thu hồi'} quyền LIVE đơn của ${idol.name}`);
      loadIdols();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleLock = async (idol) => {
    const targetStatus = idol.accountStatus === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    const reason = window.prompt(
      `Nhập lý do ${targetStatus === 'LOCKED' ? 'KHÓA' : 'MỞ KHÓA'} tài khoản ${idol.name}:`
    );
    if (!reason) return;
    try {
      await axiosClient.patch(`/admin/idols/${idol._id}/account-status`, {
        accountStatus: targetStatus,
        reason,
      });
      toast.success('Đã cập nhật trạng thái tài khoản');
      loadIdols();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyActivationLink = (token) => {
    const link = `${window.location.origin}/activate?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.info('Đã sao chép đường dẫn kích hoạt tài khoản!');
  };

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Quản Lý Nhân Sự Idol
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cấp tài khoản qua lời mời kích hoạt, phân quyền LIVE đơn và theo dõi ngưỡng vi phạm (&gt; 3 lần)
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" /> Thêm Idol mới
        </button>
      </div>

      {/* Banner hiển thị link kích hoạt vừa tạo */}
      {createdInvite && (
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs space-y-1">
            <div className="font-bold text-emerald-300 text-sm">
              Tạo thành công tài khoản Idol: {createdInvite.name} ({createdInvite.username})
            </div>
            <div className="text-slate-300 font-mono">
              Link kích hoạt: {window.location.origin}/activate?token={createdInvite.activationToken}
            </div>
          </div>
          <button
            onClick={() => copyActivationLink(createdInvite.activationToken)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" /> Sao chép link gửi Idol
          </button>
        </div>
      )}

      {/* Thanh tìm kiếm */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm theo nghệ danh, mã Idol, username..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white"
        />
      </div>

      {/* Danh sách Idol */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/50">
              <th className="py-3.5 px-4">Mã / Nghệ danh</th>
              <th className="py-3.5 px-4">Tài khoản</th>
              <th className="py-3.5 px-4">Lark ID / SĐT</th>
              <th className="py-3.5 px-4">Quyền LIVE Đơn</th>
              <th className="py-3.5 px-4">Vi phạm</th>
              <th className="py-3.5 px-4">Trạng thái</th>
              <th className="py-3.5 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {idols.map((idol) => (
              <tr key={idol._id} className="hover:bg-slate-950/40">
                <td className="py-3.5 px-4">
                  <div className="font-bold text-white">{idol.name}</div>
                  <div className="text-xs text-slate-400">{idol.idolCode || 'Chưa gắn mã'}</div>
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-300">
                  <div>@{idol.username}</div>
                  <div className="text-slate-500">{idol.email || '—'}</div>
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-300">
                  <div>Lark: {idol.larkId || '—'}</div>
                  <div>SĐT: {idol.phone || '—'}</div>
                </td>
                <td className="py-3.5 px-4">
                  <button
                    onClick={() => handleToggleSoloPermission(idol)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      idol.canSoloLive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" /> {idol.canSoloLive ? 'Được phép' : 'Chưa cấp'}
                  </button>
                </td>
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${
                      idol.exceedsViolationThreshold
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {idol.exceedsViolationThreshold && <ShieldAlert className="w-3.5 h-3.5" />}
                    {idol.violationCount || 0} lần
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                      idol.accountStatus === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : idol.accountStatus === 'INVITED'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {idol.accountStatus}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right space-x-2">
                  {idol.accountStatus === 'INVITED' && idol.activationToken && (
                    <button
                      onClick={() => copyActivationLink(idol.activationToken)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs cursor-pointer"
                    >
                      Copy Invite
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleLock(idol)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {idol.accountStatus === 'LOCKED' ? (
                      <>
                        <Unlock className="w-3 h-3 text-emerald-400" /> Mở khóa
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3 text-rose-400" /> Khóa
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal tạo mới Idol */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateIdol}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Tạo hồ sơ Idol & Lời mời kích hoạt</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Tên đăng nhập *</label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="VD: hiro_idol"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Nghệ danh *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: HIRO"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Mã nhân sự Idol</label>
                <input
                  type="text"
                  value={form.idolCode}
                  onChange={(e) => setForm({ ...form, idolCode: e.target.value })}
                  placeholder="VD: IDOL001"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Lark ID</label>
                <input
                  type="text"
                  value={form.larkId}
                  onChange={(e) => setForm({ ...form, larkId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-emerald-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.canSoloLive}
                onChange={(e) => setForm({ ...form, canSoloLive: e.target.checked })}
              />
              Cấp quyền đăng ký LIVE đơn ngay khi kích hoạt
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-xs text-white font-semibold cursor-pointer"
              >
                Tạo tài khoản & Sinh mã
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}