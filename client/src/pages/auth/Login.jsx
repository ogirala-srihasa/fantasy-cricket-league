import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back! 🏏');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-hero-pattern">
      <div className="absolute inset-0 bg-gradient-to-b from-gold-500/5 to-transparent pointer-events-none" />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 animate-fade-in">
          <span className="text-6xl">🏏</span>
          <h1 className="text-3xl font-display font-bold mt-4 text-gradient-gold">Fantasy Cricket League</h1>
          <p className="text-gray-400 mt-2">IPL 2026 — Auction & Per-match Contests</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 animate-slide-up">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <LogIn size={20} className="text-gold-400" /> Sign In
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input-field" placeholder="you@email.com" required id="login-email" />
            </div>
            <div className="relative">
              <label className="text-sm text-gray-400 mb-1 block">Password</label>
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="input-field pr-10" placeholder="••••••••" required id="login-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-9 text-gray-500 hover:text-white">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-6" id="login-submit">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-gray-400 mt-4">
            Don't have an account?{' '}
            <Link to="/register" className="text-gold-400 hover:text-gold-300 font-medium">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
