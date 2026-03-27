const axios = require('axios');
const { apiCache } = require('../utils/cache');
const { logger } = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Mutex for API requests (max 1 concurrent per API)
let cricapiLock = false;
let fallbackLock = false;

class CricketDataService {
  constructor() {
    this.cricapiKey = process.env.CRICAPI_KEY;
    this.fallbackKey = process.env.CRICKET_DATA_KEY;
    this.mockMode = process.env.MOCK_MODE === 'true';
    this.cricapiBase = 'https://api.cricapi.com/v1';
    this.retryDelays = [5000, 15000, 60000]; // exponential backoff
  }

  // ─── PRIMARY API REQUEST ─────────────────────────────────────
  async _cricapiRequest(endpoint, params = {}) {
    if (cricapiLock) {
      await new Promise(r => setTimeout(r, 1000));
      if (cricapiLock) throw new Error('CricAPI request in progress');
    }
    cricapiLock = true;
    try {
      const cacheKey = `cricapi_${endpoint}_${JSON.stringify(params)}`;
      const cached = apiCache.get(cacheKey);
      if (cached) return cached;

      const response = await axios.get(`${this.cricapiBase}${endpoint}`, {
        params: { apikey: this.cricapiKey, ...params },
        timeout: 10000,
      });

      // Track daily usage
      await this._trackUsage('cricapi');

      if (response.data.status === 'failure') {
        throw new Error(response.data.reason || 'CricAPI failure');
      }

      apiCache.set(cacheKey, response.data);
      return response.data;
    } finally {
      cricapiLock = false;
    }
  }

  // ─── FALLBACK API REQUEST ────────────────────────────────────
  async _fallbackRequest(endpoint, params = {}) {
    if (fallbackLock) {
      await new Promise(r => setTimeout(r, 1000));
      if (fallbackLock) throw new Error('Fallback request in progress');
    }
    fallbackLock = true;
    try {
      const cacheKey = `fallback_${endpoint}_${JSON.stringify(params)}`;
      const cached = apiCache.get(cacheKey);
      if (cached) return cached;

      const response = await axios.get(`${this.cricapiBase}${endpoint}`, {
        params: { apikey: this.fallbackKey, ...params },
        timeout: 10000,
      });

      await this._trackUsage('fallback');

      if (response.data.status === 'failure') {
        throw new Error(response.data.reason || 'Fallback API failure');
      }

      apiCache.set(cacheKey, response.data);
      return response.data;
    } finally {
      fallbackLock = false;
    }
  }

