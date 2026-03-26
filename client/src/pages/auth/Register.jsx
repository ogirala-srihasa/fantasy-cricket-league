import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { UserPlus, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mode, setMode] = useState('create'); // create | join
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await register(
        name, email, password,
        mode === 'create' ? leagueName : undefined,
        mode === 'join' ? inviteCode : undefined
      );
      toast.success(mode === 'create'
        ? `League created! Invite code: ${result.league.inviteCode}`
        : 'Joined league successfully! 🏏'
      );
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
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
          <h1 className="text-3xl font-display font-bold mt-4 text-gradient-gold">Join the League</h1>
          <p className="text-gray-400 mt-2">Create a new league or join your friends</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 animate-slide-up">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <UserPlus size={20} className="text-gold-400" /> Register
          </h2>

          {/* Mode Toggle */}
          <div className="flex rounded-xl overflow-hidden mb-6 border border-white/10">
            <button type="button" onClick={() => setMode('create')}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${mode === 'create' ? 'bg-gold-500 text-primary-900' : 'text-gray-400 hover:text-white'}`}>
              Create League
            </button>
            <button type="button" onClick={() => setMode('join')}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${mode === 'join' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              Join League
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Your Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="input-field" placeholder="e.g. Virat" required id="register-name" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input-field" placeholder="you@email.com" required id="register-email" />
            </div>
            <div className="relative">
              <label className="text-sm text-gray-400 mb-1 block">Password</label>
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="input-field pr-10" placeholder="Min 6 characters" required minLength={6} id="register-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-9 text-gray-500 hover:text-white">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {mode === 'create' ? (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">League Name</label>
                <input type="text" value={leagueName} onChange={e => setLeagueName(e.target.value)}
                  className="input-field" placeholder="e.g. Cricket Buddies XI" id="register-league-name" />
              </div>
            ) : (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Invite Code</label>
                <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  className="input-field font-mono tracking-widest" placeholder="ABCD1234" required id="register-invite-code" />
              </div>
            )}
          </div>

          <button type="submit" disabled={loading}
            className={`w-full mt-6 ${mode === 'create' ? 'btn-primary' : 'btn-green'}`} id="register-submit">
            {loading ? 'Creating...' : mode === 'create' ? 'Create League & Register' : 'Join League & Register'}
          </button>

          <p className="text-center text-sm text-gray-400 mt-4">
            Already registered?{' '}
            <Link to="/login" className="text-gold-400 hover:text-gold-300 font-medium">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
