const app = require('./app');
const { PORT } = require('./config/env');
const { ensureSchema } = require('./db/schema');
const { startTokenCleanupCron } = require('./cron/tokenCleanupCron');
const { startOfflineDetectionCron } = require('./cron/offlineDetectionCron');
const { seedAdmin } = require('./startup/seedAdmin');
const { dedupeHubs } = require('./startup/dedupeHubs');
const { verifyEmailTransport } = require('./services/emailService');

async function start() {
  await ensureSchema();

  
  
  await seedAdmin();

  
  
  
  
  await dedupeHubs();

  startTokenCleanupCron();
  startOfflineDetectionCron();

  
  
  
  
  verifyEmailTransport();

  app.listen(PORT, () => {
    console.log(`Fleet backend listening on port ${PORT} (HTTP)`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
