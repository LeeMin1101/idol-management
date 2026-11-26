import { useContext, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  Users,
  LogOut,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const AdminLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/admin/dashboard', label: 'Tổng Hợp KPI & Công', icon: LayoutDashboard },
    { path: '/admin/schedule', label: 'Điều Phối Lịch Live', icon: CalendarRange },
    { path: '/admin/kpi', label: 'Duyệt Báo Cáo Số', icon: ClipboardCheck },
    { path: '/admin/users', label: 'Quản Lý Nhân Sự', icon: Users }
  ];

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-lg">
            <ShieldCheck size={24} />
            <span>AST Operations</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Cổng Quản Trị Vận Hành</p>

        <div className="mt-4 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
          <span className="text-slate-400">Vận hành:</span>
          <strong className="text-indigo-300 truncate max-w-[130px]">
            {user?.name || user?.username}
          </strong>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/60'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-900/60 text-red-300 text-sm font-medium transition cursor-pointer"
        >
          <LogOut size={16} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 bg-slate-900 border-r border-slate-800 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Sidebar Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Khu vực nội dung chính */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar cho màn hình nhỏ */}
        <header className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
            <ShieldCheck size={20} />
            <span>AST Operations</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;