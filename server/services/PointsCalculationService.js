const { PrismaClient } = require('@prisma/client');
const { SCORING, CONTEST_TYPE } = require('../utils/constants');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

class PointsCalculationService {
  /**
   * Calculate fantasy points for a player's match performance
   * @param {Object} stats - PlayerMatchStats record
   * @param {string} captainId - Captain player ID (2x)
   * @param {string} vcId - Vice-captain player ID (1.5x)
   * @returns {Object} { basePoints, multiplier, finalPoints, breakdown }
   */
  calculatePlayerPoints(stats, captainId, vcId) {
    let basePoints = 0;
    const breakdown = {};

    // ─── APPEARANCE ────────────────────────────────────────
    if (stats.isPlayingXI) {
      basePoints += SCORING.APPEARANCE.PLAYING_XI;
      breakdown.appearance = SCORING.APPEARANCE.PLAYING_XI;
    }

    // ─── BATTING ───────────────────────────────────────────
    if (stats.runs > 0 || stats.ballsFaced > 0) {
      const runPts = stats.runs * SCORING.BATTING.RUN;
      const boundaryPts = stats.fours * SCORING.BATTING.BOUNDARY_BONUS;
      const sixPts = stats.sixes * SCORING.BATTING.SIX_BONUS;
      let milestonePts = 0;

      if (stats.runs >= 100) milestonePts += SCORING.BATTING.MILESTONE_100;
      if (stats.runs >= 75) milestonePts += SCORING.BATTING.MILESTONE_75;
      if (stats.runs >= 50) milestonePts += SCORING.BATTING.MILESTONE_50;
      if (stats.runs >= 25) milestonePts += SCORING.BATTING.MILESTONE_25;

      basePoints += runPts + boundaryPts + sixPts + milestonePts;
      breakdown.batting = { runs: runPts, boundaries: boundaryPts, sixes: sixPts, milestones: milestonePts };
    }

    // Duck penalty
    if (stats.runs === 0 && stats.ballsFaced > 0 && stats.dismissalType && stats.dismissalType !== 'not out') {
      // Only for BAT and AR roles — we check the player's role from the stats
      basePoints += SCORING.BATTING.DUCK;
      breakdown.duck = SCORING.BATTING.DUCK;
    }

    // ─── BOWLING ───────────────────────────────────────────
    if (stats.wickets > 0 || stats.overs > 0) {
      const wicketPts = stats.wickets * SCORING.BOWLING.WICKET;
      const maidenPts = stats.maidens * SCORING.BOWLING.MAIDEN;

      // LBW/Bowled bonus — parse dismissal types from bowling data
      let lbwBowledCount = 0;
      try {
        const dismissals = JSON.parse(stats.bowlingDismissalTypes || '[]');
        lbwBowledCount = dismissals.filter(d => {
          const lower = (d || '').toLowerCase();
          return lower.includes('lbw') || lower.startsWith('b ') || lower === 'bowled';
        }).length;
      } catch (e) { /* ignore parse errors */ }
      const lbwBowledPts = lbwBowledCount * SCORING.BOWLING.LBW_BOWLED_BONUS;

      let haulPts = 0;
      if (stats.wickets >= 5) haulPts += SCORING.BOWLING.HAUL_5;
      if (stats.wickets >= 4) haulPts += SCORING.BOWLING.HAUL_4;
      if (stats.wickets >= 3) haulPts += SCORING.BOWLING.HAUL_3;

      basePoints += wicketPts + maidenPts + lbwBowledPts + haulPts;
      breakdown.bowling = { wickets: wicketPts, maidens: maidenPts, lbwBowled: lbwBowledPts, hauls: haulPts };
    }

    // ─── FIELDING ──────────────────────────────────────────
    const catchPts = (stats.catches || 0) * SCORING.FIELDING.CATCH;
    const stumpingPts = (stats.stumpings || 0) * SCORING.FIELDING.STUMPING;
    // runOuts is stored as float: integer part = direct, decimal part * 10 = indirect
    const directRunouts = Math.floor(stats.runOuts || 0);
    const indirectRunouts = Math.round(((stats.runOuts || 0) - directRunouts) * 10);
    const runoutPts = directRunouts * SCORING.FIELDING.DIRECT_RUNOUT + indirectRunouts * SCORING.FIELDING.INDIRECT_RUNOUT;

    if (catchPts + stumpingPts + runoutPts > 0) {
      basePoints += catchPts + stumpingPts + runoutPts;
      breakdown.fielding = { catches: catchPts, stumpings: stumpingPts, runouts: runoutPts };
    }

    // ─── MULTIPLIER ────────────────────────────────────────
    let multiplier = 1;
    if (stats.playerId === captainId) multiplier = SCORING.MULTIPLIERS.CAPTAIN;
    else if (stats.playerId === vcId) multiplier = SCORING.MULTIPLIERS.VICE_CAPTAIN;

    const finalPoints = basePoints * multiplier;

    return {
      playerId: stats.playerId,
      basePoints,
      multiplier,
      finalPoints,
      breakdown,
    };
  }

