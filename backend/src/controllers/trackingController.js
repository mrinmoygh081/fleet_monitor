const Trip = require('../models/Trip');
const Alert = require('../models/Alert');
const { evaluateTracking, clearOfflineAlert } = require('../services/geoAlertService');
const realtime = require('../services/realtimeService');


async function ingest(req, res, next) {
  try {
    const { gpsDeviceNo, coordinates } = req.body;
    if (!gpsDeviceNo || !coordinates) {
      return res.status(400).json({ success: false, message: 'gpsDeviceNo and coordinates are required.' });
    }

    const trip = await Trip.findOngoingByGpsDeviceNo(gpsDeviceNo);
    if (!trip) return res.status(404).json({ success: false, message: 'No ONGOING trip found for this GPS device.' });

    const previousCoordinates = trip.currentCoordinates;
    const previousUpdatedAt = trip.updatedAt || trip.startedAt || trip.createdAt;

    const updated = await Trip.updateCurrentLocation(trip.id, coordinates);
    
    
    realtime.emitTripPosition(trip.id, coordinates, updated.status);

    
    
    
    
    const [, trackingResult] = await Promise.all([
      clearOfflineAlert(trip.id),
      evaluateTracking({
        trip: updated, previousCoordinates, previousUpdatedAt, newCoordinates: coordinates,
      }),
    ]);
    const { alertsRaised, tripCompleted, trip: finalTrip } = trackingResult;

    res.status(200).json({
      success: true,
      trip: tripCompleted ? finalTrip : updated,
      tripCompleted,
      alertsRaised,
    });
  } catch (err) { next(err); }
}

async function currentLocation(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, currentCoordinates: trip.currentCoordinates });
  } catch (err) { next(err); }
}


async function emergency(req, res, next) {
  try {
    const { gpsDeviceNo, coordinates } = req.body;
    if (!gpsDeviceNo) {
      return res.status(400).json({ success: false, message: 'gpsDeviceNo is required.' });
    }

    const trip = await Trip.findOngoingByGpsDeviceNo(gpsDeviceNo);
    if (!trip) return res.status(404).json({ success: false, message: 'No ONGOING trip found for this GPS device.' });

    if (coordinates) await Trip.updateCurrentLocation(trip.id, coordinates);

    
    
    
    
    if (trip.notifications?.emergency_alert === false) {
      return res.status(200).json({ success: true, alert: null, message: 'Emergency alert is turned off for this trip; location was still recorded.' });
    }

    const existing = await Alert.findPendingByTripAndType(trip.id, 'EMERGENCY');
    const alert = existing || await Alert.insertAlert({
      tripId: trip.id,
      gpsDeviceNo,
      alertType: 'EMERGENCY',
      coordinates: coordinates || trip.currentCoordinates,
      reason: 'Emergency button pressed by driver.',
      meta: { triggeredAt: new Date().toISOString() },
    });
    if (!existing) realtime.emitAlertNew(alert);

    res.status(201).json({ success: true, alert });
  } catch (err) { next(err); }
}

module.exports = {
  ingest, currentLocation, emergency,
};
