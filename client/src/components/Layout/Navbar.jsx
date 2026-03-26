import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import {
  Home, Gavel, Users, Trophy, Swords, BarChart3, Shield,
  Menu, X, LogOut, Wifi, WifiOff, ChevronDown
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/auction', label: 'Auction Room', icon: Gavel },
  { path: '/my-squad', label: 'My Squad', icon: Users, accent: 'gold' },
  { path: '/contest-a/leaderboard', label: 'Season Board', icon: Trophy, accent: 'gold' },
  { path: '/matches', label: 'Match Contests', icon: Swords, accent: 'green' },
  { path: '/contest-b/leaderboard', label: 'Match Board', icon: BarChart3, accent: 'green' },
];

export default function Navbar() {
  const { user, league, logout } = useAuth();
  const { connected } = useSocket();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-primary-800/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl">🏏</span>
              <span className="font-display font-bold text-lg text-gradient-gold hidden sm:inline">
                Fantasy Cricket
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                const accentClass = item.accent === 'gold'
                  ? 'text-gold-400'
                  : item.accent === 'green'
                  ? 'text-emerald-400'
                  : 'text-white';

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                      ${active
                        ? `bg-white/10 ${accentClass}`
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${location.pathname === '/admin' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Shield size={16} />
                  <span>Admin</span>
                </Link>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs">
                {connected ? (
                  <span className="flex items-center gap-1 text-green-400"><Wifi size={12} /> Live</span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400"><WifiOff size={12} /> Offline</span>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-gold-400">₹{user?.purse?.toFixed(1)}Cr</span>
              </div>

              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-400 transition-colors" title="Logout">
                <LogOut size={18} />
              </button>

              <button
                className="lg:hidden p-2 text-gray-400 hover:text-white"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-16 w-72 h-[calc(100%-4rem)] bg-primary-800/95 backdrop-blur-xl border-l border-white/10 p-4 animate-slide-up">
            <div className="flex flex-col gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                      ${active ? 'bg-white/10 text-gold-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {user?.role === 'admin' && (
                <Link to="/admin" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5">
                  <Shield size={18} />
                  <span>Admin Panel</span>
                </Link>
              )}
            </div>

            <div className="mt-6 p-4 glass-card">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-gray-400 mt-1">{league?.name}</p>
              <p className="text-xs text-gold-400 mt-1">Invite: {league?.inviteCode}</p>
              <p className="text-xs text-gold-300 mt-1">Purse: ₹{user?.purse?.toFixed(1)} Cr</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
