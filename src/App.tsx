import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore, useThemeStore } from './store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketDetails from './pages/TicketDetails';
import Settings from './pages/Settings';
import SadminDashboard from './pages/SadminDashboard';
import { LogOut } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, logout } = useAuthStore();
  
  if (location.pathname === '/login') return null;

  return (
    <nav className="bg-white shadow-xs border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div onClick={() => navigate('/dashboard')} className="flex items-center cursor-pointer select-none group">
              {/* Sanken Overlapping Dynamic Diamonds Vector matching the brand logo */}
              <div className="relative w-11 h-7 mr-2 sm:mr-3 flex items-center">
                {/* Diamond 1 - Sanken Royal Blue (Leftmost) */}
                <div className="absolute left-[2px] w-[16px] h-[16px] bg-sky-600 rotate-45 rounded-xs shadow-xs transition-transform group-hover:scale-110" />
                {/* Diamond 2 - Sanken Sky Blue (Middle) */}
                <div className="absolute left-[11px] w-[16px] h-[16px] bg-sky-500 rotate-45 opacity-95 rounded-xs shadow-xs transition-transform group-hover:scale-115" />
                {/* Diamond 3 - Sanken Ice Blue (Rightmost, Semi-translucent) */}
                <div className="absolute left-[20px] w-[16px] h-[16px] bg-sky-200 rotate-45 opacity-85 rounded-xs transition-transform group-hover:scale-110" />
              </div>
              
              {/* Sanken Overseas Brand Text */}
              <div className="flex flex-col select-none leading-none mr-1 sm:mr-4">
                <span className="font-extrabold text-[#111111] text-[13px] sm:text-[14px] tracking-tight font-display">Sanken</span>
                <span className="font-black text-[#111111] text-[9px] sm:text-[10px] tracking-widest uppercase font-sans">Overseas</span>
              </div>
              
              <div className="hidden xs:inline-flex items-center h-[20px] px-1.5 rounded-full bg-sky-50 border border-sky-150 text-sky-700 text-[10px] font-extrabold tracking-wide uppercase select-none">
                SKOA Air
              </div>
            </div>
            
            <div className="flex space-x-1 sm:space-x-2 h-full">
              <Link
                to="/dashboard"
                className={`inline-flex items-center px-2 sm:px-3 h-full text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                  location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/tickets')
                    ? 'border-sky-500 text-sky-500 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-sky-500 hover:border-sky-700'
                }`}
              >
                Dashboard
              </Link>
              {role && ['SADMIN', 'MANAGER'].includes(role) && (
                <Link
                  to="/sadmin"
                  className={`inline-flex items-center px-2 sm:px-3 h-full text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                    location.pathname.startsWith('/sadmin')
                      ? 'border-sky-500 text-sky-500 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-sky-500 hover:border-sky-700'
                  }`}
                >
                  SADMIN Dashboard
                </Link>
              )}
              {role && (
                <Link
                  to="/settings"
                  className={`inline-flex items-center px-2 sm:px-3 h-full text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                    location.pathname.startsWith('/settings')
                      ? 'border-sky-500 text-sky-500 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-sky-500 hover:border-sky-700'
                  }`}
                >
                  {role === 'ADMIN' || role === 'ADMIN1' ? 'Settings' : 'My Account'}
                </Link>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4">
            {role && (() => {
              const bgClass = 
                role === 'SADMIN' ? 'bg-purple-105 text-purple-800 border-purple-200' :
                role === 'ADMIN' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                role === 'ADMIN1' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                role === 'FINANCE' ? 'bg-emerald-100 text-emerald-805 border-emerald-250' :
                'bg-amber-105 text-amber-800 border-amber-200';
              return (
                <span className={`hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${bgClass}`}>
                  {role === 'ADMIN1' ? 'Admin 1' : role === 'SADMIN' ? 'Super Admin (SADMIN)' : role}
                </span>
              );
            })()}
            <button 
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="inline-flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all px-2 sm:px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const { isDarkMode, setDarkMode } = useThemeStore();

  React.useEffect(() => {
    setDarkMode(isDarkMode);
  }, []);

  return (
    <>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/sadmin" element={<ProtectedRoute><SadminDashboard /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/tickets/:id" element={<ProtectedRoute><TicketDetails /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </>
  );
}
