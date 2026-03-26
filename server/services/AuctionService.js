const { PrismaClient } = require('@prisma/client');
const { AUCTION } = require('../utils/constants');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

class AuctionService {
  constructor(io) {
    this.io = io;
    this.timers = {};
  }

  setupSocketHandlers(socket) {
    socket.on('join_auction', (data) => this.handleJoinAuction(socket, data));
    socket.on('place_bid', (data) => this.handlePlaceBid(socket, data));
    socket.on('admin_start_auction', (data) => this.handleStartAuction(socket, data));
    socket.on('admin_pause_auction', (data) => this.handlePauseAuction(socket, data));
    socket.on('admin_resume_auction', (data) => this.handleResumeAuction(socket, data));
    socket.on('admin_skip_player', (data) => this.handleSkipPlayer(socket, data));
  }

  async handleJoinAuction(socket, { leagueId, userId }) {
    socket.join(`auction_${leagueId}`);
    const session = await prisma.auctionSession.findFirst({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
    });
    if (session) {
      socket.emit('auction_state', await this._getAuctionState(session));
    }
  }

  async handleStartAuction(socket, { leagueId, userId }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'admin') {
      socket.emit('error', { message: 'Only admin can start the auction' });
      return;
    }

    // Get all players ordered by tier
    const players = await prisma.player.findMany({
      orderBy: [{ tier: 'asc' }, { basePrice: 'desc' }],
    });

    const queue = players.map(p => p.id);

    let session = await prisma.auctionSession.findFirst({
      where: { leagueId, status: { in: ['pending', 'paused', 'active'] } },
    });

    if (session) {
      if (session.status === 'active') {
        socket.emit('error', { message: 'Auction is already active!' });
        return;
      }
      
      // If paused, just activate it and add 15 seconds
      const timerEndsAt = new Date(Date.now() + 15 * 1000);
      session = await prisma.auctionSession.update({
        where: { id: session.id },
        data: { status: 'active', timerEndsAt },
      });

      if (session.currentPlayerId) {
        this._startTimer(session);
        this.io.to(`auction_${session.leagueId}`).emit('auction_resumed', await this._getAuctionState(session));
        return;
      }
    } else {
      session = await prisma.auctionSession.create({
        data: {
          leagueId,
          status: 'active',
          nominationQueue: JSON.stringify(queue),
        },
      });
    }

