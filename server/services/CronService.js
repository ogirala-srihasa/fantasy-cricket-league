const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const cricketData = require('./CricketDataService');
const pointsService = require('./PointsCalculationService');
const { logger } = require('../utils/logger');
const { MATCH_STATUS } = require('../utils/constants');

const prisma = new PrismaClient();

class CronService {
  constructor(io) {
    this.io = io;
    this.jobs = {};
  }

  startAll() {
    logger.info('🕐 Starting all cron jobs...');

    // Job 1: Match schedule sync — every 6 hours
    this.jobs.scheduleSync = cron.schedule('0 */6 * * *', () => this.syncMatchSchedule());

    // Job 2: Pre-match lock — every minute
    this.jobs.prematchLock = cron.schedule('* * * * *', () => this.prematchLock());

    // Job 3: Live score polling — every 60 seconds
    this.jobs.liveScores = cron.schedule('* * * * *', () => this.pollLiveScores());

    // Job 4: Match start detector — every minute
    this.jobs.matchStart = cron.schedule('* * * * *', () => this.detectMatchStart());

    // Job 5: Match completion handler — every 5 minutes
    this.jobs.matchComplete = cron.schedule('*/5 * * * *', () => this.handleMatchCompletion());

    // Job 6: Squad sync — every Sunday midnight
    this.jobs.squadSync = cron.schedule('0 0 * * 0', () => this.syncSquads());

    logger.success('All 6 cron jobs started');
  }

  async _logCron(jobName, status, message, duration = 0) {
    try {
      await prisma.cronLog.create({
        data: { jobName, status, message, duration },
      });
    } catch (e) {
      logger.error(`Failed to log cron: ${e.message}`);
    }
  }

  // ─── JOB 1: MATCH SCHEDULE SYNC ─────────────────────────────
  async syncMatchSchedule() {
    const start = Date.now();
    logger.cron('scheduleSync', 'Syncing match schedule...');
    try {
      const matches = await cricketData.getUpcomingIPLMatches();
      if (!matches || matches.length === 0) {
        logger.cron('scheduleSync', 'No matches found, generating mock schedule');
        await this._generateMockSchedule();
        await this._logCron('scheduleSync', 'success', 'Generated mock schedule', Date.now() - start);
        return;
      }

      const league = await prisma.league.findFirst();
      if (!league) {
        logger.cron('scheduleSync', 'No league exists yet');
        return;
      }

      let upserted = 0;
      for (const m of matches) {
        const startTime = new Date(m.startTime);
        const deadline = new Date(startTime.getTime() - 15 * 60 * 1000); // 15 min before

        await prisma.match.upsert({
          where: { externalId: m.externalId },
          update: {
            team1: m.team1, team2: m.team2,
            startTime, selectionDeadline: deadline,
            venue: m.venue,
            status: m.status || MATCH_STATUS.UPCOMING,
          },
          create: {
            externalId: m.externalId,
            team1: m.team1, team2: m.team2,
            startTime, selectionDeadline: deadline,
            venue: m.venue, leagueId: league.id,
            status: m.status || MATCH_STATUS.UPCOMING,
          },
        });
        upserted++;
      }

      this.io?.emit('schedule_updated', { count: upserted });
      await this._logCron('scheduleSync', 'success', `Upserted ${upserted} matches`, Date.now() - start);
      logger.cron('scheduleSync', `✅ Synced ${upserted} matches`);
    } catch (err) {
      logger.error('Schedule sync failed:', err.message);
      await this._logCron('scheduleSync', 'error', err.message, Date.now() - start);
    }
  }

  async _generateMockSchedule() {
    const league = await prisma.league.findFirst();
    if (!league) return;

    const teams = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'LSG', 'GT'];
    const now = new Date();

