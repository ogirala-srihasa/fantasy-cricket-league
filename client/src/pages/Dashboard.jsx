import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MatchCard, LeaderboardTable, CountdownTimer } from '../components/SharedComponents';
import { Trophy, Swords, TrendingUp, Zap, ArrowRight, Crown, Target } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user, league, api } = useAuth();
  const { socket } = useSocket();
  const [auctionLeaderboard, setAuctionLeaderboard] = useState([]);
  const [matchLeaderboard, setMatchLeaderboard] = useState([]);
  const [upcomingMatch, setUpcomingMatch] = useState(null);
  const [liveMatch, setLiveMatch] = useState(null);
  const [recentMatch, setRecentMatch] = useState(null);
  const [mySquadSize, setMySquadSize] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('match_completed', () => {
      fetchDashboardData();
      toast('🏏 Match completed! Points updated.');
    });
    socket.on('auction_points_updated', () => fetchDashboardData());
    socket.on('match_points_updated', () => fetchDashboardData());
    return () => {
      socket.off('match_completed');
      socket.off('auction_points_updated');
      socket.off('match_points_updated');
    };
  }, [socket]);

  const fetchDashboardData = async () => {
    try {
      const [aLb, mLb, matches, squad] = await Promise.all([
        api.get('/contest-a/leaderboard').catch(() => ({ data: { leaderboard: [] } })),
        api.get('/contest-b/cumulative').catch(() => ({ data: { byPoints: [] } })),
        api.get('/contest-b/matches').catch(() => ({ data: { matches: [] } })),
        api.get('/contest-a/my-squad').catch(() => ({ data: { squad: [] } })),
      ]);

      setAuctionLeaderboard(aLb.data.leaderboard?.slice(0, 5) || []);
      setMatchLeaderboard(mLb.data.byPoints?.slice(0, 5) || []);
      setMySquadSize(squad.data.squad?.length || 0);

      const matchList = matches.data.matches || [];
      setUpcomingMatch(matchList.find(m => m.status === 'upcoming') || null);
      setLiveMatch(matchList.find(m => m.status === 'live') || null);
      setRecentMatch(matchList.filter(m => m.status === 'completed').sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0] || null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const myAuctionRank = auctionLeaderboard.findIndex(e => e.userId === user?.id) + 1;
  const myAuctionPts = auctionLeaderboard.find(e => e.userId === user?.id)?.totalPoints || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Welcome Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-primary-700/50 to-primary-800/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gold-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-display font-bold">
            Welcome, <span className="text-gradient-gold">{user?.name}</span> 🏏
          </h1>
          <p className="text-gray-400 mt-1">
            {league?.name} • Invite Code: <span className="text-gold-400 font-mono">{league?.inviteCode}</span>
          </p>
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="stat-card px-6">
              <span className="text-2xl font-bold text-gold-400">₹{user?.purse?.toFixed(1)}</span>
              <span className="text-xs text-gray-400 mt-1">Purse (Cr)</span>
            </div>
            <div className="stat-card px-6">
              <span className="text-2xl font-bold text-gold-400">{mySquadSize}/11</span>
              <span className="text-xs text-gray-400 mt-1">Auction Squad</span>
            </div>
            {myAuctionRank > 0 && (
              <div className="stat-card px-6">
                <span className="text-2xl font-bold text-gold-400">#{myAuctionRank}</span>
                <span className="text-xs text-gray-400 mt-1">Season Rank</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Contest Sections */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Contest A — Auction Tournament */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="text-gold-400" size={22} />
            <h2 className="text-xl font-display font-bold text-gradient-gold">Contest A — Auction Tournament</h2>
          </div>

          {/* My Squad Status */}
          <div className="glass-card-gold contest-a-accent p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gold-300 flex items-center gap-2">
                <Trophy size={16} /> Your Auction Squad
              </h3>
              <Link to="/my-squad" className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1">
                View <ArrowRight size={12} />
              </Link>
            </div>
            {mySquadSize > 0 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{mySquadSize} players • Season Points</p>
                  <p className="text-3xl font-bold text-gold-400 mt-1">{myAuctionPts.toFixed(0)} pts</p>
                </div>
                {myAuctionRank > 0 && (
                  <div className="text-center">
                    <p className="text-4xl font-bold text-gold-300">#{myAuctionRank}</p>
                    <p className="text-xs text-gray-500">Rank</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400">No squad yet</p>
                <Link to="/auction" className="btn-primary text-sm mt-2 inline-block">Join Auction</Link>
              </div>
            )}
          </div>

          {/* Auction Leaderboard */}
          <div className="glass-card-gold p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gold-300">Season Leaderboard</h3>
              <Link to="/contest-a/leaderboard" className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1">
                Full <ArrowRight size={12} />
              </Link>
            </div>
            <LeaderboardTable entries={auctionLeaderboard} contestType="auction" />
          </div>
        </div>

        {/* Contest B — Per-match Contest */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="text-emerald-400" size={22} />
            <h2 className="text-xl font-display font-bold text-gradient-green">Contest B — Per-match Contests</h2>
          </div>

          {/* Next Match */}
          {(upcomingMatch || liveMatch) && (
            <div className="glass-card-green contest-b-accent p-5">
              <h3 className="font-semibold text-emerald-300 flex items-center gap-2 mb-3">
                <Swords size={16} /> {liveMatch ? 'Live Match' : 'Next Match'}
              </h3>
              <MatchCard match={liveMatch || upcomingMatch}>
                <div className="flex items-center justify-between mt-2">
                  {!liveMatch && upcomingMatch && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Deadline:</span>
                        <CountdownTimer deadline={upcomingMatch.selectionDeadline} />
                      </div>
                      <Link to={`/match/${upcomingMatch.id}/pick`}
                        className={`btn-green text-sm py-2 ${upcomingMatch.hasSubmitted ? 'opacity-50' : ''}`}>
                        {upcomingMatch.hasSubmitted ? 'Team Selected ✓' : 'Create Team →'}
                      </Link>
                    </>
                  )}
                  {liveMatch && (
                    <div className="w-full text-center">
                      <Link to={`/match/${liveMatch.id}/pick`} className="text-emerald-400 text-sm hover:text-emerald-300">
                        View Live Points →
                      </Link>
                    </div>
                  )}
                </div>
              </MatchCard>
            </div>
          )}

          {/* Match Leaderboard */}
          <div className="glass-card-green p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-emerald-300">Cumulative Standings</h3>
              <Link to="/contest-b/leaderboard" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                Full <ArrowRight size={12} />
              </Link>
            </div>
            <LeaderboardTable entries={matchLeaderboard} contestType="per_match" />
          </div>
        </div>
      </div>
    </div>
  );
}
