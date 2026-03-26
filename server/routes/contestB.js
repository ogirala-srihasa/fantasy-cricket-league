const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const { MAX_PER_TEAM, CONTEST_B_SQUAD_SIZE } = require('../utils/constants');

const router = express.Router();
const prisma = new PrismaClient();

// Get all matches for Contest B
router.get('/matches', authMiddleware, async (req, res) => {
  const matches = await prisma.match.findMany({
    where: { leagueId: req.user.leagueId },
    orderBy: { startTime: 'asc' },
  });

  // Check which matches user has submitted teams for
  const userSelections = await prisma.perMatchSelection.findMany({
    where: { userId: req.user.id },
    select: { matchId: true },
  });
  const submittedMatchIds = new Set(userSelections.map(s => s.matchId));

  res.json({
    matches: matches.map(m => ({
      id: m.id,
      externalId: m.externalId,
      team1: m.team1,
      team2: m.team2,
      venue: m.venue,
      startTime: m.startTime,
      selectionDeadline: m.selectionDeadline,
      status: m.status,
      matchNumber: m.matchNumber,
      hasSubmitted: submittedMatchIds.has(m.id),
    })),
  });
});

// Get match squads for team selection (ONLY players from the two teams)
router.get('/match/:matchId/squads', authMiddleware, async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const team1Players = await prisma.player.findMany({
    where: { iplTeam: match.team1 },
    orderBy: [{ tier: 'asc' }, { role: 'asc' }],
  });

  const team2Players = await prisma.player.findMany({
    where: { iplTeam: match.team2 },
    orderBy: [{ tier: 'asc' }, { role: 'asc' }],
  });

  // Get avg fantasy points per player (from past PerMatchPoints)
  const addAvgPoints = async (players) => {
    return Promise.all(players.map(async (p) => {
      const stats = await prisma.playerMatchStats.findMany({
        where: { playerId: p.id, isFinal: true },
      });
      const avgPoints = stats.length > 0
        ? stats.reduce((sum, s) => sum + (s.runs + s.wickets * 25 + s.catches * 8), 0) / stats.length
        : 0;
      return { ...p, avgFantasyPoints: Math.round(avgPoints * 10) / 10 };
    }));
  };

  res.json({
    match: { id: match.id, team1: match.team1, team2: match.team2, startTime: match.startTime, selectionDeadline: match.selectionDeadline, status: match.status },
    team1Players: await addAvgPoints(team1Players),
    team2Players: await addAvgPoints(team2Players),
  });
});

// Submit per-match team selection
router.post('/match/:matchId/select-team', authMiddleware, async (req, res) => {
  try {
    const { selectedPlayers, captainId, vcId } = req.body;
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });

    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.status !== 'upcoming') {
      return res.status(400).json({ error: 'Match is locked or already started' });
    }
    if (new Date() > new Date(match.selectionDeadline)) {
      return res.status(400).json({ error: 'Selection deadline has passed' });
    }

    // Validate 11 players
    if (!selectedPlayers || selectedPlayers.length !== CONTEST_B_SQUAD_SIZE) {
      return res.status(400).json({ error: `Must select exactly ${CONTEST_B_SQUAD_SIZE} players` });
    }

    // Validate captain and VC
    if (!captainId || !vcId) return res.status(400).json({ error: 'Must select Captain and Vice-Captain' });
    if (captainId === vcId) return res.status(400).json({ error: 'Captain and VC must be different' });
    if (!selectedPlayers.includes(captainId) || !selectedPlayers.includes(vcId)) {
      return res.status(400).json({ error: 'Captain and VC must be in selected players' });
    }

    // Validate all players belong to match teams ONLY
    const validPlayers = await prisma.player.findMany({
      where: {
        id: { in: selectedPlayers },
        iplTeam: { in: [match.team1, match.team2] },
      },
    });

    if (validPlayers.length !== CONTEST_B_SQUAD_SIZE) {
      return res.status(400).json({ error: 'All players must be from the two teams in this match' });
    }

    // Validate max per team
    const team1Count = validPlayers.filter(p => p.iplTeam === match.team1).length;
    const team2Count = validPlayers.filter(p => p.iplTeam === match.team2).length;
    if (team1Count > MAX_PER_TEAM || team2Count > MAX_PER_TEAM) {
      return res.status(400).json({ error: `Maximum ${MAX_PER_TEAM} players from one team` });
    }

    // Upsert selection
    const selection = await prisma.perMatchSelection.upsert({
      where: { userId_matchId: { userId: req.user.id, matchId: match.id } },
      update: {
        selectedPlayers: JSON.stringify(selectedPlayers),
        captainId,
        vcId,
        isAutoSelected: false,
      },
      create: {
        userId: req.user.id,
        matchId: match.id,
        selectedPlayers: JSON.stringify(selectedPlayers),
        captainId,
        vcId,
      },
    });

    res.json({ success: true, selection });
  } catch (err) {
    console.error('Team selection error:', err);
    res.status(500).json({ error: 'Failed to save team selection' });
  }
});

