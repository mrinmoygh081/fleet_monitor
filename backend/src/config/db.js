const pool = require('./pgPool');
const { generateShortId } = require('../utils/shortId');



module.exports = { pool, generateShortId };
