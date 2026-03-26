import { useState, useEffect } from 'react';

export function RoleBadge({ role }) {
  const config = {
    BAT: { label: 'BAT', className: 'role-bat' },
    BOWL: { label: 'BOWL', className: 'role-bowl' },
    AR: { label: 'AR', className: 'role-ar' },
    WK: { label: 'WK', className: 'role-wk' },
  };
  const c = config[role] || config.BAT;
  return <span className={`role-badge ${c.className}`}>{c.label}</span>;
}

export function LiveBadge() {
  return <span className="live-badge">LIVE</span>;
}

export function CountdownTimer({ deadline }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setTimeLeft('LOCKED'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <span className={`text-sm font-mono font-bold ${timeLeft === 'LOCKED' ? 'text-red-400' : 'text-gold-300'}`}>
      {timeLeft}
    </span>
  );
}

export function PlayerCard({ player, onClick, selected, isCaptain, isVC, showPoints, compact }) {
  const teamColors = {
    CSK: 'border-yellow-400/30', MI: 'border-blue-500/30', RCB: 'border-red-500/30',
    KKR: 'border-purple-500/30', DC: 'border-blue-400/30', PBKS: 'border-red-400/30',
    RR: 'border-pink-500/30', SRH: 'border-orange-500/30', LSG: 'border-cyan-500/30',
    GT: 'border-gray-400/30',
  };

  return (
    <div
      onClick={onClick}
      className={`relative p-3 rounded-xl border transition-all duration-200 ${onClick ? 'cursor-pointer' : ''}
        ${selected
          ? 'bg-gold-500/10 border-gold-400/40 shadow-lg shadow-gold-500/10'
          : `bg-white/5 ${teamColors[player.iplTeam] || 'border-white/10'} hover:bg-white/10`
        }
        ${isCaptain ? 'ring-2 ring-gold-400' : ''}
        ${isVC ? 'ring-2 ring-emerald-400' : ''}
      `}
    >
      {(isCaptain || isVC) && (
        <span className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
          ${isCaptain ? 'bg-gold-500 text-primary-900' : 'bg-emerald-500 text-white'}`}>
          {isCaptain ? 'C' : 'VC'}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gold-400">
            {player.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-medium text-white leading-tight">{player.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-gray-400">{player.iplTeam}</span>
              <RoleBadge role={player.role} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {player.purchasePrice && (
            <span className="text-xs text-gray-400">₹{player.purchasePrice}Cr</span>
          )}
          {showPoints !== undefined && (
            <span className="text-sm font-bold text-gold-400">{showPoints} pts</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MatchCard({ match, children }) {
  const statusColors = {
    upcoming: 'text-blue-400',
    locked: 'text-yellow-400',
    live: 'text-green-400',
    completed: 'text-gray-400',
  };

  return (
    <div className="glass-card p-4 hover:bg-white/[0.07] transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {match.status === 'live' ? <LiveBadge /> : (
            <span className={`text-xs font-bold uppercase ${statusColors[match.status]}`}>
              {match.status}
            </span>
          )}
          {match.matchNumber && (
            <span className="text-xs text-gray-500">Match {match.matchNumber}</span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {new Date(match.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex items-center justify-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-xs font-bold border border-white/10">{match.team1}</span>
          <span className="text-lg font-bold font-display">{match.team1}</span>
        </div>
        <span className="text-gray-600 font-light text-lg">vs</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold font-display">{match.team2}</span>
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-xs font-bold border border-white/10">{match.team2}</span>
        </div>
      </div>

      {match.venue && <p className="text-xs text-gray-500 text-center mb-3">📍 {match.venue}</p>}
      {children}
    </div>
  );
}

export function LeaderboardTable({ entries, contestType }) {
  const accentColor = contestType === 'auction' ? 'gold' : 'emerald';
  const rankEmoji = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={entry.userId || index} className="leaderboard-row">
          <div className="flex items-center gap-3">
            <span className="w-8 text-center">
              {index < 3 ? <span className="text-lg">{rankEmoji[index]}</span> : <span className="text-gray-500 font-mono text-sm">#{index + 1}</span>}
            </span>
            <div>
              <p className="font-medium text-sm">{entry.userName}</p>
              <p className="text-xs text-gray-500">
                {entry.matchesPlayed || 0} {(entry.matchesPlayed || 0) === 1 ? 'match' : 'matches'}
                {(entry.matchWins || 0) > 0 && ` • ${entry.matchWins} wins`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-bold text-lg ${accentColor === 'gold' ? 'text-gold-400' : 'text-emerald-400'}`}>
              {(entry.totalPoints || 0).toFixed(0)}
            </p>
            {(entry.bestScore || 0) > 0 && (
              <p className="text-xs text-gray-500">Best: {entry.bestScore.toFixed(0)}</p>
            )}
          </div>
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">🏏</p>
          <p className="text-gray-500 mt-2">No entries yet</p>
        </div>
      )}
    </div>
  );
}
