const Trip = require('../models/Trip');
const TripPlanning = require('../models/TripPlanning');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const Hub = require('../models/Hub');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');


async function create(req, res, next) {
  try {
    const {
      tripName, tripPlanningId, routeId, notifications, hubs,
    } = req.body;
    if (!tripPlanningId || !routeId) {
      return res.status(400).json({ success: false, message: 'tripPlanningId and routeId are required.' });
    }
    if (hubs !== undefined && !Array.isArray(hubs)) {
      return res.status(400).json({ success: false, message: 'hubs, if provided, must be an array of hub IDs.' });
    }

    
    
    
    
    const [planning, route] = await Promise.all([
      TripPlanning.findById(tripPlanningId),
      Route.findById(routeId),
    ]);
    if (!planning) return res.status(404).json({ success: false, message: 'Trip planning record not found.' });
    if (!planning.plateNumber) {
      return res.status(400).json({ success: false, message: 'This trip planning record has no vehicle assigned yet.' });
    }
    if (planning.convertedTripId) {
      return res.status(400).json({ success: false, message: 'This trip planning record already has a trip.' });
    }
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    const vehicle = await Vehicle.findByPlateNumber(planning.plateNumber);
    if (!vehicle) return res.status(404).json({ success: false, message: `No vehicle found for plate ${planning.plateNumber}.` });

    let hubIds;
    if (Array.isArray(hubs)) {
      const found = await Hub.findByIds(hubs);
      if (found.length !== hubs.length) {
        const foundIds = new Set(found.map((h) => h.id));
        const missing = hubs.filter((id) => !foundIds.has(id));
        return res.status(404).json({ success: false, message: `hubs contains unknown hub id(s): ${missing.join(', ')}.` });
      }
      hubIds = hubs;
    } else {
      
      
      hubIds = (route.hubs || []).map((h) => h.hubId).filter(Boolean);
    }

    const trip = await Trip.insertTrip({
      tripPlanningId, routeId, tripName, hubIds, notifications, createdBy: req.user?.id,
    });
    res.status(201).json({ success: true, trip: await Trip.findDetailedById(trip.id) });
  } catch (err) { next(err); }
}


async function list(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: trips, totalItems } = await Trip.list({
      status: req.query.status, plateNumber: req.query.plateNumber, limit, offset,
    });
    res.json({
      success: true,
      trips,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const trip = await Trip.findDetailedById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    
    
    trip.selectedHubs = await Hub.findByIds(trip.hubIds);
    res.json({ success: true, trip });
  } catch (err) { next(err); }
}

async function save(req, res, next) {
  try {
    const { routeId, hubs, notifications } = req.body;
    if (!routeId) {
      return res.status(400).json({ success: false, message: 'routeId is required.' });
    }
    if (hubs !== undefined && !Array.isArray(hubs)) {
      return res.status(400).json({ success: false, message: 'hubs, if provided, must be an array of hub IDs.' });
    }

    const [trip, route] = await Promise.all([
      Trip.findById(req.params.id),
      Route.findById(routeId),
    ]);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    if (trip.status !== 'CREATED') {
      return res.status(400).json({ success: false, message: `Only a CREATED trip can be saved/edited (current status: ${trip.status}). Once a trip is started, its route can no longer be changed.` });
    }
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    let hubIds;
    if (Array.isArray(hubs)) {
      const found = await Hub.findByIds(hubs);
      if (found.length !== hubs.length) {
        const foundIds = new Set(found.map((h) => h.id));
        const missing = hubs.filter((id) => !foundIds.has(id));
        return res.status(404).json({ success: false, message: `hubs contains unknown hub id(s): ${missing.join(', ')}.` });
      }
      hubIds = hubs;
    } else {

      hubIds = (route.hubs || []).map((h) => h.hubId).filter(Boolean);
    }

    const updated = await Trip.updateRoute(req.params.id, routeId, {
      hubIds, notifications, updatedBy: req.user?.id,
    });
    res.json({ success: true, trip: await Trip.findDetailedById(updated.id) });
  } catch (err) { next(err); }
}

async function start(req, res, next) {
  try {
    const trip = await Trip.start(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, trip });
  } catch (err) { next(err); }
}






async function complete(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    if (trip.status !== 'ONGOING') {
      return res.status(400).json({ success: false, message: `Only an ONGOING trip can be completed (current status: ${trip.status}).` });
    }
    const completed = await Trip.complete(req.params.id);
    res.json({ success: true, trip: completed });
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const trip = await Trip.cancel(req.params.id, {
      cancelledBy: req.user?.id,
      cancellationReason: req.body?.reason,
    });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, trip });
  } catch (err) { next(err); }
}

module.exports = {
  create, list, getById, save, start, complete, cancel,
};