    // Start nominating the first player
    await this._nominateNextPlayer(session);
  }

  async handlePauseAuction(socket, { sessionId }) {
    await prisma.auctionSession.update({
      where: { id: sessionId },
      data: { status: 'paused' },
    });
    this._clearTimer(sessionId);

    const session = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    this.io.to(`auction_${session.leagueId}`).emit('auction_paused', {});
  }

  async handleResumeAuction(socket, { sessionId }) {
    const timerEndsAt = new Date(Date.now() + 15 * 1000);
    const session = await prisma.auctionSession.update({
      where: { id: sessionId },
      data: { status: 'active', timerEndsAt },
    });
    if (session.currentPlayerId) {
      this._startTimer(session);
    }
    this.io.to(`auction_${session.leagueId}`).emit('auction_resumed', await this._getAuctionState(session));
  }

  async handleSkipPlayer(socket, { sessionId }) {
    const session = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    this._clearTimer(sessionId);

    // Mark current player as unsold
    const unsold = JSON.parse(session.unsoldPlayers || '[]');
    if (session.currentPlayerId) unsold.push(session.currentPlayerId);

    await prisma.auctionSession.update({
      where: { id: sessionId },
      data: { unsoldPlayers: JSON.stringify(unsold), currentPlayerId: null, currentBidAmount: null, currentBidderId: null },
    });

    const updatedSession = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    await this._nominateNextPlayer(updatedSession);
  }

  async handlePlaceBid(socket, { sessionId, userId, amount }) {
    const session = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'active' || !session.currentPlayerId) {
      socket.emit('error', { message: 'No active auction' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userPlayers: true },
    });

    // Validate bid
    const currentBid = session.currentBidAmount || 0;
    const player = await prisma.player.findUnique({ where: { id: session.currentPlayerId } });

    if (amount < currentBid + AUCTION.MIN_INCREMENT) {
      socket.emit('error', { message: `Minimum bid: ₹${(currentBid + AUCTION.MIN_INCREMENT).toFixed(2)} Cr` });
      return;
    }

    if (amount > user.purse) {
      socket.emit('error', { message: 'Insufficient purse' });
      return;
    }

    if (user.userPlayers.length >= AUCTION.SQUAD_SIZE) {
      socket.emit('error', { message: 'Squad is full (11 players)' });
      return;
    }

    // Place bid
    await prisma.auctionBid.create({
      data: { sessionId, playerId: session.currentPlayerId, userId, amount },
    });

    // Update session
    const timerEndsAt = new Date(Date.now() + AUCTION.TIMER_ON_BID * 1000);
    await prisma.auctionSession.update({
      where: { id: sessionId },
      data: { currentBidAmount: amount, currentBidderId: userId, timerEndsAt },
    });

    // Reset timer to 15 seconds
    this._clearTimer(sessionId);
    this._startTimer({ ...session, id: sessionId, currentBidAmount: amount, currentBidderId: userId, timerEndsAt });

    // Broadcast bid
    this.io.to(`auction_${session.leagueId}`).emit('new_bid', {
      playerId: session.currentPlayerId,
      playerName: player?.name,
      userId,
      userName: user.name,
      amount,
      timerEndsAt: timerEndsAt.toISOString(),
    });
  }

  _startTimer(session) {
    const timeLeft = session.timerEndsAt
      ? Math.max(0, new Date(session.timerEndsAt).getTime() - Date.now())
      : AUCTION.TIMER_INITIAL * 1000;

    this.timers[session.id] = setTimeout(async () => {
      await this._playerSold(session.id);
    }, timeLeft);

    // Tick every second
    this.timers[`tick_${session.id}`] = setInterval(async () => {
      const s = await prisma.auctionSession.findUnique({ where: { id: session.id } });
      if (!s || s.status !== 'active') {
        this._clearTimer(session.id);
        return;
      }
      const remaining = s.timerEndsAt ? Math.max(0, Math.ceil((new Date(s.timerEndsAt).getTime() - Date.now()) / 1000)) : 0;
      this.io.to(`auction_${s.leagueId}`).emit('timer_tick', { secondsLeft: remaining });
    }, 1000);
  }

  _clearTimer(sessionId) {
    if (this.timers[sessionId]) { clearTimeout(this.timers[sessionId]); delete this.timers[sessionId]; }
    if (this.timers[`tick_${sessionId}`]) { clearInterval(this.timers[`tick_${sessionId}`]); delete this.timers[`tick_${sessionId}`]; }
  }

  async _playerSold(sessionId) {
    this._clearTimer(sessionId);
    const session = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    if (session.currentBidderId && session.currentPlayerId) {
      // Player SOLD
      const amount = session.currentBidAmount;

      await prisma.userPlayer.create({
        data: {
          userId: session.currentBidderId,
          playerId: session.currentPlayerId,
          purchasePrice: amount,
        },
      });

      // Deduct from purse
      await prisma.user.update({
        where: { id: session.currentBidderId },
        data: { purse: { decrement: amount } },
      });

      const sold = JSON.parse(session.soldPlayers || '[]');
      sold.push({ playerId: session.currentPlayerId, userId: session.currentBidderId, amount });

      await prisma.auctionSession.update({
        where: { id: sessionId },
        data: { soldPlayers: JSON.stringify(sold), currentPlayerId: null, currentBidAmount: null, currentBidderId: null, timerEndsAt: null },
      });

      const player = await prisma.player.findUnique({ where: { id: session.currentPlayerId } });
      const buyer = await prisma.user.findUnique({ where: { id: session.currentBidderId } });

      this.io.to(`auction_${session.leagueId}`).emit('player_sold', {
        playerId: session.currentPlayerId,
        playerName: player?.name,
        buyerId: session.currentBidderId,
        buyerName: buyer?.name,
        amount,
        buyerPurseRemaining: buyer?.purse - amount,
      });

      logger.info(`🏏 SOLD: ${player?.name} → ${buyer?.name} for ₹${amount} Cr`);
    } else {
      // UNSOLD
      const unsold = JSON.parse(session.unsoldPlayers || '[]');
      unsold.push(session.currentPlayerId);

      await prisma.auctionSession.update({
        where: { id: sessionId },
        data: { unsoldPlayers: JSON.stringify(unsold), currentPlayerId: null, currentBidAmount: null, currentBidderId: null, timerEndsAt: null },
      });

      const player = await prisma.player.findUnique({ where: { id: session.currentPlayerId } });
      this.io.to(`auction_${session.leagueId}`).emit('player_unsold', { playerId: session.currentPlayerId, playerName: player?.name });
    }

    // Check if all users have full squads
    const updatedSession = await prisma.auctionSession.findUnique({ where: { id: sessionId } });
    const users = await prisma.user.findMany({
      where: { leagueId: updatedSession.leagueId },
      include: { userPlayers: true },
    });
    const allFull = users.length > 0 && users.every(u => u.userPlayers.length >= AUCTION.SQUAD_SIZE);
    if (allFull) {
      await prisma.auctionSession.update({ where: { id: sessionId }, data: { status: 'completed' } });
      this.io.to(`auction_${updatedSession.leagueId}`).emit('auction_complete', { message: 'All squads are complete!' });
      logger.success('🎉 Auction complete! All squads filled.');
      return;
    }

    // Nominate next player
    await this._nominateNextPlayer(updatedSession);
  }

  async _nominateNextPlayer(session) {
    const queue = JSON.parse(session.nominationQueue || '[]');
    const sold = JSON.parse(session.soldPlayers || '[]').map(s => s.playerId);
    const unsold = JSON.parse(session.unsoldPlayers || '[]');

    // Find next unsold player in queue
    let nextPlayerId = null;
    for (const pid of queue) {
      if (!sold.includes(pid) && !unsold.includes(pid)) {
        nextPlayerId = pid;
        break;
      }
    }

    if (!nextPlayerId) {
      // No more players — auction complete
      await prisma.auctionSession.update({ where: { id: session.id }, data: { status: 'completed' } });
      this.io.to(`auction_${session.leagueId}`).emit('auction_complete', { message: 'All players auctioned!' });
      return;
    }

    const player = await prisma.player.findUnique({ where: { id: nextPlayerId } });
    const timerEndsAt = new Date(Date.now() + AUCTION.TIMER_INITIAL * 1000);

    await prisma.auctionSession.update({
      where: { id: session.id },
      data: {
        currentPlayerId: nextPlayerId,
        currentBidAmount: player?.basePrice || 0.2,
        currentBidderId: null,
        timerEndsAt,
      },
    });

    const updatedSession = await prisma.auctionSession.findUnique({ where: { id: session.id } });
    this._startTimer(updatedSession);

    this.io.to(`auction_${session.leagueId}`).emit('player_nominated', {
      playerId: nextPlayerId,
      playerName: player?.name,
      iplTeam: player?.iplTeam,
      role: player?.role,
      tier: player?.tier,
      basePrice: player?.basePrice,
      timerEndsAt: timerEndsAt.toISOString(),
    });
  }

  async _getAuctionState(session) {
    const currentPlayer = session.currentPlayerId
      ? await prisma.player.findUnique({ where: { id: session.currentPlayerId } })
      : null;
    const currentBidder = session.currentBidderId
      ? await prisma.user.findUnique({ where: { id: session.currentBidderId } })
      : null;

    const users = await prisma.user.findMany({
      where: { leagueId: session.leagueId },
      include: { userPlayers: { include: { player: true } } },
    });

    const recentBids = await prisma.auctionBid.findMany({
      where: { sessionId: session.id },
      orderBy: { timestamp: 'desc' },
      take: 20,
      include: { user: true, player: true },
    });

    return {
      sessionId: session.id,
      status: session.status,
      currentPlayer: currentPlayer ? {
        id: currentPlayer.id,
        name: currentPlayer.name,
        iplTeam: currentPlayer.iplTeam,
        role: currentPlayer.role,
        tier: currentPlayer.tier,
        basePrice: currentPlayer.basePrice,
      } : null,
      currentBid: session.currentBidAmount,
      currentBidder: currentBidder ? { id: currentBidder.id, name: currentBidder.name } : null,
      timerEndsAt: session.timerEndsAt?.toISOString(),
      users: users.map(u => ({
        id: u.id, name: u.name, purse: u.purse,
        squadCount: u.userPlayers.length,
        squad: u.userPlayers.map(up => ({
          id: up.player.id, name: up.player.name, role: up.player.role,
          iplTeam: up.player.iplTeam, price: up.purchasePrice,
        })),
      })),
      soldCount: JSON.parse(session.soldPlayers || '[]').length,
      unsoldCount: JSON.parse(session.unsoldPlayers || '[]').length,
      queueSize: JSON.parse(session.nominationQueue || '[]').length,
      recentBids: recentBids.map(b => ({
        userName: b.user.name,
        playerName: b.player.name,
        amount: b.amount,
        timestamp: b.timestamp,
      })),
    };
  }
}

module.exports = AuctionService;
