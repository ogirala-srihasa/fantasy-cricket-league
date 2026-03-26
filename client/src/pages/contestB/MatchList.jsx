import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MatchCard, CountdownTimer, LiveBadge } from '../../components/SharedComponents';
import { Swords, CheckCircle, Clock, ArrowRight } from 'lucide-react';

export default function MatchList() {
  const { api } = useAuth();
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contest-b/matches')
      .then(res => setMatches(res.data.matches || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? matches : matches.filter(m => m.status === filter);

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Swords className="text-emerald-400" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold text-gradient-green">Per-match Contests</h1>
          <p className="text-sm text-gray-400">Contest B — Pick a fresh team for every match</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'upcoming', 'live', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize
              ${filter === f ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            {f} {f !== 'all' && `(${matches.filter(m => m.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Match Cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {filtered.map(match => (
          <MatchCard key={match.id} match={match}>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
              {match.status === 'upcoming' && (
                <>
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-gray-500" />
                    <CountdownTimer deadline={match.selectionDeadline} />
                  </div>
                  <Link
                    to={`/match/${match.id}/pick`}
                    className={`text-sm font-medium flex items-center gap-1 transition-colors
                      ${match.hasSubmitted ? 'text-emerald-400' : 'text-gold-400 hover:text-gold-300'}`}
                  >
                    {match.hasSubmitted ? <><CheckCircle size={14} /> Team Ready</> : <>Create Team <ArrowRight size={12} /></>}
                  </Link>
                </>
              )}
              {match.status === 'live' && (
                <Link to={`/match/${match.id}/pick`} className="w-full text-center text-emerald-400 text-sm font-medium hover:text-emerald-300 flex items-center justify-center gap-2">
                  <LiveBadge /> View Live Points
                </Link>
              )}
              {match.status === 'completed' && (
                <Link to={`/match/${match.id}/pick`} className="w-full text-center text-gray-400 text-sm hover:text-white flex items-center justify-center gap-1">
                  View Results <ArrowRight size={12} />
                </Link>
              )}
            </div>
          </MatchCard>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 glass-card">
          <Swords size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No {filter !== 'all' ? filter : ''} matches found</p>
        </div>
      )}
    </div>
  );
}
