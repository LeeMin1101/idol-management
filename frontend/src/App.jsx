import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  LayoutDashboard,
  Calendar,
  CalendarCog,
  Radio,
  CheckCircle2,
  Users,
  User,
  LogOut,
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ActivateAccountPage from './pages/ActivateAccountPage';
import ShiftBoard from './pages/ShiftBoard';
import LiveStudioPage from './pages/LiveStudioPage';
import IdolProfilePage from './pages/IdolProfilePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminKpiReview from './pages/admin/AdminKpiReview';
import AdminSchedule from './pages/admin/AdminSchedule';
import IdolManager from './pages/IdolManager';

function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const navItems = isAdmin
    ? [
        { to: '/admin/dashboard', label: 'Tổng quan & Kỳ', icon: LayoutDashboard },
        { to: '/shifts', label: 'Bảng Lịch Ca', icon: Calendar },
        { to: '/admin/schedule', label: 'Xếp Ca & Khung Giờ', icon: CalendarCog },
        { to: '/admin/kpi-review', label: 'Duyệt KPI & Bảng Công', icon: CheckCircle2 },
        { to: '/admin/idols', label: 'Nhân sự Idol', icon: Users },
      ]
    : [
        { to: '/shifts', label: 'Đăng ký & Đổi Ca', icon: Calendar },
        { to: '/live-studio', label: 'Phòng LIVE & KPI', icon: Radio },
        { to: '/profile', label: 'Hồ sơ Idol', icon: User },
      ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 px-2 py-3 mb-4 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
              IO
            </div>
            <div>
              <div className="font-bold text-sm text-white">IdolOps Studio</div>
              <div className="text-[11px] text-slate-400">
                {user?.stageName || user?.name} ({user?.role})
              </div>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <button
          onClick={logout}
          className="mt-6 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất
        </button>
      </aside>

      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}

function ProtectedRoute({ children, allowRoles }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 p-8">Đang tải phiên làm việc...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (allowRoles && !allowRoles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/shifts'} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<ActivateAccountPage />} />

          <Route
            path="/shifts"
            element={
              <ProtectedRoute allowRoles={['ADMIN', 'IDOL']}>
                <ShiftBoard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/live-studio"
            element={
              <ProtectedRoute allowRoles={['IDOL']}>
                <LiveStudioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowRoles={['IDOL']}>
                <IdolProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/schedule"
            element={
              <ProtectedRoute allowRoles={['ADMIN']}>
                <AdminSchedule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/kpi-review"
            element={
              <ProtectedRoute allowRoles={['ADMIN']}>
                <AdminKpiReview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/idols"
            element={
              <ProtectedRoute allowRoles={['ADMIN']}>
                <IdolManager />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />
    </AuthProvider>
  );
}