  /**
   * Calculate points for Contest A (auction tournament) for a specific match
   * Idempotent: safe to re-run on same data
   */
  async calculateAuctionPoints(matchId, isInterim = true) {
    logger.info(`Calculating auction points for match ${matchId} (interim: ${isInterim})`);

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error(`Match ${matchId} not found`);

    // Get all users with their auction squads
    const users = await prisma.user.findMany({
      where: { leagueId: match.leagueId },
      include: { userPlayers: { include: { player: true } } },
    });

    // Get match stats for all players
    const matchStats = await prisma.playerMatchStats.findMany({
      where: { matchId },
    });

    const matchStatsMap = new Map(matchStats.map(s => [s.playerId, s]));

    for (const user of users) {
      if (!user.userPlayers || user.userPlayers.length === 0) continue;

      let totalPoints = 0;
      const breakdownArr = [];

      for (const up of user.userPlayers) {
        const stats = matchStatsMap.get(up.playerId);
        if (!stats || !stats.isPlayingXI) {
          breakdownArr.push({
            playerId: up.playerId,
            playerName: up.player.name,
            basePoints: 0,
            multiplier: 1,
            final: 0,
            didNotPlay: !stats?.isPlayingXI,
          });
          continue;
        }

        // No captain/VC in Contest A — all 1x multiplier
        const result = this.calculatePlayerPoints(stats, null, null);
        totalPoints += result.finalPoints;

        breakdownArr.push({
          playerId: up.playerId,
          playerName: up.player.name,
          basePoints: result.basePoints,
          multiplier: 1,
          final: result.finalPoints,
          breakdown: result.breakdown,
        });

        // Log to PointsLog
        await prisma.pointsLog.upsert({
          where: {
            id: `${user.id}_${matchId}_${up.playerId}_auction`,
          },
          update: {
            breakdown: JSON.stringify(result.breakdown),
            calculatedAt: new Date(),
          },
          create: {
            id: `${user.id}_${matchId}_${up.playerId}_auction`,
            userId: user.id,
            matchId,
            playerId: up.playerId,
            contestType: CONTEST_TYPE.AUCTION,
            breakdown: JSON.stringify(result.breakdown),
          },
        });
      }

      // Upsert AuctionMatchPoints
      await prisma.auctionMatchPoints.upsert({
        where: {
          userId_matchId: { userId: user.id, matchId },
        },
        update: {
          totalPoints,
          breakdown: JSON.stringify(breakdownArr),
          isInterim: isInterim,
        },
        create: {
          userId: user.id,
          matchId,
          totalPoints,
          breakdown: JSON.stringify(breakdownArr),
          isInterim: isInterim,
        },
      });

      // Update season leaderboard
      await this._updateSeasonLeaderboard(user.id, match.leagueId, CONTEST_TYPE.AUCTION);
    }

    logger.success(`Auction points calculated for match ${matchId}: ${users.length} users`);
  }