// Get my team for a match
router.get('/match/:matchId/my-team', authMiddleware, async (req, res) => {
  const selection = await prisma.perMatchSelection.findUnique({
    where: { userId_matchId: { userId: req.user.id, matchId: req.params.matchId } },
  });

  if (!selection) return res.json({ team: null });

  const playerIds = JSON.parse(selection.selectedPlayers || '[]');
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
  });

  res.json({
    team: {
      players: players.map(p => ({
        ...p,
        isCaptain: p.id === selection.captainId,
        isVC: p.id === selection.vcId,
      })),
      captainId: selection.captainId,
      vcId: selection.vcId,
      isAutoSelected: selection.isAutoSelected,
    },
  });
});

// Per-match leaderboard
router.get('/match/:matchId/leaderboard', authMiddleware, async (req, res) => {
  const points = await prisma.perMatchPoints.findMany({
    where: { matchId: req.params.matchId },
    orderBy: { totalPoints: 'desc' },
    include: { user: { select: { name: true, id: true } } },
  });

  res.json({
    leaderboard: points.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      userName: p.user.name,
      totalPoints: p.totalPoints,
      isInterim: p.isInterim,
      breakdown: JSON.parse(p.breakdown || '[]'),
    })),
  });
});

// Live points for a match (Contest B)
router.get('/match/:matchId/live', authMiddleware, async (req, res) => {
  const myPoints = await prisma.perMatchPoints.findUnique({
    where: { userId_matchId: { userId: req.user.id, matchId: req.params.matchId } },
  });

  const allPoints = await prisma.perMatchPoints.findMany({
    where: { matchId: req.params.matchId },
    orderBy: { totalPoints: 'desc' },
    include: { user: { select: { name: true, id: true } } },
  });

  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });

  res.json({
    match: match ? { id: match.id, team1: match.team1, team2: match.team2, status: match.status } : null,
    myPoints: myPoints ? {
      totalPoints: myPoints.totalPoints,
      breakdown: JSON.parse(myPoints.breakdown || '[]'),
      isInterim: myPoints.isInterim,
    } : null,
    miniLeaderboard: allPoints.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      userName: p.user.name,
      totalPoints: p.totalPoints,
    })),
  });
});

// Cumulative Contest B standings
router.get('/cumulative', authMiddleware, async (req, res) => {
  const leaderboard = await prisma.seasonLeaderboard.findMany({
    where: { leagueId: req.user.leagueId, contestType: 'per_match' },
    orderBy: { totalPoints: 'desc' },
    include: { user: { select: { name: true, id: true } } },
  });

  // Also get by match wins
  const byWins = [...leaderboard].sort((a, b) => b.matchWins - a.matchWins);

  res.json({
    byPoints: leaderboard.map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      userName: e.user.name,
      totalPoints: e.totalPoints,
      matchesPlayed: e.matchesPlayed,
      matchWins: e.matchWins,
    })),
    byWins: byWins.map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      userName: e.user.name,
      matchWins: e.matchWins,
      totalPoints: e.totalPoints,
    })),
  });
});

module.exports = router;
