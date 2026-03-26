const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { AUCTION } = require('../utils/constants');

const router = express.Router();
const prisma = new PrismaClient();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, leagueName, inviteCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let league;
    let role = 'user';

    if (inviteCode) {
      // Join existing league
      league = await prisma.league.findUnique({ where: { inviteCode } });
      if (!league) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }
      const memberCount = await prisma.user.count({ where: { leagueId: league.id } });
      if (memberCount >= AUCTION.MAX_LEAGUE_SIZE) {
        return res.status(400).json({ error: 'League is full (max 10 members)' });
      }
    } else {
      // Create new league — first user is admin
      const code = uuidv4().slice(0, 8).toUpperCase();
      league = await prisma.league.create({
        data: {
          name: leagueName || `${name}'s League`,
          inviteCode: code,
          adminId: 'temp',
        },
      });
      role = 'admin';
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        leagueId: league.id,
        purse: AUCTION.PURSE,
      },
    });

    // Update league admin
    if (role === 'admin') {
      await prisma.league.update({
        where: { id: league.id },
        data: { adminId: user.id },
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        purse: user.purse,
        leagueId: league.id,
      },
      league: {
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const league = user.leagueId
      ? await prisma.league.findUnique({ where: { id: user.leagueId } })
      : null;

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        purse: user.purse,
        leagueId: user.leagueId,
      },
      league: league ? {
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
      } : null,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  const league = req.user.leagueId
    ? await prisma.league.findUnique({ where: { id: req.user.leagueId } })
    : null;

  const memberCount = league
    ? await prisma.user.count({ where: { leagueId: league.id } })
    : 0;

  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      purse: req.user.purse,
      leagueId: req.user.leagueId,
    },
    league: league ? {
      id: league.id,
      name: league.name,
      inviteCode: league.inviteCode,
      memberCount,
    } : null,
  });
});

// Join league with invite code
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const league = await prisma.league.findUnique({ where: { inviteCode } });
    if (!league) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    const memberCount = await prisma.user.count({ where: { leagueId: league.id } });
    if (memberCount >= AUCTION.MAX_LEAGUE_SIZE) {
      return res.status(400).json({ error: 'League is full' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { leagueId: league.id },
    });

    res.json({
      league: {
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join league' });
  }
});

// Get league members
router.get('/league-members', authMiddleware, async (req, res) => {
  if (!req.user.leagueId) {
    return res.json({ members: [] });
  }
  const members = await prisma.user.findMany({
    where: { leagueId: req.user.leagueId },
    select: { id: true, name: true, email: true, role: true, purse: true },
  });
  res.json({ members });
});

module.exports = router;
