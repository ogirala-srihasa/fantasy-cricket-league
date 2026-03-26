const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get auction state
router.get('/state', authMiddleware, async (req, res) => {
  const session = await prisma.auctionSession.findFirst({
    where: { leagueId: req.user.leagueId },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) {
    return res.json({ status: 'no_auction', session: null });
  }

  const currentPlayer = session.currentPlayerId
    ? await prisma.player.findUnique({ where: { id: session.currentPlayerId } })
    : null;

  const users = await prisma.user.findMany({
    where: { leagueId: req.user.leagueId },
    include: { userPlayers: { include: { player: true } } },
  });

  res.json({
    session: {
      id: session.id,
      status: session.status,
      currentPlayer,
      currentBid: session.currentBidAmount,
      currentBidderId: session.currentBidderId,
      timerEndsAt: session.timerEndsAt,
    },
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      purse: u.purse,
      squadCount: u.userPlayers.length,
      squad: u.userPlayers.map(up => ({
        id: up.player.id,
        name: up.player.name,
        role: up.player.role,
        iplTeam: up.player.iplTeam,
        price: up.purchasePrice,
      })),
    })),
  });
});

// Get all players (for auction pool view)
router.get('/players', authMiddleware, async (req, res) => {
  const players = await prisma.player.findMany({
    orderBy: [{ tier: 'asc' }, { iplTeam: 'asc' }, { name: 'asc' }],
  });

  // Get sold players
  const soldPlayerIds = (await prisma.userPlayer.findMany({
    select: { playerId: true },
  })).map(up => up.playerId);

  res.json({
    players: players.map(p => ({
      ...p,
      isSold: soldPlayerIds.includes(p.id),
    })),
  });
});

// Get bid history
router.get('/bids/:sessionId', authMiddleware, async (req, res) => {
  const bids = await prisma.auctionBid.findMany({
    where: { sessionId: req.params.sessionId },
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: { user: true, player: true },
  });

  res.json({
    bids: bids.map(b => ({
      id: b.id,
      playerName: b.player.name,
      userName: b.user.name,
      amount: b.amount,
      timestamp: b.timestamp,
    })),
  });
});

module.exports = router;
