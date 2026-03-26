// Fantasy Points Scoring Rules
const SCORING = {
  BATTING: {
    RUN: 1,
    BOUNDARY_BONUS: 1,    // per 4
    SIX_BONUS: 2,         // per 6
    MILESTONE_25: 4,
    MILESTONE_50: 8,
    MILESTONE_75: 8,      // additional
    MILESTONE_100: 16,
    DUCK: -2,             // dismissed for 0 (BAT/AR only)
  },
  BOWLING: {
    WICKET: 25,
    LBW_BOWLED_BONUS: 8,  // per wicket via LBW/bowled
    HAUL_3: 4,
    HAUL_4: 8,
    HAUL_5: 16,
    MAIDEN: 4,
  },
  FIELDING: {
    CATCH: 8,
    STUMPING: 12,
    DIRECT_RUNOUT: 12,
    INDIRECT_RUNOUT: 6,
  },
  APPEARANCE: {
    PLAYING_XI: 4,
  },
  MULTIPLIERS: {
    CAPTAIN: 2,
    VICE_CAPTAIN: 1.5,
  },
};

// Player roles
const ROLES = {
  BAT: 'BAT',
  BOWL: 'BOWL',
  AR: 'AR',
  WK: 'WK',
};

// Player tiers and base prices (in Crores)
const TIERS = {
  A: { label: 'Tier A', basePrice: 2.0 },
  B: { label: 'Tier B', basePrice: 1.0 },
  C: { label: 'Tier C', basePrice: 0.5 },
  D: { label: 'Tier D', basePrice: 0.2 },
};

// Auction rules
const AUCTION = {
  PURSE: 100,              // ₹100 Crores
  SQUAD_SIZE: 11,
  MIN_WK: 1,
  MIN_BAT: 1,
  MIN_BOWL: 1,
  MIN_AR: 1,
  TIMER_INITIAL: 30,       // 30 seconds
  TIMER_ON_BID: 15,        // resets to 15s on new bid
  MIN_INCREMENT: 0.05,     // ₹5 Lakhs = 0.05 Crores
  MAX_LEAGUE_SIZE: 10,
};

// Match statuses
const MATCH_STATUS = {
  UPCOMING: 'upcoming',
  LOCKED: 'locked',
  LIVE: 'live',
  COMPLETED: 'completed',
};

// Contest types
const CONTEST_TYPE = {
  AUCTION: 'auction',
  PER_MATCH: 'per_match',
};

// IPL Teams
const IPL_TEAMS = {
  CSK: { name: 'Chennai Super Kings', short: 'CSK', color: '#FFCB05' },
  MI: { name: 'Mumbai Indians', short: 'MI', color: '#004BA0' },
  RCB: { name: 'Royal Challengers Bengaluru', short: 'RCB', color: '#EC1C24' },
  KKR: { name: 'Kolkata Knight Riders', short: 'KKR', color: '#3A225D' },
  DC: { name: 'Delhi Capitals', short: 'DC', color: '#004C93' },
  PBKS: { name: 'Punjab Kings', short: 'PBKS', color: '#DD1F2D' },
  RR: { name: 'Rajasthan Royals', short: 'RR', color: '#EA1A85' },
  SRH: { name: 'Sunrisers Hyderabad', short: 'SRH', color: '#FF822A' },
  LSG: { name: 'Lucknow Super Giants', short: 'LSG', color: '#A72056' },
  GT: { name: 'Gujarat Titans', short: 'GT', color: '#1C1C1C' },
};

// Contest B: max players from one team
const MAX_PER_TEAM = 7;
const CONTEST_B_SQUAD_SIZE = 11;

module.exports = {
  SCORING,
  ROLES,
  TIERS,
  AUCTION,
  MATCH_STATUS,
  CONTEST_TYPE,
  IPL_TEAMS,
  MAX_PER_TEAM,
  CONTEST_B_SQUAD_SIZE,
};
