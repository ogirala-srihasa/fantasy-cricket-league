const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const cricketData = require('../services/CricketDataService');

const router = express.Router();
const prisma = new PrismaClient();

// System health
router.get('/health', authMiddleware, adminMiddleware, async (req, res) => {
  const cronLogs = await prisma.cronLog.findMany({
    orderBy: { lastRun: 'desc' },
    take: 20,
  });

  const apiUsage = await cricketData.getApiUsage();

  const matchCounts = {
    upcoming: await prisma.match.count({ where: { status: 'upcoming' } }),
    locked: await prisma.match.count({ where: { status: 'locked' } }),
    live: await prisma.match.count({ where: { status: 'live' } }),
    completed: await prisma.match.count({ where: { status: 'completed' } }),
  };

  const userCount = await prisma.user.count();
  const playerCount = await prisma.player.count();

  res.json({
    cronLogs,
    apiUsage,
    matchCounts,
    userCount,
    playerCount,
    mockMode: process.env.MOCK_MODE === 'true',
    serverTime: new Date().toISOString(),
  });
});

// Manual sync schedule
router.post('/sync-schedule', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const CronService = require('../services/CronService');
    const cronService = new CronService(req.app.get('io'));
    await cronService.manualSyncSchedule();
    res.json({ success: true, message: 'Schedule sync triggered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual sync scores
router.post('/sync-scores/:matchId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const CronService = require('../services/CronService');
    const cronService = new CronService(req.app.get('io'));
    await cronService.manualSyncScores(req.params.matchId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual recalculate points
router.post('/recalculate/:matchId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const CronService = require('../services/CronService');
    const cronService = new CronService(req.app.get('io'));
    await cronService.manualRecalculate(req.params.matchId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get cron logs
router.get('/cron-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const logs = await prisma.cronLog.findMany({
    orderBy: { lastRun: 'desc' },
    take: 50,
  });
  res.json({ logs });
});

// Get all matches (admin view)
router.get('/matches', authMiddleware, adminMiddleware, async (req, res) => {
  const matches = await prisma.match.findMany({
    orderBy: { startTime: 'desc' },
  });
  res.json({ matches });
});

// Generate mock data for testing
router.post('/generate-mock-data', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const CronService = require('../services/CronService');
    const cronService = new CronService(req.app.get('io'));
    await cronService.syncMatchSchedule();
    res.json({ success: true, message: 'Mock data generated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
