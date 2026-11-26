import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import axiosClient from '../api/axiosClient';

export default function ActivateAccountPage() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleActivate = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error('Mật khẩu xác nhận không khớp');
    }
    setLoading(true);
    try {
      await axiosClient.post('/auth/activate', { token, newPassword });
      toast.success('Kích hoạt tài khoản thành công! Vui lòng đăng nhập.');
      navigate('/login');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Kích hoạt tài khoản Idol</h2>
            <p className="text-xs text-slate-400">Nhập mã lời mời từ Vận hành và thiết lập mật khẩu</p>
          </div>
        </div>

        <form onSubmit={handleActivate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Mã kích hoạt (Token)</label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Dán mã kích hoạt được cấp"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Xác nhận mật khẩu</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? 'Đang xử lý...' : 'Hoàn tất kích hoạt'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-xs text-slate-400 hover:text-white">
            ← Quay lại trang đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}