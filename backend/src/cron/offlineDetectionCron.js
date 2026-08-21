const cron = require('node-cron');
const Trip = require('../models/Trip');
const { raiseOfflineAlert } = require('../services/geoAlertService');
const { GPS_OFFLINE_MINUTES_THRESHOLD, GPS_OFFLINE_CHECK_CRON } = require('../config/env');
const logger = require('../middleware/logger');

function startOfflineDetectionCron() {
  cron.schedule(GPS_OFFLINE_CHECK_CRON, async () => {
    try {
      const staleTrips = await Trip.findStaleOngoing(GPS_OFFLINE_MINUTES_THRESHOLD);
      for (const stale of staleTrips) {

        await raiseOfflineAlert({
          tripId: stale.id,
          gpsDeviceNo: stale.gpsDeviceNo,
          lastSeenAt: stale.lastSeenAt,
        });
      }
      if (staleTrips.length > 0) {
        logger.info(`[gps offline] checked ${staleTrips.length} stale ONGOING trip(s).`);
      }
    } catch (err) {
      logger.error(`offlineDetectionCron failed: ${err.message}`);
    }
  });
}

module.exports = { startOfflineDetectionCron };
