const Trip = require('../models/Trip');
const TripPlanning = require('../models/TripPlanning');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const Hub = require('../models/Hub');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

// Turns a raw `hub_ids` int array into the full hub objects the frontend
// actually needs (name/type/coordinates), instead of making the client do a
// second round trip per hub id. Batches a single Hub.findByIds() call across
// every trip on the page/response rather than querying per-row.
async function attachHubs(trips) {
  const list = Array.isArray(trips) ? trips : [trips];
  const uniqueHubIds = [...new Set(list.flatMap((t) => t.hubIds || []))];
  const hubs = uniqueHubIds.length ? await Hub.findByIds(uniqueHubIds) : [];
  const hubsById = new Map(hubs.map((h) => [h.id, h]));

  const enrich = ({ hubIds, ...trip }) => ({
    ...trip,
    hubs: (hubIds || [])
      .map((id) => hubsById.get(id))
      .filter(Boolean)
      .map((h) => ({
        hubId: h.id, name: h.name, type: h.type, coordinates: h.coordinates,
      })),
  });

  return Array.isArray(trips) ? list.map(enrich) : enrich(list[0]);
}

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
    const {
      status, plateNumber, id, tripName, onlyActive,
    } = req.query;
    const [{ rows: trips, totalItems }, counts] = await Promise.all([
      Trip.list({
        status, plateNumber, id, tripName, onlyActive: onlyActive === 'true', limit, offset,
      }),
      // Counts ignore the `status`/`onlyActive` filters on purpose (but respect
      // id/plateNumber/tripName) so the client can render "Created / Ongoing /
      // Completed / Cancelled" totals alongside a status-filtered, paginated list.
      Trip.getStatusCounts({ plateNumber, id, tripName }),
    ]);
    res.json({
      success: true,
      trips: await attachHubs(trips),
      counts,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const trip = await Trip.findDetailedById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });

    res.json({ success: true, trip: await attachHubs(trip) });
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
