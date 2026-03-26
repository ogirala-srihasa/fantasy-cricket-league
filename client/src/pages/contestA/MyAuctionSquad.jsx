import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PlayerCard, RoleBadge } from '../../components/SharedComponents';
import { Crown, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

export default function MyAuctionSquad() {
  const { api } = useAuth();
  const [squad, setSquad] = useState([]);
  const [matchHistory, setMatchHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/contest-a/my-squad'),
      api.get('/contest-a/match-history'),
    ]).then(([squadRes, historyRes]) => {
      setSquad(squadRes.data.squad || []);
      setMatchHistory(historyRes.data.matches || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const totalPoints = squad.reduce((sum, p) => sum + (p.seasonPoints || 0), 0);
  const totalSpent = squad.reduce((sum, p) => sum + (p.purchasePrice || 0), 0);

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="text-gold-400" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold text-gradient-gold">My Auction Squad</h1>
          <p className="text-sm text-gray-400">Contest A — Season-long Tournament</p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <span className="text-2xl font-bold text-gold-400">{squad.length}</span>
          <span className="text-xs text-gray-400 mt-1">Players</span>
        </div>
        <div className="stat-card">
          <span className="text-2xl font-bold text-gold-400">{totalPoints.toFixed(0)}</span>
          <span className="text-xs text-gray-400 mt-1">Season Points</span>
        </div>
        <div className="stat-card">
          <span className="text-2xl font-bold text-gold-400">₹{totalSpent.toFixed(1)}</span>
          <span className="text-xs text-gray-400 mt-1">Total Spent (Cr)</span>
        </div>
        <div className="stat-card">
          <span className="text-2xl font-bold text-gold-400">{matchHistory.length}</span>
          <span className="text-xs text-gray-400 mt-1">Matches</span>
        </div>
      </div>

      {/* Squad Grid */}
      <div className="glass-card-gold p-5">
        <h3 className="font-semibold text-gold-300 mb-4">Your 11 Players</h3>
        {squad.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No players yet. Join the auction!</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {squad.sort((a, b) => (b.seasonPoints || 0) - (a.seasonPoints || 0)).map(player => (
              <PlayerCard key={player.id} player={player} showPoints={player.seasonPoints?.toFixed(0)} />
            ))}
          </div>
        )}
      </div>

      {/* Match-by-match Breakdown */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-gold-300 mb-4 flex items-center gap-2">
          <TrendingUp size={16} /> Match-by-match Breakdown
        </h3>
        <div className="space-y-2">
          {matchHistory.map(match => (
            <div key={match.matchId} className="bg-white/5 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedMatch(expandedMatch === match.matchId ? null : match.matchId)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold uppercase ${match.status === 'completed' ? 'text-gray-400' : 'text-green-400'}`}>
                    {match.status === 'completed' ? '✓' : '●'}
                  </span>
                  <span className="font-medium text-sm">{match.team1} vs {match.team2}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(match.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gold-400">{match.totalPoints?.toFixed(0)} pts</span>
                  {expandedMatch === match.matchId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>
            </div>
          ))}
          {matchHistory.length === 0 && (
            <p className="text-center text-gray-500 py-8">No matches yet — points will appear as IPL matches are played</p>
          )}
        </div>
      </div>
    </div>
  );
}
