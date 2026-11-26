import { useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sparkles, LogOut, UserCheck } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const IdolLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* Top Navbar gọn nhẹ tối ưu cho Idol dùng trên cả PC lẫn điện thoại */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white leading-tight">AST Idol Portal</h1>
            <p className="text-xs text-gray-400">Đăng ký ca live & Nộp báo cáo KPI</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-xl text-xs">
            <UserCheck size={15} className="text-pink-400" />
            <span className="text-gray-400">Idol:</span>
            <strong className="text-pink-300">{user?.username}</strong>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-900/60 text-red-300 text-xs font-medium transition cursor-pointer"
          >
            <LogOut size={15} />
            <span>Thoát</span>
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default IdolLayout;