const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'] || LOG_LEVELS.INFO;

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const logger = {
  debug: (...args) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(`${colors.gray}[${timestamp()}] [DEBUG]${colors.reset}`, ...args);
    }
  },
  info: (...args) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(`${colors.cyan}[${timestamp()}] [INFO]${colors.reset}`, ...args);
    }
  },
  warn: (...args) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(`${colors.yellow}[${timestamp()}] [WARN]${colors.reset}`, ...args);
    }
  },
  error: (...args) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(`${colors.red}[${timestamp()}] [ERROR]${colors.reset}`, ...args);
    }
  },
  success: (...args) => {
    console.log(`${colors.green}[${timestamp()}] [OK]${colors.reset}`, ...args);
  },
  cron: (jobName, ...args) => {
    console.log(`${colors.magenta}[${timestamp()}] [CRON:${jobName}]${colors.reset}`, ...args);
  },
};

module.exports = { logger };
