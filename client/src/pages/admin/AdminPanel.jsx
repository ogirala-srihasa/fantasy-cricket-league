import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, RefreshCw, Activity, Database, Clock, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { api, user } = useAuth();
  const [health, setHealth] = useState(null);
  const [cronLogs, setCronLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await api.get('/admin/health');
      setHealth(res.data);
      setCronLogs(res.data.cronLogs || []);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Admin access required');
      }
    } finally {
      setLoading(false);
    }
  };

  const trigger = async (endpoint, label) => {
    try {
      toast.loading(`${label}...`, { id: 'admin-action' });
      await api.post(endpoint);
      toast.success(`${label} complete!`, { id: 'admin-action' });
      fetchHealth();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed', { id: 'admin-action' });
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center glass-card p-8">
          <Shield size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Admin Access Required</h2>
          <p className="text-gray-400 mt-2">Only the league admin can access this panel.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="text-gold-400" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold">Admin Panel</h1>
          <p className="text-sm text-gray-400">System management & monitoring</p>
        </div>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Database size={18} />} label="Players" value={health?.playerCount || 0} />
        <StatCard icon={<Activity size={18} />} label="Users" value={health?.userCount || 0} />
        <StatCard icon={<Zap size={18} />} label="Mock Mode" value={health?.mockMode ? 'ON' : 'OFF'} color={health?.mockMode ? 'text-yellow-400' : 'text-green-400'} />
        <StatCard icon={<Clock size={18} />} label="Live Matches" value={health?.matchCounts?.live || 0} />
      </div>

      {/* Match Counts */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-gray-300 mb-3">Match Status</h3>
        <div className="grid grid-cols-4 gap-3">
          {['upcoming', 'locked', 'live', 'completed'].map(status => (
            <div key={status} className="text-center p-3 bg-white/5 rounded-xl">
              <p className="text-2xl font-bold text-white">{health?.matchCounts?.[status] || 0}</p>
              <p className="text-xs text-gray-400 capitalize">{status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Usage */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-gray-300 mb-3">API Usage (Today)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <p className="text-2xl font-bold text-blue-400">{health?.apiUsage?.cricapiCalls || 0}</p>
            <p className="text-xs text-gray-400">CricAPI Calls</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <p className="text-2xl font-bold text-yellow-400">{health?.apiUsage?.fallbackCalls || 0}</p>
            <p className="text-xs text-gray-400">Fallback Calls</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <p className="text-2xl font-bold text-red-400">{health?.apiUsage?.puppeteerCalls || 0}</p>
            <p className="text-xs text-gray-400">Puppeteer Calls</p>
          </div>
        </div>
      </div>

      {/* Manual Triggers */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-gray-300 mb-3">Manual Triggers</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => trigger('/admin/sync-schedule', 'Schedule sync')}
            className="btn-secondary text-sm flex items-center gap-2">
            <RefreshCw size={14} /> Sync Schedule
          </button>
          <button onClick={() => trigger('/admin/generate-mock-data', 'Mock data generation')}
            className="btn-secondary text-sm flex items-center gap-2">
            <Database size={14} /> Generate Mock Data
          </button>
        </div>
      </div>

      {/* Cron Logs */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Clock size={16} /> Recent Cron Logs
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {cronLogs.map(log => (
            <div key={log.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2">
                {log.status === 'success'
                  ? <CheckCircle size={14} className="text-green-400" />
                  : <AlertTriangle size={14} className="text-red-400" />
                }
                <span className="text-sm font-medium">{log.jobName}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  {new Date(log.lastRun).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </p>
                {log.duration && <p className="text-[10px] text-gray-600">{log.duration}ms</p>}
              </div>
            </div>
          ))}
          {cronLogs.length === 0 && (
            <p className="text-center text-gray-500 py-4">No logs yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="text-gray-400 mb-1">{icon}</div>
      <span className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-1">{label}</span>
    </div>
  );
}
