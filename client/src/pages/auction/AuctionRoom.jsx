import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { PlayerCard, RoleBadge } from '../../components/SharedComponents';
import { Gavel, Timer, Users, DollarSign, Play, Pause, SkipForward, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuctionRoom() {
  const { user, league, api } = useAuth();
  const { socket, connected } = useSocket();
  const [state, setState] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [bidAmount, setBidAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const bidLogRef = useRef(null);

  useEffect(() => {
    fetchAuctionState();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('auction_state', (data) => { setState(data); setLoading(false); });
    socket.on('player_nominated', (data) => {
      const normalizedPlayer = { ...data, id: data.playerId, name: data.playerName };
      setState(prev => {
        if (!prev) return prev;
        const nextSession = prev.session ? { ...prev.session, currentPlayer: normalizedPlayer, currentBid: data.basePrice, currentBidderId: null, timerEndsAt: data.timerEndsAt } : prev.session;
        return { ...prev, session: nextSession, currentPlayer: normalizedPlayer, currentBid: data.basePrice, currentBidder: null, timerEndsAt: data.timerEndsAt };
      });
      setBidAmount(data.basePrice + 0.05);
      toast(`🏏 ${data.playerName} (${data.iplTeam}) nominated!`);
    });
    socket.on('new_bid', (data) => {
      setState(prev => {
        if (!prev) return prev;
        const nextSession = prev.session ? { ...prev.session, currentBid: data.amount, currentBidderId: data.userId, timerEndsAt: data.timerEndsAt } : prev.session;
        return { 
          ...prev, 
          session: nextSession,
          currentBid: data.amount, 
          currentBidder: { id: data.userId, name: data.userName }, 
          timerEndsAt: data.timerEndsAt, 
          recentBids: [{ userName: data.userName, playerName: data.playerName, amount: data.amount, timestamp: new Date() }, ...(prev.recentBids || []).slice(0, 19)] 
        };
      });
      setBidAmount(data.amount + 0.05);
    });
    socket.on('player_sold', (data) => {
      toast.success(`🎉 ${data.playerName} → ${data.buyerName} for ₹${data.amount} Cr`);
      fetchAuctionState();
    });
    socket.on('player_unsold', (data) => {
      toast(`${data.playerName} went unsold`);
      fetchAuctionState();
    });
    socket.on('auction_complete', (data) => toast.success('🏆 Auction Complete! All squads filled!'));
    socket.on('auction_paused', () => toast('⏸️ Auction paused'));
    socket.on('auction_resumed', (data) => { setState(data); toast('▶️ Auction resumed'); });
    socket.on('timer_tick', ({ secondsLeft: sl }) => setSecondsLeft(sl));
    socket.on('error', (data) => toast.error(data.message));

    if (league?.id) {
      socket.emit('join_auction', { leagueId: league.id, userId: user?.id });
    }

    return () => {
      ['auction_state', 'player_nominated', 'new_bid', 'player_sold', 'player_unsold', 'auction_complete', 'auction_paused', 'auction_resumed', 'timer_tick', 'error'].forEach(e => socket.off(e));
    };
  }, [socket, league?.id]);

  const fetchAuctionState = async () => {
    try {
      const res = await api.get('/auction/state');
      if (res.data.session) {
        setState(res.data);
        setBidAmount((res.data.session?.currentBid || 0) + 0.05);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const placeBid = () => {
    if (!socket || !state?.session?.id) return;
    socket.emit('place_bid', { sessionId: state.session.id, userId: user.id, amount: bidAmount });
  };

  const startAuction = () => socket?.emit('admin_start_auction', { leagueId: league.id, userId: user.id });
  const pauseAuction = () => socket?.emit('admin_pause_auction', { sessionId: state?.session?.id });
  const resumeAuction = () => socket?.emit('admin_resume_auction', { sessionId: state?.session?.id });
  const skipPlayer = () => socket?.emit('admin_skip_player', { sessionId: state?.session?.id });

  const session = state?.session || state;
  const currentPlayer = session?.currentPlayer || state?.currentPlayer;
  const users = state?.users || [];
  const recentBids = state?.recentBids || [];

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || session.status === 'no_auction' || !state) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="glass-card-gold p-12">
          <Gavel size={48} className="text-gold-400 mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-gradient-gold mb-2">Auction Room</h2>
          <p className="text-gray-400 mb-6">The auction hasn't started yet.</p>
          {user?.role === 'admin' && (
            <button onClick={startAuction} className="btn-primary">
              <Play size={16} className="inline mr-2" /> Start Auction
            </button>
          )}
          {user?.role !== 'admin' && (
            <p className="text-sm text-gray-500">Waiting for the admin to start the auction...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Admin Controls */}
      {user?.role === 'admin' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {session.status !== 'active' && (
            <button onClick={session.status === 'paused' ? resumeAuction : startAuction} className="btn-primary text-sm py-2">
              <Play size={14} className="inline mr-1" /> {session.status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}
          {session.status === 'active' && (
            <>
              <button onClick={pauseAuction} className="btn-secondary text-sm py-2">
                <Pause size={14} className="inline mr-1" /> Pause
              </button>
              <button onClick={skipPlayer} className="btn-secondary text-sm py-2">
                <SkipForward size={14} className="inline mr-1" /> Skip Player
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Left: Users Panel */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-1 mb-2">
            <Users size={14} /> Players ({users.length})
          </h3>
          {users.map(u => (
            <div key={u.id} className={`glass-card p-3 ${u.id === user?.id ? 'border-gold-400/30' : ''}`}>
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">{u.name} {u.id === user?.id && '(You)'}</p>
                <span className="text-xs text-gold-400 font-bold">₹{u.purse?.toFixed(1)}Cr</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{u.squadCount}/11 players</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {u.squad?.map(p => (
                  <span key={p.id} className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400">{p.name.split(' ').pop()}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Center: Current Player */}
        <div className="lg:col-span-2">
          {currentPlayer ? (
            <div className="glass-card-gold p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gold-500/5 to-transparent pointer-events-none" />
              <div className="relative">
                {/* Timer */}
                <div className="mb-4">
                  <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center border-4 text-3xl font-bold font-mono
                    ${secondsLeft <= 5 ? 'border-red-500 text-red-400 animate-pulse' : 'border-gold-400 text-gold-400'}`}>
                    {secondsLeft}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">seconds left</p>
                </div>

                {/* Player Info */}
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-white/20 to-white/5 border border-white/20 flex items-center justify-center text-2xl font-bold text-gold-400 mb-3">
                  {currentPlayer.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <h2 className="text-2xl font-display font-bold">{currentPlayer.name}</h2>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <span className="text-sm text-gray-400">{currentPlayer.iplTeam}</span>
                  <RoleBadge role={currentPlayer.role} />
                  <span className="text-xs px-2 py-0.5 bg-white/10 rounded text-gray-300">Tier {currentPlayer.tier}</span>
                </div>

                {/* Current Bid */}
                <div className="mt-6 p-4 bg-white/5 rounded-xl">
                  <p className="text-sm text-gray-400">Current Bid</p>
                  <p className="text-4xl font-bold text-gold-400 mt-1">
                    ₹{(state?.currentBid || session?.currentBid || currentPlayer.basePrice)?.toFixed(2)} Cr
                  </p>
                  {(state?.currentBidder || session?.currentBidderId) && (
                    <p className="text-sm text-emerald-400 mt-1">
                      by {state?.currentBidder?.name || 'bidder'}
                    </p>
                  )}
                </div>

                {/* Bid Controls */}
                {session.status === 'active' && (
                  <div className="mt-4 flex items-center gap-3 justify-center">
                    <button onClick={() => setBidAmount(prev => Math.max(prev - 0.05, (state?.currentBid || 0) + 0.05))}
                      className="w-10 h-10 rounded-full bg-white/10 text-lg font-bold hover:bg-white/20">−</button>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">₹{bidAmount.toFixed(2)} Cr</p>
                      <p className="text-xs text-gray-500">Your bid</p>
                    </div>
                    <button onClick={() => setBidAmount(prev => prev + 0.05)}
                      className="w-10 h-10 rounded-full bg-white/10 text-lg font-bold hover:bg-white/20">+</button>
                  </div>
                )}

                {session.status === 'active' && (
                  <button onClick={placeBid} className="btn-primary mt-4 text-lg px-10" id="place-bid-btn">
                    🏏 BID ₹{bidAmount.toFixed(2)} Cr
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <Timer size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">
                {session.status === 'completed' ? 'Auction completed!' : 'Waiting for next player...'}
              </p>
            </div>
          )}
        </div>

        {/* Right: Bid Log */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-1">
            <DollarSign size={14} /> Bid Log
          </h3>
          <div ref={bidLogRef} className="glass-card p-3 max-h-[600px] overflow-y-auto space-y-2">
            {recentBids.map((bid, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="font-medium text-xs">{bid.userName}</p>
                  <p className="text-[10px] text-gray-500">{bid.playerName}</p>
                </div>
                <span className="text-gold-400 font-bold text-sm">₹{bid.amount?.toFixed(2)}Cr</span>
              </div>
            ))}
            {recentBids.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No bids yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: My Squad */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Your Squad ({users.find(u => u.id === user?.id)?.squadCount || 0}/11)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {(users.find(u => u.id === user?.id)?.squad || []).map(p => (
            <PlayerCard key={p.id} player={p} showPoints={p.price} />
          ))}
        </div>
      </div>
    </div>
  );
}
