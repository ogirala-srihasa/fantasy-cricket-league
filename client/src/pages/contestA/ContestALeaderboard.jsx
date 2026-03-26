import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LeaderboardTable } from '../../components/SharedComponents';
import { Trophy } from 'lucide-react';

export default function ContestALeaderboard() {
  const { api } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contest-a/leaderboard')
      .then(res => setLeaderboard(res.data.leaderboard || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="text-gold-400" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold text-gradient-gold">Season Leaderboard</h1>
          <p className="text-sm text-gray-400">Contest A — Auction Tournament Rankings</p>
        </div>
      </div>

      <div className="glass-card-gold contest-a-accent p-6">
        <LeaderboardTable entries={leaderboard} contestType="auction" />
      </div>
    </div>
  );
}