  // ─── PUPPETEER SCRAPER (LAST RESORT) ─────────────────────────
  async _puppeteerScrape(matchUrl) {
    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });
      const page = await browser.newPage();
      await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const scorecard = await page.evaluate(() => {
        const data = { batting: [], bowling: [] };
        // Parse batting tables
        const battingRows = document.querySelectorAll('.ds-table tbody tr');
        battingRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 8) {
            data.batting.push({
              name: cells[0]?.textContent?.trim() || '',
              runs: parseInt(cells[2]?.textContent) || 0,
              balls: parseInt(cells[3]?.textContent) || 0,
              fours: parseInt(cells[5]?.textContent) || 0,
              sixes: parseInt(cells[6]?.textContent) || 0,
              dismissal: cells[1]?.textContent?.trim() || '',
            });
          }
        });
        // Parse bowling tables
        const bowlingRows = document.querySelectorAll('.ds-table:nth-of-type(2) tbody tr');
        bowlingRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 6) {
            data.bowling.push({
              name: cells[0]?.textContent?.trim() || '',
              overs: parseFloat(cells[1]?.textContent) || 0,
              maidens: parseInt(cells[2]?.textContent) || 0,
              runs: parseInt(cells[3]?.textContent) || 0,
              wickets: parseInt(cells[4]?.textContent) || 0,
            });
          }
        });
        return data;
      });

      await browser.close();
      await this._trackUsage('puppeteer');
      return scorecard;
    } catch (err) {
      logger.error('Puppeteer scraper failed:', err.message);
      throw err;
    }
  }

  // ─── CASCADING REQUEST ───────────────────────────────────────
  async _cascadingRequest(endpoint, params = {}) {
    if (this.mockMode) {
      return this._getMockData(endpoint, params);
    }

    // Try Primary
    try {
      const data = await this._cricapiRequest(endpoint, params);
      logger.info(`CricAPI success: ${endpoint}`);
      return data;
    } catch (err) {
      logger.warn(`CricAPI failed: ${err.message}, trying fallback...`);
    }

    // Try Fallback
    try {
      const data = await this._fallbackRequest(endpoint, params);
      logger.info(`Fallback API success: ${endpoint}`);
      return data;
    } catch (err) {
      logger.warn(`Fallback API failed: ${err.message}`);
    }

    // Return null — Puppeteer only for scorecards
    logger.error(`All APIs failed for ${endpoint}`);
    return null;
  }

  // ─── PUBLIC API METHODS ──────────────────────────────────────

  async getUpcomingIPLMatches() {
    const data = await this._cascadingRequest('/matches', { offset: 0 });
    if (!data?.data) return [];
    
    // If Admin explicitly set a Series ID, strictly lock onto it. Otherwise fallback to generic 'IPL' matching (which might catch 2024 on free APIs)
    const targetSeriesId = process.env.IPL_SERIES_ID;
    
    return data.data
      .filter(m => targetSeriesId ? m.series_id === targetSeriesId : (m.series_id && (m.name || '').toLowerCase().includes('ipl') && !m.name.includes('2024')))
      .map(m => ({
        externalId: m.id,
        team1: m.teams?.[0] || m.teamInfo?.[0]?.shortname || 'TBD',
        team2: m.teams?.[1] || m.teamInfo?.[1]?.shortname || 'TBD',
        startTime: new Date(m.dateTimeGMT || m.date),
        venue: m.venue || 'TBD',
        status: m.matchStarted ? (m.matchEnded ? 'completed' : 'live') : 'upcoming',
        matchNumber: m.matchType === 't20' ? null : null,
      }));
  }

  async getLiveMatchScorecard(externalMatchId) {
    const data = await this._cascadingRequest('/match_scorecard', { id: externalMatchId });
    if (!data?.data) return null;
    return this._normalizeScorecard(data.data, false);
  }

  async getFinalMatchScorecard(externalMatchId) {
    const data = await this._cascadingRequest('/match_scorecard', { id: externalMatchId });
    if (!data?.data) return null;
    return this._normalizeScorecard(data.data, true);
  }

  async getMatchSquads(externalMatchId) {
    const data = await this._cascadingRequest('/match_squad', { id: externalMatchId });
    if (!data?.data) return null;

    const squads = data.data;
    return {
      team1Players: (squads[0]?.players || []).map(p => this._normalizePlayer(p, squads[0]?.teamName)),
      team2Players: (squads[1]?.players || []).map(p => this._normalizePlayer(p, squads[1]?.teamName)),
      team1Name: squads[0]?.teamName || 'Team 1',
      team2Name: squads[1]?.teamName || 'Team 2',
    };
  }

  async getIPLPlayerList() {
    const data = await this._cascadingRequest('/players', { offset: 0 });
    if (!data?.data) {
      // Fall back to static seed data
      const seedPath = path.join(__dirname, '../../seeds/ipl2026-players.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
        const players = [];
        seedData.teams.forEach(team => {
          team.players.forEach(p => {
            players.push({ ...p, iplTeam: team.name });
          });
        });
        return players;
      }
      return [];
    }
    return data.data.map(p => this._normalizePlayer(p));
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizeScorecard(rawData, isFinal) {
    const scorecard = { batsmen: [], bowlers: [], fielders: [], isFinal };

    const innings = rawData.scorecard || rawData.score || [];
    for (const inning of (Array.isArray(innings) ? innings : [])) {
      const batting = inning.batting || [];
      const bowling = inning.bowling || [];

      for (const b of batting) {
        scorecard.batsmen.push({
          name: b.batsman?.name || b.batsman || b.name || '',
          playerId: b.batsman?.id || b.player_id || '',
          runs: parseInt(b.r || b.runs) || 0,
          balls: parseInt(b.b || b.balls) || 0,
          fours: parseInt(b['4s'] || b.fours) || 0,
          sixes: parseInt(b['6s'] || b.sixes) || 0,
          dismissal: b.dismissal || b['dismissal-text'] || '',
          isOut: !!(b.dismissal && b.dismissal !== 'not out'),
        });
      }

      for (const bw of bowling) {
        scorecard.bowlers.push({
          name: bw.bowler?.name || bw.bowler || bw.name || '',
          playerId: bw.bowler?.id || bw.player_id || '',
          overs: parseFloat(bw.o || bw.overs) || 0,
          maidens: parseInt(bw.m || bw.maidens) || 0,
          runs: parseInt(bw.r || bw.runs) || 0,
          wickets: parseInt(bw.w || bw.wickets) || 0,
          economy: parseFloat(bw.eco || bw.economy) || 0,
        });
      }
    }

    return scorecard;
  }

  _normalizePlayer(raw, teamName) {
    return {
      externalId: raw.id || raw.player_id || '',
      name: raw.name || raw.playerName || '',
      iplTeam: teamName || raw.country || '',
      role: this._inferRole(raw.role || raw.battingStyle || ''),
    };
  }

  _inferRole(roleStr) {
    const r = (roleStr || '').toLowerCase();
    if (r.includes('keeper') || r.includes('wk')) return 'WK';
    if (r.includes('all') || r.includes('ar')) return 'AR';
    if (r.includes('bowl')) return 'BOWL';
    return 'BAT';
  }

  // ─── USAGE TRACKING ─────────────────────────────────────────

  async _trackUsage(source) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const existing = await prisma.apiUsage.findUnique({ where: { date: today } });
      if (existing) {
        const field = source === 'cricapi' ? 'cricapiCalls' : source === 'fallback' ? 'fallbackCalls' : 'puppeteerCalls';
        await prisma.apiUsage.update({
          where: { date: today },
          data: { [field]: { increment: 1 } },
        });
      } else {
        await prisma.apiUsage.create({
          data: {
            date: today,
            [source === 'cricapi' ? 'cricapiCalls' : source === 'fallback' ? 'fallbackCalls' : 'puppeteerCalls']: 1,
          },
        });
      }
    } catch (err) {
      logger.warn('Failed to track API usage:', err.message);
    }
  }

  async getApiUsage() {
    const today = new Date().toISOString().slice(0, 10);
    return prisma.apiUsage.findUnique({ where: { date: today } }) || { cricapiCalls: 0, fallbackCalls: 0, puppeteerCalls: 0 };
  }

  // ─── MOCK DATA (DEMO MODE) ───────────────────────────────────

  _getMockData(endpoint, params) {
    logger.info(`[MOCK] Returning mock data for ${endpoint}`);

    if (endpoint === '/matches') {
      return this._getMockMatches();
    }
    if (endpoint === '/match_scorecard') {
      return this._getMockScorecard(params.id);
    }
    if (endpoint === '/match_squad') {
      return this._getMockSquads(params.id);
    }
    return { data: [] };
  }

  _getMockMatches() {
    const now = new Date();
    const teams = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'LSG', 'GT'];
    const matches = [];

    for (let i = 0; i < 14; i++) {
      const t1 = teams[i % 10];
      const t2 = teams[(i + 1) % 10];
      const matchDate = new Date(now);
      matchDate.setDate(matchDate.getDate() + (i - 2)); // some in past, some upcoming
      matchDate.setHours(19, 30, 0, 0);

      matches.push({
        id: `mock_match_${i + 1}`,
        teams: [t1, t2],
        dateTimeGMT: matchDate.toISOString(),
        venue: ['Wankhede', 'Chepauk', 'Chinnaswamy', 'Eden Gardens', 'Kotla', 'Mohali', 'SMS', 'Uppal', 'Ekana', 'Motera'][i % 10],
        matchStarted: matchDate < now,
        matchEnded: matchDate < new Date(now.getTime() - 4 * 60 * 60 * 1000),
        name: `${t1} vs ${t2} - IPL 2026 Match ${i + 1}`,
        matchType: 't20',
      });
    }

    return { data: matches };
  }

  _getMockScorecard(matchId) {
    const seedPath = path.join(__dirname, '../../seeds/ipl2026-players.json');
    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

    // Extract match number from ID
    const matchNum = parseInt(matchId?.replace('mock_match_', '') || '1') - 1;
    const teams = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'LSG', 'GT'];
    const t1 = teams[matchNum % 10];
    const t2 = teams[(matchNum + 1) % 10];

    const team1Data = seedData.teams.find(t => t.name === t1);
    const team2Data = seedData.teams.find(t => t.name === t2);

    const generateBatting = (teamData) => {
      return teamData.players.slice(0, 11).map((p, i) => ({
        batsman: { name: p.name, id: `ipl2026_${teamData.name.toLowerCase()}_${p.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}` },
        r: Math.floor(Math.random() * 80),
        b: Math.floor(Math.random() * 45) + 5,
        '4s': Math.floor(Math.random() * 6),
        '6s': Math.floor(Math.random() * 4),
        dismissal: i < 8 ? ['c Smith b Jones', 'b Kumar', 'lbw b Patel', 'run out (Direct)', 'st Keeper b Spinner'][Math.floor(Math.random() * 5)] : 'not out',
      }));
    };

    const generateBowling = (teamData) => {
      return teamData.players.filter(p => ['BOWL', 'AR'].includes(p.role)).slice(0, 5).map(p => ({
        bowler: { name: p.name, id: `ipl2026_${teamData.name.toLowerCase()}_${p.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}` },
        o: (Math.floor(Math.random() * 4) + 1).toString(),
        m: Math.floor(Math.random() * 2),
        r: Math.floor(Math.random() * 40) + 10,
        w: Math.floor(Math.random() * 3),
        eco: (Math.random() * 8 + 4).toFixed(1),
      }));
    };

    return {
      data: {
        scorecard: [
          { batting: generateBatting(team1Data), bowling: generateBowling(team2Data) },
          { batting: generateBatting(team2Data), bowling: generateBowling(team1Data) },
        ],
      },
    };
  }

  _getMockSquads(matchId) {
    const seedPath = path.join(__dirname, '../../seeds/ipl2026-players.json');
    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

    const matchNum = parseInt(matchId?.replace('mock_match_', '') || '1') - 1;
    const teams = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'LSG', 'GT'];
    const t1 = teams[matchNum % 10];
    const t2 = teams[(matchNum + 1) % 10];

    const team1Data = seedData.teams.find(t => t.name === t1);
    const team2Data = seedData.teams.find(t => t.name === t2);

    return {
      data: [
        {
          teamName: t1,
          players: team1Data.players.map(p => ({
            id: `ipl2026_${t1.toLowerCase()}_${p.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`,
            name: p.name,
            role: p.role,
          })),
        },
        {
          teamName: t2,
          players: team2Data.players.map(p => ({
            id: `ipl2026_${t2.toLowerCase()}_${p.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`,
            name: p.name,
            role: p.role,
          })),
        },
      ],
    };
  }
}

module.exports = new CricketDataService();
