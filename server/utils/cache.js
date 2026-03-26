const NodeCache = require('node-cache');

// Cache API responses for 55 seconds minimum
const apiCache = new NodeCache({ stdTTL: 55, checkperiod: 60 });

module.exports = { apiCache };
