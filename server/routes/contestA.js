const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get my auction squad
router.get('/my-squad', authMiddleware, async (req, res) => {
  const userPlayers = await prisma.userPlayer.findMany({
    where: { userId: req.user.id },
    include: { player: true },
  });

  // Get season stats for each player
  const squadWithStats = await Promise.all(
    userPlayers.map(async (up) => {
      const matchPoints = await prisma.auctionMatchPoints.findMany({
        where: { userId: req.user.id },
      });

      // Calculate total points this player contributed
      let playerSeasonPoints = 0;
      for (const mp of matchPoints) {
        const breakdown = JSON.parse(mp.breakdown || '[]');
        const playerEntry = breakdown.find(b => b.playerId === up.playerId);
        if (playerEntry) playerSeasonPoints += playerEntry.final || 0;
      }

      return {
        id: up.player.id,
        name: up.player.name,
        role: up.player.role,
        iplTeam: up.player.iplTeam,
        tier: up.player.tier,
        purchasePrice: up.purchasePrice,
        seasonPoints: playerSeasonPoints,
      };
    })
  );

  res.json({ squad: squadWithStats });
});

// Get any user's squad
router.get('/squad/:userId', authMiddleware, async (req, res) => {
  const userPlayers = await prisma.userPlayer.findMany({
    where: { userId: req.params.userId },
    include: { player: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { name: true, id: true },
  });

  res.json({
    user: { id: user?.id, name: user?.name },
    squad: userPlayers.map(up => ({
      id: up.player.id,
      name: up.player.name,
      role: up.player.role,
      iplTeam: up.player.iplTeam,
      tier: up.player.tier,
      purchasePrice: up.purchasePrice,
    })),
  });
});

// Season leaderboard (Contest A)
router.get('/leaderboard', authMiddleware, async (req, res) => {
  const leaderboard = await prisma.seasonLeaderboard.findMany({
    where: { leagueId: req.user.leagueId, contestType: 'auction' },
    orderBy: { totalPoints: 'desc' },
    include: { user: { select: { name: true, id: true } } },
  });

  res.json({
    leaderboard: leaderboard.map((entry, i) => ({
      rank: i + 1,
      userId: entry.userId,
      userName: entry.user.name,
      totalPoints: entry.totalPoints,
      matchesPlayed: entry.matchesPlayed,
      bestScore: entry.bestScore,
      matchWins: entry.matchWins,
    })),
  });
});

// Match breakdown for Contest A
router.get('/match-breakdown/:matchId', authMiddleware, async (req, res) => {
  const points = await prisma.auctionMatchPoints.findMany({
    where: { matchId: req.params.matchId },
    include: {
      user: { select: { name: true, id: true } },
      match: { select: { team1: true, team2: true, startTime: true } },
    },
    orderBy: { totalPoints: 'desc' },
  });

  res.json({
    matchBreakdown: points.map(p => ({
      userId: p.userId,
      userName: p.user.name,
      totalPoints: p.totalPoints,
      isInterim: p.isInterim,
      breakdown: JSON.parse(p.breakdown || '[]'),
      match: { team1: p.match.team1, team2: p.match.team2, date: p.match.startTime },
    })),
  });
});

// Match history with Contest A points
router.get('/match-history', authMiddleware, async (req, res) => {
  const points = await prisma.auctionMatchPoints.findMany({
    where: { userId: req.user.id },
    include: { match: true },
    orderBy: { match: { startTime: 'desc' } },
  });

  res.json({
    matches: points.map(p => ({
      matchId: p.matchId,
      team1: p.match.team1,
      team2: p.match.team2,
      date: p.match.startTime,
      status: p.match.status,
      totalPoints: p.totalPoints,
      isInterim: p.isInterim,
    })),
  });
});

module.exports = router;
