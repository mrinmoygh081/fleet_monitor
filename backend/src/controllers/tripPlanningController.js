const TripPlanning = require('../models/TripPlanning');
const Vehicle = require('../models/Vehicle');
const Place = require('../models/Place');
const { isValidCoordinates } = require('../utils/coordinates');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');



async function list(req, res, next) {
  try {
    const onlyActive = req.query.onlyActive !== 'false';
    const { page, limit, offset } = parsePagination(req.query);
    const { rows, totalItems } = await TripPlanning.list({
      onlyActive, search: req.query.search, limit, offset,
    });
    res.json({
      success: true,
      tripPlanning: rows,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}



async function getById(req, res, next) {
  try {
    const row = await TripPlanning.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Trip planning record not found.' });
    res.json({ success: true, tripPlanning: row });
  } catch (err) { next(err); }
}


async function sync(req, res, next) {
  try {
    const {
      erpReferenceId, tripName, sourceCoordinates, destinationCoordinates,
      plateNumber, hubs, status,
    } = req.body;

    if (!isValidCoordinates(sourceCoordinates) || !isValidCoordinates(destinationCoordinates)) {
      return res.status(400).json({
        success: false,
        message: 'sourceCoordinates ({lat,lng}) and destinationCoordinates ({lat,lng}) are required.',
      });
    }

    if (erpReferenceId !== undefined && erpReferenceId !== null && typeof erpReferenceId !== 'string') {
      return res.status(400).json({ success: false, message: 'erpReferenceId, if provided, must be a string.' });
    }

    try {
      await Place.saveRouteEndpoints({
        sourceCoordinates, destinationCoordinates, sourceName: tripName ? `${tripName} — source` : undefined, destinationName: tripName ? `${tripName} — destination` : undefined, createdBy: req.user?.id,
      });
    } catch (placeErr) {
      console.error('Failed to auto-save trip planning source/destination to places master:', placeErr.message);
    }

    if (erpReferenceId) {
      const { row, wasInserted } = await TripPlanning.upsert({
        erpReferenceId, tripName, sourceCoordinates, destinationCoordinates,
        plateNumber, hubs, status,
        actorId: req.user?.id || null,
      });
      return res.status(wasInserted ? 201 : 200).json({ success: true, created: wasInserted, tripPlanning: row });
    }

    const row = await TripPlanning.create({
      tripName, sourceCoordinates, destinationCoordinates,
      plateNumber, hubs, status,
      actorId: req.user?.id || null,
    });
    res.status(201).json({ success: true, created: true, tripPlanning: row });
  } catch (err) { next(err); }
}


async function assignVehicle(req, res, next) {
  try {
    const { plateNumber } = req.body;
    if (!plateNumber) return res.status(400).json({ success: false, message: 'plateNumber is required.' });

    
    
    const [planning, vehicle] = await Promise.all([
      TripPlanning.findById(req.params.id),
      Vehicle.findByPlateNumber(plateNumber),
    ]);
    if (!planning) return res.status(404).json({ success: false, message: 'Trip planning record not found.' });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: `No vehicle found for plate ${plateNumber}.` });
    }
    if (vehicle.cancelledAt) {
      return res.status(400).json({ success: false, message: `Vehicle ${plateNumber} is decommissioned and cannot be assigned.` });
    }

    const conflict = await TripPlanning.findActiveConflictForPlate(plateNumber, planning.id);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `Vehicle ${plateNumber} is already assigned to an active trip (planning #${conflict.id}).`,
        conflict,
      });
    }

    const row = await TripPlanning.assignVehicle(req.params.id, plateNumber, req.user?.id || null);
    res.json({ success: true, tripPlanning: row });
  } catch (err) { next(err); }
}


async function remove(req, res, next) {
  try {
    const row = await TripPlanning.cancel(req.params.id, req.user?.id || null);
    if (!row) return res.status(404).json({ success: false, message: 'Trip planning record not found.' });
    res.json({ success: true, tripPlanning: row });
  } catch (err) { next(err); }
}

module.exports = { list, getById, sync, assignVehicle, remove };
