# 🏏 Fantasy Cricket League — IPL 2026

A full-stack Fantasy Cricket League web app for a private friend group, featuring **two completely independent contest modes** running simultaneously:

- **Contest A — Auction Tournament** (gold/amber theme): Season-long competition with fixed auction squads
- **Contest B — Per-match Contest** (green theme): Pick a fresh Dream11-style team for every IPL match

Everything is **fully automated** — live scores, fantasy points, schedule sync, and leaderboards are all powered by cricket APIs and background cron jobs.

---

## 📋 Table of Contents

- [Features](#features)
- [How the Two Contests Work](#how-the-two-contests-work)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start (Local Development)](#quick-start-local-development)
- [Step-by-Step Setup Guide](#step-by-step-setup-guide)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Fantasy Points Scoring](#fantasy-points-scoring)
- [API Endpoints](#api-endpoints)
- [Deploy to Railway](#deploy-to-railway)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

- 🎯 **Two Independent Contests** — Auction Tournament (season-long) + Per-match Dream11-style
- 🔨 **Live IPL Auction** — Real-time Socket.io auction with bidding, timer, purse tracking
- 📊 **Automated Fantasy Points** — Runs, wickets, catches, milestones — all calculated automatically
- 📡 **Live Score Polling** — Background jobs fetch live scores every 60 seconds
- 🏆 **Multiple Leaderboards** — Season leaderboard (Contest A), per-match + cumulative (Contest B)
- 👥 **Private League** — Invite-only with shareable codes (max 10 friends)
- 📱 **Mobile-first** — Responsive dark-mode UI with IPL-themed design
- 🤖 **Mock Mode** — Fully testable without real API keys
- ⚡ **Real-time** — Socket.io for live auction bids, score updates, notifications

---

## 🏏 How the Two Contests Work

### Contest A — Auction Tournament (Gold Theme)
1. All friends participate in a **live IPL-style auction** to buy 11 players
2. Each friend has a **₹100 Crore purse** to spend
3. Once the auction ends, squads are **permanently locked**
4. The system **automatically tracks every IPL match** and awards fantasy points
5. Points accumulate across the **entire IPL season**
6. **No per-match team selection** — your auctioned squad plays automatically
7. The friend with the most cumulative points wins!

### Contest B — Per-match Contest (Green Theme)
1. **Completely separate** from the auction/Contest A
2. Before every IPL match, friends pick a **fresh team of 11 players**
3. Player pool is **strictly limited** to only the two teams playing that match
4. Friends pick a **Captain (2× points)** and **Vice-Captain (1.5× points)**
5. Points are calculated from that single match only
6. **Separate leaderboards**: per-match results + cumulative standings + match wins tracker
7. **Zero connection** to auction squads or Contest A

> **Both contests run simultaneously.** A user can be #1 in Contest A and last in Contest B — they are fully independent.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TailwindCSS v3 |
| Backend | Node.js + Express |
| Database | SQLite (local dev) / PostgreSQL (production) |
| ORM | Prisma |
| Real-time | Socket.io |
| Background Jobs | node-cron |
| Auth | JWT + bcrypt |
| Cricket Data | CricAPI + Puppeteer scraper (with mock mode) |
| Deployment | Railway.app |

---

## 📦 Prerequisites

Before you begin, make sure you have:

### Required
- **Node.js** v18 or higher — [Download](https://nodejs.org/)
  - Check: `node --version` (should show v18+)
  - Check: `npm --version` (should show 8+)

### Optional (for production deployment)
- **PostgreSQL** — Required for production. SQLite is used for local dev automatically.
- **Railway account** — [railway.app](https://railway.app) for deployment
- **CricAPI key** — [cricapi.com](https://cricapi.com) for live cricket data (free 100 calls/day)

### Check if Node.js is installed

```bash
node --version
# Expected: v18.x.x or higher

npm --version
# Expected: 8.x.x or higher
```

**If Node.js is NOT installed:**

```bash
# macOS (using Homebrew)
brew install node

# Or download the installer from:
# https://nodejs.org/en/download/

# Windows
# Download from https://nodejs.org and run the installer

# Linux
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Clone the repository
cd /path/to/your/Project11

# 2. Copy environment file
cp .env.example .env
# The defaults work out of the box (SQLite + Mock Mode)

# 3. Install ALL dependencies (root + server + client)
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 4. Setup database (creates SQLite DB + seeds 200 IPL players)
cd server
npx prisma generate
npx prisma migrate dev --name init
cd ..

# 5. Start both server and client
npm run dev
```

**That's it!** Open [http://localhost:5173](http://localhost:5173) in your browser.

> 💡 **Mock Mode is ON by default** — no API keys needed. Mock match data and scores are generated automatically.

---

## 📖 Step-by-Step Setup Guide

### Step 1: Install Dependencies

```bash
# From the project root directory
npm install                          # Root workspace dependencies (concurrently)
cd server && npm install && cd ..    # Server dependencies
cd client && npm install && cd ..    # Client dependencies
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if needed:
```env
# These defaults work for local dev:
DATABASE_URL="file:./dev.db"         # SQLite — no PostgreSQL needed!
JWT_SECRET="your-super-secret-jwt-key-change-this"
PORT=3001
FRONTEND_URL="http://localhost:5173"
NODE_ENV="development"
MOCK_MODE="true"                     # Set to "false" when you have real API keys

# Optional — only needed when MOCK_MODE="false"
CRICAPI_KEY="your-key-from-cricapi.com"
CRICKET_DATA_KEY="your-backup-key"
```

### Step 3: Initialize Database

```bash
cd server

# Generate Prisma client
npx prisma generate

# Create database & run migrations
npx prisma migrate dev --name init
# This also runs the seed script automatically!

cd ..
```

The seed script loads **200 IPL players** (all 10 teams, 20 players each).

### Step 4: Start the Application

**Option A — Both server and client simultaneously:**
```bash
npm run dev
```

**Option B — Start them separately (two terminals):**
```bash
# Terminal 1: Backend (port 3001)
cd server && npm run dev

# Terminal 2: Frontend (port 5173)
cd client && npm run dev
```

### Step 5: Use the App

1. Open [http://localhost:5173](http://localhost:5173)
2. **Register** — the first user becomes the League Admin
3. Share the **invite code** with friends (they click "Join League")
4. Admin starts the **Auction** from the Auction Room
5. After auction, **Contest A** runs automatically
6. For each match, everyone picks teams in **Contest B**

---

## 🔐 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite for dev, PostgreSQL URL for prod |
| `JWT_SECRET` | Yes | (change this!) | Secret key for JWT token signing |
| `PORT` | No | `3001` | Server port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS origin for frontend |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `MOCK_MODE` | No | `true` | Use mock data instead of real APIs |
| `CRICAPI_KEY` | No | — | CricAPI key for live cricket data |
| `CRICKET_DATA_KEY` | No | — | Backup API key |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | No | `false` | Set to `true` if Chromium is pre-installed |

---

## 📁 Project Structure

```
Project11/
├── package.json                    # Root workspace
├── .env                            # Environment variables
├── .env.example                    # Environment template
├── railway.toml                    # Railway deployment config
├── README.md
├── seeds/
│   └── ipl2026-players.json       # 200 IPL players fallback data
├── server/
│   ├── package.json
│   ├── index.js                   # Express + Socket.io + Cron entry
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema (14 models)
│   │   └── seed.js                # Seeds 200 IPL players
│   ├── middleware/
│   │   └── auth.js                # JWT + Admin middleware
│   ├── services/
│   │   ├── CricketDataService.js  # API abstraction (Primary→Fallback→Puppeteer)
│   │   ├── PointsCalculationService.js  # Fantasy points engine
│   │   ├── CronService.js         # 6 automated background jobs
│   │   └── AuctionService.js      # Real-time auction engine
│   ├── routes/
│   │   ├── auth.js                # Register, Login, Join League
│   │   ├── auction.js             # Auction state, players, bids
│   │   ├── contestA.js            # Squad, season leaderboard
│   │   ├── contestB.js            # Team picker, per-match points
│   │   └── admin.js               # Health, manual triggers, cron logs
│   └── utils/
│       ├── cache.js               # 55s API response cache
│       ├── logger.js              # Colored console logger
│       └── constants.js           # Scoring rules, team data
└── client/
    ├── package.json
    ├── vite.config.js             # Vite + API proxy
    ├── tailwind.config.js         # IPL theme, animations
    ├── index.html
    └── src/
        ├── App.jsx                # Router + protected routes
        ├── index.css              # Design system (glassmorphism, etc.)
        ├── contexts/
        │   ├── AuthContext.jsx     # JWT auth state
        │   └── SocketContext.jsx   # Socket.io connection
        ├── components/
        │   ├── Layout/Navbar.jsx   # Responsive nav with contest colors
        │   └── SharedComponents.jsx # PlayerCard, MatchCard, etc.
        └── pages/
            ├── Dashboard.jsx       # Both contests side by side
            ├── auth/
            │   ├── Login.jsx
            │   └── Register.jsx
            ├── auction/
            │   └── AuctionRoom.jsx # Real-time bidding UI
            ├── contestA/
            │   ├── MyAuctionSquad.jsx
            │   └── ContestALeaderboard.jsx
            ├── contestB/
            │   ├── MatchList.jsx
            │   ├── TeamPicker.jsx  # Two-column team picker
            │   └── ContestBLeaderboard.jsx
            └── admin/
                └── AdminPanel.jsx
```

---

## 📊 Fantasy Points Scoring

Both contests use the same scoring rules:

| Category | Action | Points |
|----------|--------|--------|
| **Batting** | Each run | +1 |
| | Boundary (4) | +1 bonus |
| | Six | +2 bonus |
| | 25 runs | +4 milestone |
| | 50 runs | +8 milestone |
| | 75 runs | +8 additional |
| | 100 runs | +16 milestone |
| | Duck (BAT/AR, dismissed for 0) | -2 |
| **Bowling** | Each wicket | +25 |
| | LBW/Bowled bonus | +8 per wicket |
| | 3-wicket haul | +4 bonus |
| | 4-wicket haul | +8 bonus |
| | 5-wicket haul | +16 bonus |
| | Maiden over | +4 |
| **Fielding** | Catch | +8 |
| | Stumping | +12 |
| | Direct run-out | +12 |
| | Indirect run-out | +6 |
| **Appearance** | Playing XI | +4 |
| **Multipliers** | Captain (Contest B only) | 2× total |
| | Vice-Captain (Contest B only) | 1.5× total |

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` — Register (first user = admin, creates league)
- `POST /api/auth/login` — Login (returns JWT)
- `GET /api/auth/me` — Current user & league info
- `POST /api/auth/join` — Join league with invite code

### Auction
- `GET /api/auction/state` — Current auction state
- `GET /api/auction/players` — All players (with sold status)
- Socket.io: `bid`, `player_nominated`, `player_sold`, `timer_tick`, `auction_complete`

### Contest A (Auction Tournament)
- `GET /api/contest-a/my-squad` — Your 11-player squad + season points
- `GET /api/contest-a/leaderboard` — Season leaderboard
- `GET /api/contest-a/match-history` — Points from each match
- `GET /api/contest-a/match-breakdown/:matchId` — Detailed breakdown

### Contest B (Per-match)
- `GET /api/contest-b/matches` — All matches with contest status
- `GET /api/contest-b/match/:id/squads` — Players from ONLY that match's teams
- `POST /api/contest-b/match/:id/select-team` — Submit 11-player team
- `GET /api/contest-b/match/:id/live` — Live points + mini leaderboard
- `GET /api/contest-b/cumulative` — Season standings (by points + by wins)

### Admin
- `GET /api/admin/health` — System health, API usage, cron status
- `POST /api/admin/sync-schedule` — Manually sync match schedule
- `POST /api/admin/recalculate/:matchId` — Recalculate points for a match

---

## 🚂 Deploy to Railway

### 1. Create a Railway Account
Go to [railway.app](https://railway.app) and sign up.

### 2. Create a New Project
```bash
# Install Railway CLI (optional)
npm install -g @railway/cli
railway login
```

### 3. Add PostgreSQL
- In your Railway project, click "New" → "Database" → "PostgreSQL"
- Copy the `DATABASE_URL` from the PostgreSQL service

### 4. Set Environment Variables
In your Railway project settings, add:
```
DATABASE_URL=postgresql://...  (from step 3)
JWT_SECRET=your-production-secret-key
NODE_ENV=production
MOCK_MODE=false
CRICAPI_KEY=your-key
PORT=3001
FRONTEND_URL=https://your-app.railway.app
```

### 5. Deploy
```bash
# Option A: Railway CLI
railway up

# Option B: Connect GitHub repo
# In Railway dashboard → "New" → "GitHub Repo" → Select your repo
```

### 6. Build Command
Railway will use the `railway.toml` config automatically:
- **Build**: Nixpacks with Chromium for Puppeteer
- **Start**: `cd server && npx prisma migrate deploy && cd .. && npm run start`

### 7. First Build
After deploying:
```bash
# Build the client (Railway does this automatically)
cd client && npm run build

# The server serves client/dist as static files in production
```

---

## 🐛 Troubleshooting

### "Cannot find module '@prisma/client'"
```bash
cd server && npx prisma generate
```

### Database migration issues
```bash
cd server
npx prisma migrate reset --force    # ⚠️ Deletes all data!
npx prisma migrate dev --name init
```

### Port 3001 already in use
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9
```

### "MOCK_MODE is true but I want real data"
1. Get a free API key from [cricapi.com](https://cricapi.com)
2. Set `CRICAPI_KEY` in `.env`
3. Set `MOCK_MODE="false"`
4. Restart the server

### Client can't connect to server
- Make sure the server is running on port 3001
- Check that `vite.config.js` has the proxy set to `http://localhost:3001`

### View the database
```bash
cd server && npx prisma studio
# Opens a visual DB browser at http://localhost:5555
```

---

## 📜 License

Private project — for personal use among friends.

---

Built with 🏏 by your Fantasy Cricket League team.
