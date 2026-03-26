import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LeaderboardTable } from '../../components/SharedComponents';
import { BarChart3, Trophy, Target } from 'lucide-react';

export default function ContestBLeaderboard() {
  const { api } = useAuth();
  const [byPoints, setByPoints] = useState([]);
  const [byWins, setByWins] = useState([]);
  const [view, setView] = useState('points');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contest-b/cumulative')
      .then(res => {
        setByPoints(res.data.byPoints || []);
        setByWins(res.data.byWins || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="text-emerald-400" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold text-gradient-green">Per-match Standings</h1>
          <p className="text-sm text-gray-400">Contest B — Cumulative Per-match Rankings</p>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        <button onClick={() => setView('points')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all
            ${view === 'points' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
        >
          <Target size={14} /> Total Points
        </button>
        <button onClick={() => setView('wins')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all
            ${view === 'wins' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
        >
          <Trophy size={14} /> Match Wins
        </button>
      </div>

      <div className="glass-card-green contest-b-accent p-6">
        {view === 'points' ? (
          <LeaderboardTable entries={byPoints} contestType="per_match" />
        ) : (
          <div className="space-y-2">
            {byWins.map((entry, i) => (
              <div key={entry.userId} className="leaderboard-row">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center">
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-gray-500 font-mono text-sm">#{i + 1}</span>}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{entry.userName}</p>
                    <p className="text-xs text-gray-500">{entry.totalPoints?.toFixed(0)} total pts</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-emerald-400">{entry.matchWins}</p>
                  <p className="text-xs text-gray-500">wins</p>
                </div>
              </div>
            ))}
            {byWins.length === 0 && (
              <p className="text-center text-gray-500 py-8">No matches completed yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
