import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { RoleBadge, CountdownTimer, LeaderboardTable, LiveBadge } from '../../components/SharedComponents';
import { Check, Crown, Shield, Users, AlertTriangle, ArrowLeft, Star } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeamPicker() {
  const { matchId } = useParams();
  const { api, user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [selected, setSelected] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [vcId, setVcId] = useState(null);
  const [existingTeam, setExistingTeam] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('pick'); // pick | live | result

  useEffect(() => {
    fetchData();
  }, [matchId]);

  useEffect(() => {
    if (!socket) return;
    socket.on('match_points_updated', (data) => {
      if (data.matchId === matchId) fetchLiveData();
    });
    socket.on('match_completed', (data) => {
      if (data.matchId === matchId) fetchData();
    });
    return () => { socket.off('match_points_updated'); socket.off('match_completed'); };
  }, [socket, matchId]);

  const fetchData = async () => {
    try {
      const [squadsRes, myTeamRes, lbRes, liveRes] = await Promise.all([
        api.get(`/contest-b/match/${matchId}/squads`),
        api.get(`/contest-b/match/${matchId}/my-team`),
        api.get(`/contest-b/match/${matchId}/leaderboard`).catch(() => ({ data: { leaderboard: [] } })),
        api.get(`/contest-b/match/${matchId}/live`).catch(() => ({ data: {} })),
      ]);

      setMatch(squadsRes.data.match);
      setTeam1Players(squadsRes.data.team1Players || []);
      setTeam2Players(squadsRes.data.team2Players || []);
      setLeaderboard(lbRes.data.leaderboard || []);
      setLiveData(liveRes.data);

      if (myTeamRes.data.team) {
        setExistingTeam(myTeamRes.data.team);
        setSelected(myTeamRes.data.team.players.map(p => p.id));
        setCaptainId(myTeamRes.data.team.captainId);
        setVcId(myTeamRes.data.team.vcId);
      }

      // Auto-set tab
      if (squadsRes.data.match?.status === 'live') setTab('live');
      else if (squadsRes.data.match?.status === 'completed') setTab('result');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load match data');
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveData = async () => {
    try {
      const [liveRes, lbRes] = await Promise.all([
        api.get(`/contest-b/match/${matchId}/live`),
        api.get(`/contest-b/match/${matchId}/leaderboard`),
      ]);
      setLiveData(liveRes.data);
      setLeaderboard(lbRes.data.leaderboard || []);
    } catch (err) { console.error(err); }
  };

  const togglePlayer = (playerId, teamName) => {
    if (existingTeam && match?.status !== 'upcoming') return;

    if (selected.includes(playerId)) {
      setSelected(selected.filter(id => id !== playerId));
      if (captainId === playerId) setCaptainId(null);
      if (vcId === playerId) setVcId(null);
    } else {
      if (selected.length >= 11) {
        toast.error('Max 11 players');
        return;
      }
      // Check max 7 per team
      const allPlayers = [...team1Players, ...team2Players];
      const newPlayer = allPlayers.find(p => p.id === playerId);
      const sameTeamCount = selected.filter(id => {
        const p = allPlayers.find(p => p.id === id);
        return p?.iplTeam === newPlayer?.iplTeam;
      }).length;
      if (sameTeamCount >= 7) {
        toast.error('Max 7 players from one team');
        return;
      }
      setSelected([...selected, playerId]);
    }
  };

  const assignCaptain = (playerId) => {
    if (vcId === playerId) setVcId(null);
    setCaptainId(captainId === playerId ? null : playerId);
  };

  const assignVC = (playerId) => {
    if (captainId === playerId) setCaptainId(null);
    setVcId(vcId === playerId ? null : playerId);
  };

  const submitTeam = async () => {
    if (selected.length !== 11) { toast.error('Select exactly 11 players'); return; }
    if (!captainId) { toast.error('Select a Captain'); return; }
    if (!vcId) { toast.error('Select a Vice-Captain'); return; }

    setSubmitting(true);
    try {
      await api.post(`/contest-b/match/${matchId}/select-team`, {
        selectedPlayers: selected, captainId, vcId,
      });
      toast.success('Team submitted! 🏏');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const allPlayers = [...team1Players, ...team2Players];
  const isLocked = match?.status !== 'upcoming';
  const team1Selected = selected.filter(id => team1Players.find(p => p.id === id)).length;
  const team2Selected = selected.filter(id => team2Players.find(p => p.id === id)).length;

  if (loading) return <div className="min-h-[80vh] flex items-center justify-center"><div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/matches')} className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold">
              {match?.team1} <span className="text-gray-500">vs</span> {match?.team2}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {match?.status === 'live' && <LiveBadge />}
              {match?.status === 'upcoming' && (
                <span className="text-xs text-gray-400">Deadline: <CountdownTimer deadline={match.selectionDeadline} /></span>
              )}
              {match?.status === 'completed' && <span className="text-xs text-gray-400">Completed</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="text-sm bg-white/5 px-3 py-1 rounded-lg">
            Selected: <span className="text-emerald-400 font-bold">{selected.length}/11</span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {['pick', 'live', 'result'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all
              ${tab === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
          >
            {t === 'pick' ? `Team (${selected.length}/11)` : t === 'live' ? 'Live Points' : 'Results'}
          </button>
        ))}
      </div>

      {/* Tab: Team Picker */}
      {tab === 'pick' && (
        <div className="space-y-4">
          {/* Team Composition */}
          <div className="flex gap-4 text-sm">
            <span className="bg-white/5 px-3 py-1 rounded-lg">{match?.team1}: <span className="text-emerald-400 font-bold">{team1Selected}</span>/7</span>
            <span className="bg-white/5 px-3 py-1 rounded-lg">{match?.team2}: <span className="text-emerald-400 font-bold">{team2Selected}</span>/7</span>
          </div>

          {/* Two-column player layout */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Team 1 */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">{match?.team1}</span>
                {match?.team1} Players
              </h3>
              <div className="space-y-2">
                {team1Players.map(player => (
                  <PlayerSelectRow
                    key={player.id}
                    player={player}
                    isSelected={selected.includes(player.id)}
                    isCaptain={captainId === player.id}
                    isVC={vcId === player.id}
                    onToggle={() => togglePlayer(player.id, match?.team1)}
                    onCaptain={() => assignCaptain(player.id)}
                    onVC={() => assignVC(player.id)}
                    disabled={isLocked && !existingTeam}
                    showSelect={selected.includes(player.id)}
                  />
                ))}
              </div>
            </div>

            {/* Team 2 */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">{match?.team2}</span>
                {match?.team2} Players
              </h3>
              <div className="space-y-2">
                {team2Players.map(player => (
                  <PlayerSelectRow
                    key={player.id}
                    player={player}
                    isSelected={selected.includes(player.id)}
                    isCaptain={captainId === player.id}
                    isVC={vcId === player.id}
                    onToggle={() => togglePlayer(player.id, match?.team2)}
                    onCaptain={() => assignCaptain(player.id)}
                    onVC={() => assignVC(player.id)}
                    disabled={isLocked && !existingTeam}
                    showSelect={selected.includes(player.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Submit */}
          {!isLocked && (
            <div className="sticky bottom-4">
              <button onClick={submitTeam} disabled={submitting || selected.length !== 11 || !captainId || !vcId}
                className="btn-green w-full text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed" id="submit-team-btn">
                {submitting ? 'Submitting...' : existingTeam ? 'Update Team' : 'Submit Team 🏏'}
                {selected.length === 11 && captainId && vcId && ' ✓'}
              </button>
              {(selected.length !== 11 || !captainId || !vcId) && (
                <p className="text-xs text-gray-500 text-center mt-2 flex items-center justify-center gap-1">
                  <AlertTriangle size={12} />
                  {selected.length !== 11 ? `Select ${11 - selected.length} more players` : !captainId ? 'Select a Captain (C)' : 'Select a Vice-Captain (VC)'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Live Points */}
      {tab === 'live' && (
        <div className="space-y-4">
          {liveData?.myPoints && (
            <div className="glass-card-green p-6 text-center">
              <p className="text-sm text-gray-400">Your Live Points</p>
              <p className="text-5xl font-bold text-emerald-400 mt-2 animate-counter">{liveData.myPoints.totalPoints?.toFixed(0)}</p>
              {liveData.myPoints.isInterim && <p className="text-xs text-gray-500 mt-1">Interim — updating live</p>}
            </div>
          )}

          {/* Player breakdown */}
          {liveData?.myPoints?.breakdown && (
            <div className="glass-card p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Your Player Points</h3>
              {liveData.myPoints.breakdown.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.playerName}</span>
                    {p.isCaptain && <span className="text-xs bg-gold-500/20 text-gold-400 px-1.5 rounded">C</span>}
                    {p.isVC && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 rounded">VC</span>}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-400">{p.final?.toFixed(0)} pts</span>
                    {p.multiplier > 1 && <span className="text-xs text-gray-500 ml-1">({p.multiplier}×)</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mini leaderboard */}
          <div className="glass-card-green p-4">
            <h3 className="text-sm font-semibold text-emerald-300 mb-3">Match Leaderboard</h3>
            <LeaderboardTable entries={leaderboard.map(e => ({ ...e, matchesPlayed: null }))} contestType="per_match" />
          </div>
        </div>
      )}

      {/* Tab: Results */}
      {tab === 'result' && (
        <div className="space-y-4">
          <div className="glass-card-green p-4">
            <h3 className="text-sm font-semibold text-emerald-300 mb-3">Final Standings</h3>
            <LeaderboardTable entries={leaderboard.map(e => ({ ...e, matchesPlayed: null }))} contestType="per_match" />
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSelectRow({ player, isSelected, isCaptain, isVC, onToggle, onCaptain, onVC, disabled }) {
  return (
    <div className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-200 group
      ${isSelected
        ? 'bg-emerald-500/10 border-emerald-400/30'
        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
      } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
    >
      {/* Checkbox */}
      <button onClick={onToggle} disabled={disabled}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600 hover:border-emerald-400'}`}
      >
        {isSelected && <Check size={12} className="text-white" />}
      </button>

      {/* Player Info */}
      <div className="flex-1 min-w-0" onClick={onToggle}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{player.name}</span>
          <RoleBadge role={player.role} />
        </div>
        {player.avgFantasyPoints > 0 && (
          <span className="text-[10px] text-gray-500">Avg: {player.avgFantasyPoints} pts</span>
        )}
      </div>

      {/* C / VC buttons */}
      {isSelected && (
        <div className="flex gap-1">
          <button onClick={onVC}
            className={`w-7 h-7 rounded-full text-[10px] font-bold border transition-all
              ${isVC ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-600 text-gray-500 hover:border-emerald-400'}`}
          >VC</button>
          <button onClick={onCaptain}
            className={`w-7 h-7 rounded-full text-[10px] font-bold border transition-all
              ${isCaptain ? 'bg-gold-500 border-gold-500 text-primary-900' : 'border-gray-600 text-gray-500 hover:border-gold-400'}`}
          >C</button>
        </div>
      )}
    </div>
  );
}