    for (let i = 0; i < 14; i++) {
      const matchDate = new Date(now);
      matchDate.setDate(matchDate.getDate() + (i - 2));
      matchDate.setHours(19, 30, 0, 0);
      const deadline = new Date(matchDate.getTime() - 15 * 60 * 1000);
      const t1 = teams[i % 10];
      const t2 = teams[(i + 1) % 10];

      let status = MATCH_STATUS.UPCOMING;
      if (matchDate < new Date(now.getTime() - 4 * 60 * 60 * 1000)) status = MATCH_STATUS.COMPLETED;
      else if (matchDate < now) status = MATCH_STATUS.LIVE;

      await prisma.match.upsert({
        where: { externalId: `mock_match_${i + 1}` },
        update: { team1: t1, team2: t2, startTime: matchDate, selectionDeadline: deadline, status, venue: `Stadium ${i + 1}` },
        create: {
          externalId: `mock_match_${i + 1}`, team1: t1, team2: t2,
          startTime: matchDate, selectionDeadline: deadline,
          leagueId: league.id, status, matchNumber: i + 1,
          venue: ['Wankhede', 'Chepauk', 'Chinnaswamy', 'Eden Gardens', 'Arun Jaitley', 'PCA Mohali', 'SMS', 'Uppal', 'Ekana', 'Narendra Modi'][i % 10],
        },
      });
    }
  }

  // ─── JOB 2: PRE-MATCH LOCK ──────────────────────────────────
  async prematchLock() {
    try {
      const now = new Date();
      const lockWindow = new Date(now.getTime() + 2 * 60 * 1000); // 2 min from now

      const matchesToLock = await prisma.match.findMany({
        where: {
          status: MATCH_STATUS.UPCOMING,
          startTime: { lte: lockWindow },
        },
      });

      for (const match of matchesToLock) {
        // Lock the match
        await prisma.match.update({
          where: { id: match.id },
          data: { status: MATCH_STATUS.LOCKED },
        });

        // Contest B: auto-pick for users who haven't submitted
        await this._autoPickContestB(match);

        this.io?.emit('match_locked', { matchId: match.id, team1: match.team1, team2: match.team2 });
        logger.cron('prematchLock', `🔒 Locked match: ${match.team1} vs ${match.team2}`);
      }
    } catch (err) {
      logger.error('Pre-match lock failed:', err.message);
    }
  }

  async _autoPickContestB(match) {
    const league = await prisma.league.findUnique({ where: { id: match.leagueId } });
    if (!league) return;

    const users = await prisma.user.findMany({ where: { leagueId: league.id } });

    for (const user of users) {
      const existing = await prisma.perMatchSelection.findUnique({
        where: { userId_matchId: { userId: user.id, matchId: match.id } },
      });
      if (existing) continue; // Already submitted

      // Auto-pick: get players from match teams, pick best 11
      const team1Players = await prisma.player.findMany({ where: { iplTeam: match.team1 } });
      const team2Players = await prisma.player.findMany({ where: { iplTeam: match.team2 } });
      const allPlayers = [...team1Players, ...team2Players];

      // Sort by tier (A first), pick top 11
      const tierOrder = { A: 0, B: 1, C: 2, D: 3 };
      allPlayers.sort((a, b) => (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3));
      const selectedIds = allPlayers.slice(0, 11).map(p => p.id);

      if (selectedIds.length < 11) continue;

      await prisma.perMatchSelection.create({
        data: {
          userId: user.id,
          matchId: match.id,
          selectedPlayers: JSON.stringify(selectedIds),
          captainId: selectedIds[0],
          vcId: selectedIds[1],
          isAutoSelected: true,
        },
      });

      logger.cron('prematchLock', `Auto-picked team for ${user.name} in ${match.team1} vs ${match.team2}`);
    }
  }

  // ─── JOB 3: LIVE SCORE POLLING ──────────────────────────────
  async pollLiveScores() {
    try {
      const liveMatches = await prisma.match.findMany({
        where: { status: MATCH_STATUS.LIVE },
      });

      for (const match of liveMatches) {
        const scorecard = await cricketData.getLiveMatchScorecard(match.externalId);
        if (!scorecard) continue;

        // Parse and store stats
        await this._storeMatchStats(match, scorecard, false);

        // Calculate interim points for BOTH contests separately
        await pointsService.calculateAuctionPoints(match.id, true);
        await pointsService.calculatePerMatchPoints(match.id, true);

        // Emit separate events
        this.io?.emit('auction_points_updated', { matchId: match.id });
        this.io?.emit('match_points_updated', { matchId: match.id });
      }
    } catch (err) {
      logger.error('Live score polling failed:', err.message);
    }
  }

  async _storeMatchStats(match, scorecard, isFinal) {
    const processedPlayers = new Set();

    // Process batting
    for (const batsman of scorecard.batsmen || []) {
      const player = await this._findPlayer(batsman.name, batsman.playerId);
      if (!player || processedPlayers.has(player.id)) continue;
      processedPlayers.add(player.id);

      await prisma.playerMatchStats.upsert({
        where: { playerId_matchId: { playerId: player.id, matchId: match.id } },
        update: {
          runs: batsman.runs, ballsFaced: batsman.balls,
          fours: batsman.fours, sixes: batsman.sixes,
          isPlayingXI: true, isFinal,
          dismissalType: batsman.isOut ? batsman.dismissal : 'not out',
          source: process.env.MOCK_MODE === 'true' ? 'mock' : 'cricapi',
        },
        create: {
          playerId: player.id, matchId: match.id,
          runs: batsman.runs, ballsFaced: batsman.balls,
          fours: batsman.fours, sixes: batsman.sixes,
          isPlayingXI: true, isFinal,
          dismissalType: batsman.isOut ? batsman.dismissal : 'not out',
          source: process.env.MOCK_MODE === 'true' ? 'mock' : 'cricapi',
        },
      });
    }

    // Process bowling
    for (const bowler of scorecard.bowlers || []) {
      const player = await this._findPlayer(bowler.name, bowler.playerId);
      if (!player) continue;

      const existingStats = processedPlayers.has(player.id);
      processedPlayers.add(player.id);

      if (existingStats) {
        await prisma.playerMatchStats.update({
          where: { playerId_matchId: { playerId: player.id, matchId: match.id } },
          data: {
            overs: bowler.overs, runsConceded: bowler.runs,
            wickets: bowler.wickets, maidens: bowler.maidens,
          },
        });
      } else {
        await prisma.playerMatchStats.upsert({
          where: { playerId_matchId: { playerId: player.id, matchId: match.id } },
          update: {
            overs: bowler.overs, runsConceded: bowler.runs,
            wickets: bowler.wickets, maidens: bowler.maidens,
            isPlayingXI: true, isFinal,
          },
          create: {
            playerId: player.id, matchId: match.id,
            overs: bowler.overs, runsConceded: bowler.runs,
            wickets: bowler.wickets, maidens: bowler.maidens,
            isPlayingXI: true, isFinal,
            source: process.env.MOCK_MODE === 'true' ? 'mock' : 'cricapi',
          },
        });
      }
    }
  }

  async _findPlayer(name, externalId) {
    if (externalId) {
      const player = await prisma.player.findFirst({ where: { externalId } });
      if (player) return player;
    }
    // Fuzzy match by name
    const player = await prisma.player.findFirst({
      where: { name: { contains: name.split(' ').pop() } },
    });
    return player;
  }

  // ─── JOB 4: MATCH START DETECTOR ────────────────────────────
  async detectMatchStart() {
    try {
      const now = new Date();
      const lockedMatches = await prisma.match.findMany({
        where: {
          status: MATCH_STATUS.LOCKED,
          startTime: { lte: now },
        },
      });

      for (const match of lockedMatches) {
        await prisma.match.update({
          where: { id: match.id },
          data: { status: MATCH_STATUS.LIVE },
        });
        this.io?.emit('match_started', { matchId: match.id, team1: match.team1, team2: match.team2 });
        logger.cron('matchStart', `🟢 Match started: ${match.team1} vs ${match.team2}`);
      }
    } catch (err) {
      logger.error('Match start detection failed:', err.message);
    }
  }

  // ─── JOB 5: MATCH COMPLETION HANDLER ─────────────────────────
  async handleMatchCompletion() {
    const start = Date.now();
    try {
      const liveMatches = await prisma.match.findMany({
        where: { status: MATCH_STATUS.LIVE },
      });

      for (const match of liveMatches) {
        // Check if match is completed (in mock mode, auto-complete after 4 hours)
        const hoursSinceStart = (Date.now() - new Date(match.startTime).getTime()) / (1000 * 60 * 60);
        let isCompleted = false;

        if (process.env.MOCK_MODE === 'true') {
          isCompleted = hoursSinceStart >= 4;
        } else {
          const scorecard = await cricketData.getFinalMatchScorecard(match.externalId);
          isCompleted = scorecard?.isFinal === true;
          if (isCompleted && scorecard) {
            await this._storeMatchStats(match, scorecard, true);
          }
        }

        if (isCompleted) {
          // Generate mock final stats if in mock mode
          if (process.env.MOCK_MODE === 'true') {
            await this._generateMockFinalStats(match);
          }

          // Final points for BOTH contests independently
          await pointsService.calculateAuctionPoints(match.id, false);
          await pointsService.calculatePerMatchPoints(match.id, false);

          await prisma.match.update({
            where: { id: match.id },
            data: { status: MATCH_STATUS.COMPLETED },
          });

          this.io?.emit('match_completed', {
            matchId: match.id,
            team1: match.team1,
            team2: match.team2,
          });

          logger.cron('matchComplete', `✅ Match completed: ${match.team1} vs ${match.team2}`);
          await this._logCron('matchComplete', 'success', `${match.team1} vs ${match.team2}`, Date.now() - start);
        }
      }
    } catch (err) {
      logger.error('Match completion handler failed:', err.message);
      await this._logCron('matchComplete', 'error', err.message, Date.now() - start);
    }
  }

  async _generateMockFinalStats(match) {
    const team1Players = await prisma.player.findMany({ where: { iplTeam: match.team1 } });
    const team2Players = await prisma.player.findMany({ where: { iplTeam: match.team2 } });
    const allPlayers = [...team1Players.slice(0, 11), ...team2Players.slice(0, 11)];

    for (const player of allPlayers) {
      const isBatter = ['BAT', 'WK', 'AR'].includes(player.role);
      const isBowler = ['BOWL', 'AR'].includes(player.role);

      await prisma.playerMatchStats.upsert({
        where: { playerId_matchId: { playerId: player.id, matchId: match.id } },
        update: {
          runs: isBatter ? Math.floor(Math.random() * 70) : Math.floor(Math.random() * 15),
          ballsFaced: isBatter ? Math.floor(Math.random() * 40) + 5 : Math.floor(Math.random() * 10),
          fours: Math.floor(Math.random() * 5),
          sixes: Math.floor(Math.random() * 3),
          wickets: isBowler ? Math.floor(Math.random() * 3) : 0,
          overs: isBowler ? Math.floor(Math.random() * 4) + 1 : 0,
          maidens: isBowler ? (Math.random() > 0.7 ? 1 : 0) : 0,
          catches: Math.random() > 0.7 ? 1 : 0,
          stumpings: player.role === 'WK' ? (Math.random() > 0.8 ? 1 : 0) : 0,
          isPlayingXI: true,
          isFinal: true,
          source: 'mock',
          dismissalType: Math.random() > 0.3 ? 'caught' : 'not out',
        },
        create: {
          playerId: player.id, matchId: match.id,
          runs: isBatter ? Math.floor(Math.random() * 70) : Math.floor(Math.random() * 15),
          ballsFaced: isBatter ? Math.floor(Math.random() * 40) + 5 : Math.floor(Math.random() * 10),
          fours: Math.floor(Math.random() * 5),
          sixes: Math.floor(Math.random() * 3),
          wickets: isBowler ? Math.floor(Math.random() * 3) : 0,
          overs: isBowler ? Math.floor(Math.random() * 4) + 1 : 0,
          maidens: isBowler ? (Math.random() > 0.7 ? 1 : 0) : 0,
          catches: Math.random() > 0.7 ? 1 : 0,
          stumpings: player.role === 'WK' ? (Math.random() > 0.8 ? 1 : 0) : 0,
          isPlayingXI: true, isFinal: true, source: 'mock',
          dismissalType: Math.random() > 0.3 ? 'caught' : 'not out',
        },
      });
    }
  }

  // ─── JOB 6: SQUAD SYNC ──────────────────────────────────────
  async syncSquads() {
    const start = Date.now();
    logger.cron('squadSync', 'Syncing IPL player data...');
    try {
      const players = await cricketData.getIPLPlayerList();
      let updated = 0;

      for (const p of players) {
        await prisma.player.updateMany({
          where: { name: p.name },
          data: { iplTeam: p.iplTeam, lastSyncedAt: new Date() },
        });
        updated++;
      }

      await this._logCron('squadSync', 'success', `Updated ${updated} players`, Date.now() - start);
      logger.cron('squadSync', `✅ Updated ${updated} players`);
    } catch (err) {
      logger.error('Squad sync failed:', err.message);
      await this._logCron('squadSync', 'error', err.message, Date.now() - start);
    }
  }

  // ─── MANUAL TRIGGERS ────────────────────────────────────────
  async manualSyncSchedule() { return this.syncMatchSchedule(); }
  async manualSyncScores(matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error('Match not found');
    const scorecard = await cricketData.getLiveMatchScorecard(match.externalId);
    if (scorecard) await this._storeMatchStats(match, scorecard, false);
    return { success: true };
  }
  async manualRecalculate(matchId) {
    await pointsService.calculateAuctionPoints(matchId, true);
    await pointsService.calculatePerMatchPoints(matchId, true);
    return { success: true };
  }
}

module.exports = CronService;
