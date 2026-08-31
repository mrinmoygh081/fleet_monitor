const Alert = require('../models/Alert');
const Trip = require('../models/Trip');
const Place = require('../models/Place');
const Vehicle = require('../models/Vehicle');
const realtime = require('../services/realtimeService');
const { isValidCoordinates } = require('../utils/coordinates');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');


async function create(req, res, next) {
  try {
    const { tripId, gpsDeviceNo, alertType, coordinates } = req.body;
    if (!tripId || !gpsDeviceNo || !alertType) {
      return res.status(400).json({ success: false, message: 'tripId, gpsDeviceNo and alertType are required.' });
    }

    const trip = await Trip.findDetailedById(tripId);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    if (trip.gpsDeviceNo && trip.gpsDeviceNo !== gpsDeviceNo) {
      return res.status(400).json({ success: false, message: 'gpsDeviceNo does not match the vehicle on this trip.' });
    }

    const existing = await Alert.findPendingByTripAndType(tripId, alertType);
    if (existing) return res.status(200).json({ success: true, alert: existing, deduped: true });

    const alert = await Alert.insertAlert({
      tripId, gpsDeviceNo, alertType, coordinates, reason: req.body.reason,
    });
    realtime.emitAlertNew(alert);
    res.status(201).json({ success: true, alert });
  } catch (err) { next(err); }
}







async function list(req, res, next) {
  try {
    let { gpsDeviceNo } = req.query;
    if (!gpsDeviceNo && req.query.vehicle) {
      const vehicle = await Vehicle.findByPlateNumber(req.query.vehicle);
      if (!vehicle) return res.status(404).json({ success: false, message: `No vehicle found for plate ${req.query.vehicle}.` });
      gpsDeviceNo = vehicle.gpsDeviceNo;
    }
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: alerts, totalItems } = await Alert.list({
      tripId: req.query.tripId,
      gpsDeviceNo,
      status: req.query.status,
      alertType: req.query.alertType,
      limit,
      offset,
    });
    res.json({
      success: true,
      alerts,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });
    res.json({ success: true, alert });
  } catch (err) { next(err); }
}





async function resolve(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });
    if (alert.status === 'RESOLVED') {
      return res.status(400).json({ success: false, message: 'Alert is already resolved.' });
    }
    const resolved = await Alert.resolve(req.params.id, { resolvedBy: req.user?.id, note: req.body?.remarks });
    realtime.emitAlertResolved(resolved);
    res.json({ success: true, alert: resolved });
  } catch (err) { next(err); }
}


async function markWrong(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });
    if (alert.status === 'WRONG') {
      return res.status(200).json({ success: true, alert, message: 'Alert was already marked wrong.' });
    }

    const { placeName, coordinates, placeType } = req.body || {};
    const finalCoordinates = isValidCoordinates(coordinates) ? coordinates : alert.coordinates;

    const updated = await Alert.markWrong(req.params.id, { resolvedBy: req.user?.id });
    realtime.emitAlertWrong(updated);

    let savedPlace = null;
    if (finalCoordinates) {
      savedPlace = await Place.findOrCreate({
        placeName: placeName || `Wrong-alert location (alert #${alert.id})`,
        coordinates: finalCoordinates,
        placeType: placeType || 'HUB',
        provider: 'MANUAL',
        createdBy: req.user?.id,
      });
    }

    res.json({ success: true, alert: updated, savedPlace });
  } catch (err) { next(err); }
}

module.exports = {
  list, create, getById, resolve, markWrong,
};
