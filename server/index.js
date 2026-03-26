require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { logger } = require('./utils/logger');
const AuctionService = require('./services/AuctionService');
const CronService = require('./services/CronService');

// Routes
const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auction');
const contestARoutes = require('./routes/contestA');
const contestBRoutes = require('./routes/contestB');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Store io on app for use in routes
app.set('io', io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
});
app.use('/api/', limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mockMode: process.env.MOCK_MODE === 'true' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/contest-a', contestARoutes);
app.use('/api/contest-b', contestBRoutes);
app.use('/api/admin', adminRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Socket.io
const auctionService = new AuctionService(io);

io.on('connection', (socket) => {
  logger.info(`🔌 Socket connected: ${socket.id}`);

  auctionService.setupSocketHandlers(socket);

  socket.on('join_league', (data) => {
    socket.join(`league_${data.leagueId}`);
  });

  socket.on('join_match', (data) => {
    socket.join(`match_${data.matchId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Start cron jobs
const cronService = new CronService(io);
cronService.startAll();

// Initial schedule sync on startup
setTimeout(async () => {
  logger.info('🚀 Running initial schedule sync...');
  await cronService.syncMatchSchedule();
}, 3000);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.success(`🏏 Fantasy Cricket League server running on port ${PORT}`);
  logger.info(`   Mock mode: ${process.env.MOCK_MODE === 'true' ? 'ON' : 'OFF'}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