  /**
   * Calculate points for Contest B (per-match contest) for a specific match
   * Idempotent: safe to re-run
   */
  async calculatePerMatchPoints(matchId, isInterim = true) {
    logger.info(`Calculating per-match points for match ${matchId} (interim: ${isInterim})`);

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error(`Match ${matchId} not found`);

    // Get all per-match selections for this match
    const selections = await prisma.perMatchSelection.findMany({
      where: { matchId },
      include: { user: true },
    });

    // Get match stats
    const matchStats = await prisma.playerMatchStats.findMany({ where: { matchId } });
    const matchStatsMap = new Map(matchStats.map(s => [s.playerId, s]));

    for (const selection of selections) {
      let totalPoints = 0;
      const breakdownArr = [];
      const selectedPlayerIds = JSON.parse(selection.selectedPlayers || '[]');

      for (const playerId of selectedPlayerIds) {
        const stats = matchStatsMap.get(playerId);
        const player = await prisma.player.findUnique({ where: { id: playerId } });

        if (!stats || !stats.isPlayingXI) {
          breakdownArr.push({
            playerId,
            playerName: player?.name || 'Unknown',
            basePoints: 0,
            multiplier: 1,
            final: 0,
            didNotPlay: true,
          });
          continue;
        }

        const result = this.calculatePlayerPoints(stats, selection.captainId, selection.vcId);
        totalPoints += result.finalPoints;

        breakdownArr.push({
          playerId,
          playerName: player?.name || 'Unknown',
          basePoints: result.basePoints,
          multiplier: result.multiplier,
          final: result.finalPoints,
          isCaptain: playerId === selection.captainId,
          isVC: playerId === selection.vcId,
          breakdown: result.breakdown,
        });

        // Log
        await prisma.pointsLog.upsert({
          where: { id: `${selection.userId}_${matchId}_${playerId}_permatch` },
          update: { breakdown: JSON.stringify(result.breakdown), calculatedAt: new Date() },
          create: {
            id: `${selection.userId}_${matchId}_${playerId}_permatch`,
            userId: selection.userId,
            matchId,
            playerId,
            contestType: CONTEST_TYPE.PER_MATCH,
            breakdown: JSON.stringify(result.breakdown),
          },
        });
      }

      // Upsert PerMatchPoints
      await prisma.perMatchPoints.upsert({
        where: { userId_matchId: { userId: selection.userId, matchId } },
        update: {
          totalPoints,
          breakdown: JSON.stringify(breakdownArr),
          isInterim: isInterim,
        },
        create: {
          userId: selection.userId,
          matchId,
          totalPoints,
          breakdown: JSON.stringify(breakdownArr),
          isInterim: isInterim,
        },
      });

      // Update per-match leaderboard
      await this._updateSeasonLeaderboard(selection.userId, match.leagueId, CONTEST_TYPE.PER_MATCH);
    }

    // If final, determine match winner for Contest B
    if (!isInterim) {
      await this._recordMatchWinner(matchId, match.leagueId);
    }

    logger.success(`Per-match points calculated for match ${matchId}: ${selections.length} users`);
  }

  async _updateSeasonLeaderboard(userId, leagueId, contestType) {
    if (contestType === CONTEST_TYPE.AUCTION) {
      const agg = await prisma.auctionMatchPoints.aggregate({
        where: { userId },
        _sum: { totalPoints: true },
        _count: { id: true },
        _max: { totalPoints: true },
      });

      await prisma.seasonLeaderboard.upsert({
        where: { userId_leagueId_contestType: { userId, leagueId, contestType } },
        update: {
          totalPoints: agg._sum.totalPoints || 0,
          matchesPlayed: agg._count.id || 0,
          bestScore: agg._max.totalPoints || 0,
        },
        create: {
          userId,
          leagueId,
          contestType,
          totalPoints: agg._sum.totalPoints || 0,
          matchesPlayed: agg._count.id || 0,
          bestScore: agg._max.totalPoints || 0,
        },
      });
    } else {
      const agg = await prisma.perMatchPoints.aggregate({
        where: { userId },
        _sum: { totalPoints: true },
        _count: { id: true },
        _max: { totalPoints: true },
      });

      const existing = await prisma.seasonLeaderboard.findUnique({
        where: { userId_leagueId_contestType: { userId, leagueId, contestType } },
      });

      await prisma.seasonLeaderboard.upsert({
        where: { userId_leagueId_contestType: { userId, leagueId, contestType } },
        update: {
          totalPoints: agg._sum.totalPoints || 0,
          matchesPlayed: agg._count.id || 0,
          bestScore: agg._max.totalPoints || 0,
        },
        create: {
          userId,
          leagueId,
          contestType,
          totalPoints: agg._sum.totalPoints || 0,
          matchesPlayed: agg._count.id || 0,
          bestScore: agg._max.totalPoints || 0,
        },
      });
    }
  }

  async _recordMatchWinner(matchId, leagueId) {
    const allPoints = await prisma.perMatchPoints.findMany({
      where: { matchId },
      orderBy: { totalPoints: 'desc' },
    });

    if (allPoints.length > 0) {
      const winnerId = allPoints[0].userId;
      const existing = await prisma.seasonLeaderboard.findUnique({
        where: { userId_leagueId_contestType: { userId: winnerId, leagueId, contestType: CONTEST_TYPE.PER_MATCH } },
      });
      if (existing) {
        await prisma.seasonLeaderboard.update({
          where: { id: existing.id },
          data: { matchWins: { increment: 1 } },
        });
      }
    }
  }
}

module.exports = new PointsCalculationService();
