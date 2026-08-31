const cron = require('node-cron');
const AuthToken = require('../models/AuthToken');
const logger = require('../middleware/logger');


function startTokenCleanupCron() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const deleted = await AuthToken.deleteExpired();
      if (deleted > 0) {
        logger.info(`[token cleanup] removed ${deleted} expired auth_tokens row(s).`);
      }
    } catch (err) {
      logger.error(`tokenCleanupCron failed: ${err.message}`);
    }
  });
}

module.exports = { startTokenCleanupCron };
