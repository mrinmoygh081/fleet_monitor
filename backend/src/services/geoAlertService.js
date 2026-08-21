const Trip = require('../models/Trip');
const Alert = require('../models/Alert');
const Place = require('../models/Place');
const Hub = require('../models/Hub');
const {
  distanceKm, isSameLocation, projectPointOntoPolyline,
} = require('../utils/coordinates');
const {
  DESTINATION_REACHED_RADIUS_METERS, DEVIATION_RADIUS_METERS,
  UNAUTHORIZED_STOP_RADIUS_METERS, STOP_MOVEMENT_TOLERANCE_METERS, STOP_MINUTES_THRESHOLD,
  EXPECTED_AVERAGE_SPEED_KMPH, DELAY_TOLERANCE_FRACTION, DELAY_GRACE_MINUTES,
  DEVIATION_CONFIRM_PINGS,
} = require('../config/env');
const realtime = require('./realtimeService');


async function evaluateTracking({ trip, previousCoordinates, previousUpdatedAt, newCoordinates }) {
  const alertsRaised = [];

  
  
  const context = await Trip.findTrackingContext(trip.id);
  if (!context) return { alertsRaised, tripCompleted: false, trip };

  
  if (context.status === 'ONGOING' && context.destinationCoordinates) {
    const distanceToDestKm = distanceKm(newCoordinates, context.destinationCoordinates);
    const reached = distanceToDestKm * 1000 <= DESTINATION_REACHED_RADIUS_METERS;
    if (reached) {
      
      
      
      if (context.notifications?.destination_alert !== false) {
        const alert = await raiseAlertOnce({
          tripId: trip.id,
          gpsDeviceNo: context.gpsDeviceNo,
          alertType: 'DESTINATION_REACHED',
          coordinates: newCoordinates,
          reason: `Vehicle arrived within ${Math.round(distanceToDestKm * 1000)} m of the destination — trip auto-completed.`,
          meta: { distanceToDestinationMeters: Math.round(distanceToDestKm * 1000), radiusMeters: DESTINATION_REACHED_RADIUS_METERS },
        });
        if (alert) alertsRaised.push(alert);
      }

      deviationStreaks.delete(context.gpsDeviceNo);
      const completedTrip = await Trip.complete(trip.id);
      return { alertsRaised, tripCompleted: true, trip: completedTrip };
    }
  }

  
  
  
  let progress = null; 
  if (context.routeGeometry) {
    progress = projectPointOntoPolyline(newCoordinates, context.routeGeometry);
    if (progress) {
      const isOffRoute = progress.perpDistanceMeters > DEVIATION_RADIUS_METERS;
      const streakKey = context.gpsDeviceNo;

      if (isOffRoute) {
        const streak = (deviationStreaks.get(streakKey) || 0) + 1;
        deviationStreaks.set(streakKey, streak);

        
        
        if (streak >= DEVIATION_CONFIRM_PINGS && context.notifications?.deviation_alert !== false) {
          const distanceOffKm = progress.perpDistanceMeters / 1000;
          const alert = await raiseAlertOnce({
            tripId: trip.id,
            gpsDeviceNo: context.gpsDeviceNo,
            alertType: 'DEVIATION',
            coordinates: newCoordinates,
            reason: `Vehicle is ${distanceOffKm.toFixed(2)} km off the selected route (limit ${(DEVIATION_RADIUS_METERS / 1000).toFixed(2)} km), confirmed over ${streak} consecutive pings.`,
            meta: {
              distanceOffRouteMeters: Math.round(progress.perpDistanceMeters),
              toleranceMeters: DEVIATION_RADIUS_METERS,
              confirmedOverPings: streak,
            },
          });
          if (alert) alertsRaised.push(alert);
        }
      } else {
        
        
        if (deviationStreaks.has(streakKey)) deviationStreaks.delete(streakKey);
        await autoResolveIfPending(trip.id, 'DEVIATION', 'Vehicle returned to the selected route.');
      }
    }
  }
  
  

  
  
  
  
  const stoppedMinutes = previousCoordinates && previousUpdatedAt
    && isSameLocation(newCoordinates, previousCoordinates, STOP_MOVEMENT_TOLERANCE_METERS)
    ? minutesSince(previousUpdatedAt)
    : null;
  const stopped = stoppedMinutes !== null && stoppedMinutes >= STOP_MINUTES_THRESHOLD;

  
  
  if (stopped && context.notifications?.stoppage_alert === true) {
    const authorized = await isAuthorizedStop(newCoordinates, context);
    if (!authorized) {
      const alert = await raiseAlertOnce({
        tripId: trip.id,
        gpsDeviceNo: context.gpsDeviceNo,
        alertType: 'UNAUTHORIZED_STOP',
        coordinates: newCoordinates,
        reason: `Vehicle has been stationary for about ${Math.round(stoppedMinutes)} min at a location that isn't a recognized hub, source, destination, or previously-marked spot.`,
        meta: { stoppedMinutes: Math.round(stoppedMinutes), thresholdMinutes: STOP_MINUTES_THRESHOLD },
      });
      if (alert) alertsRaised.push(alert);
    }
  } else {
    
    
    
    await autoResolveIfPending(trip.id, 'UNAUTHORIZED_STOP', 'Vehicle is moving again.');
  }

  
  
  
  
  
  
  
  if (context.status === 'ONGOING' && context.startedAt) {
    const elapsedMinutes = minutesSince(context.startedAt);
    const totalMeters = progress?.totalLengthMeters || context.routeDistMeters;

    if (elapsedMinutes >= DELAY_GRACE_MINUTES && totalMeters) {
      const expectedTotalMinutes = (totalMeters / 1000 / EXPECTED_AVERAGE_SPEED_KMPH) * 60;
      const expectedFraction = Math.min(1, elapsedMinutes / expectedTotalMinutes);

      
      
      const actualFraction = progress
        ? progress.distanceAlongMeters / progress.totalLengthMeters
        : straightLineFractionCovered(context.sourceCoordinates, context.destinationCoordinates, newCoordinates);

      
      if (actualFraction !== null && expectedFraction - actualFraction > DELAY_TOLERANCE_FRACTION
        && context.notifications?.delay_alert !== false) {
        const behindMinutes = Math.round((expectedFraction - actualFraction) * expectedTotalMinutes);
        const alert = await raiseAlertOnce({
          tripId: trip.id,
          gpsDeviceNo: context.gpsDeviceNo,
          alertType: 'DELAY',
          coordinates: newCoordinates,
          reason: `Vehicle has covered only ~${Math.round(actualFraction * 100)}% of the route but ~${Math.round(expectedFraction * 100)}% was expected by now (assuming ${EXPECTED_AVERAGE_SPEED_KMPH} km/h average speed) — running about ${behindMinutes} min behind schedule.`,
          meta: {
            actualFraction: Number(actualFraction.toFixed(3)),
            expectedFraction: Number(expectedFraction.toFixed(3)),
            estimatedDelayMinutes: behindMinutes,
            assumedAverageSpeedKmph: EXPECTED_AVERAGE_SPEED_KMPH,
          },
        });
        if (alert) alertsRaised.push(alert);
      } else {
        await autoResolveIfPending(trip.id, 'DELAY', 'Vehicle is back on schedule.');
      }
    }
  }

  return { alertsRaised, tripCompleted: false, trip };
}





const deviationStreaks = new Map();










async function isAuthorizedStop(coordinates, context) {
  const tripHubs = await Hub.findByIds(context.hubIds);
  for (const hub of tripHubs) {
    if (isSameLocation(coordinates, hub.coordinates, hub.radiusMeters || UNAUTHORIZED_STOP_RADIUS_METERS)) return true;
  }

  const knownPoints = [context.sourceCoordinates, context.destinationCoordinates]
    .concat(flattenHubCoordinates(context.tripPlanningHubs))
    .concat(flattenHubCoordinates(context.routeHubs))
    .filter(Boolean);

  for (const point of knownPoints) {
    if (isSameLocation(coordinates, point, UNAUTHORIZED_STOP_RADIUS_METERS)) return true;
  }

  const savedPlace = await Place.findNearCoordinates(coordinates, UNAUTHORIZED_STOP_RADIUS_METERS);
  return Boolean(savedPlace);
}

function flattenHubCoordinates(hubs) {
  if (!Array.isArray(hubs)) return [];
  return hubs.map((h) => h?.coordinates).filter(Boolean);
}




function straightLineFractionCovered(source, destination, current) {
  if (!source || !destination) return null;
  const total = distanceKm(source, destination);
  if (!total) return null;
  const covered = distanceKm(source, current);
  return Math.max(0, Math.min(1, covered / total));
}

function minutesSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 60000;
}




async function raiseAlertOnce({
  tripId, gpsDeviceNo, alertType, coordinates, reason, meta,
}) {
  const existing = await Alert.findPendingByTripAndType(tripId, alertType);
  if (existing) return null; 
  const alert = await Alert.insertAlert({
    tripId, gpsDeviceNo, alertType, coordinates, reason, meta,
  });
  realtime.emitAlertNew(alert);
  return alert;
}

async function autoResolveIfPending(tripId, alertType, note) {
  const existing = await Alert.findPendingByTripAndType(tripId, alertType);
  if (!existing) return null;
  const resolved = await Alert.resolve(existing.id, { resolvedBy: null, note: `[Auto-cleared: ${note}]` });
  realtime.emitAlertCleared(resolved);
  return resolved;
}

async function raiseOfflineAlert({ tripId, gpsDeviceNo, lastSeenAt }) {
  const minutesSinceLastPing = Math.round(minutesSince(lastSeenAt));

  return raiseAlertOnce({
    tripId,
    gpsDeviceNo,
    alertType: 'OFFLINE',
    coordinates: null,
    reason: `No GPS ping received from this vehicle for about ${minutesSinceLastPing} min.`,
    meta: { minutesSinceLastPing },
  });
}

async function clearOfflineAlert(tripId) {
  return autoResolveIfPending(tripId, 'OFFLINE', 'GPS ping received again.');
}

module.exports = { evaluateTracking, raiseOfflineAlert, clearOfflineAlert };
