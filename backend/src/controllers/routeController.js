const Route = require('../models/Route');
const Hub = require('../models/Hub');
const Place = require('../models/Place');
const { generateRoutes } = require('../services/routeProviderService');
const { estimateToll } = require('../services/tollService');
const { discoverHubsAlongRoute } = require('../services/hubProviderService');
const { isValidCoordinates, extractPolylinePoints, distanceKm } = require('../utils/coordinates');






function toClientRoute(route) {
  if (!route) return route;
  const {
    routeGeometry, dist, durationSeconds, tollInfo, ...rest
  } = route;
  return {
    ...rest,
    dist,
    durationSeconds,
    tollInfo,
    path: extractPolylinePoints(routeGeometry),
    routeMatrix: {
      distanceMeters: dist ?? null,
      distanceKm: dist != null ? Math.round((dist / 1000) * 10) / 10 : null,
      durationSeconds: durationSeconds ?? null,
      durationMinutes: durationSeconds != null ? Math.round(durationSeconds / 60) : null,
      tollInfo: tollInfo ?? null,
    },
  };
}

function toClientRoutes(routes) {
  return (routes || []).map(toClientRoute);
}



async function searchRoutes(req, res, next) {
  try {
    const sourceCoordinates = normalizeCoordinateInput(req.body?.source)
      || normalizeCoordinateInput(req.body?.sourceCoordinates)
      || parseCoordinates(req.query.sourceLat, req.query.sourceLng);
    const destinationCoordinates = normalizeCoordinateInput(req.body?.destination)
      || normalizeCoordinateInput(req.body?.destinationCoordinates)
      || parseCoordinates(req.query.destinationLat, req.query.destinationLng);
    if (!sourceCoordinates || !destinationCoordinates) {
      return res.status(400).json({ success: false, message: 'source and destination ({lat,lng} or [lat,lng]) are required.' });
    }

    const hubs = normalizeHubsInput(req.body?.stoppages)
      || normalizeHubsInput(req.body?.hubs)
      || parseHubsQuery(req.query.hubs);
    const vehicleProfile = req.body?.vehicleProfile;
    const force = req.body?.force === true || req.query.force === 'true';

    let routes = force ? [] : await Route.findByCoordinates(sourceCoordinates, destinationCoordinates, { hubs });
    const dbHit = routes.length > 0;

    if (!dbHit) {
      routes = await generateAndPersistRoutes({
        sourceCoordinates, destinationCoordinates, hubs, vehicleProfile, actorId: req.user?.id,
      });
    }

    
    
    
    
    
    
    
    
    
    
    
    const clientRoutes = toClientRoutes(routes).map((r, idx) => ({
      ...r,
      preferred: idx === 0,
      preference: idx === 0 ? 'PREFERRED' : 'ALTERNATE',
    }));
    
    
    
    
    
    res.json({
      success: true,
      routes: clientRoutes,
    });
  } catch (err) { next(err); }
}




























async function generateAndPersistRoutes({
  sourceCoordinates, destinationCoordinates, hubs, vehicleProfile, actorId,
}) {
  try {
    await Place.saveRouteEndpoints({ sourceCoordinates, destinationCoordinates, createdBy: actorId });
  } catch (placeErr) {
    console.error('Failed to auto-save route source/destination to places master:', placeErr.message);
  }

  const providerRoutes = await generateRoutes({
    sourceCoordinates, destinationCoordinates, hubs, vehicleProfile,
  });

  return Promise.all(providerRoutes.map(async (r) => {
    const tollInfo = await estimateToll({ routeGeometry: r.routeGeometry, vehicleType: vehicleProfile?.vehicleType });
    return Route.create({
      sourceCoordinates, destinationCoordinates, routeLabel: r.routeLabel, routeGeometry: r.routeGeometry,
      hubs: hubs || [], dist: r.distanceMeters, durationSeconds: r.durationSeconds,
      tollInfo, createdBy: actorId,
    });
  }));
}

async function getById(req, res, next) {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    res.json({ success: true, route: toClientRoute(route) });
  } catch (err) { next(err); }
}


async function selectRoute(req, res, next) {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    const updated = await Route.markUsed(route.id);
    res.json({ success: true, route: toClientRoute(updated) });
  } catch (err) { next(err); }
}


async function getHubs(req, res, next) {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    const discovered = await discoverHubsAlongRoute(route.routeGeometry);

    res.json({
      success: true,
      source: { coordinates: route.sourceCoordinates },
      destination: { coordinates: route.destinationCoordinates },
      selectedHubs: route.hubs,
      candidateHubs: discovered,
    });
  } catch (err) { next(err); }
}

const HUBS_NEARBY_RADIUS_METERS = 3000;

async function buildStoppages(route) {
  const routePoints = extractPolylinePoints(route.routeGeometry);

  const [discovered, allHubs] = await Promise.all([
    discoverHubsAlongRoute(route.routeGeometry),
    Hub.list(),
  ]);

  // Lookup for backfilling radiusMeters on route.hubs entries that were saved
  // before radiusMeters was persisted on the route (legacy rows only had
  // hubId/name/type/coordinates/sequenceNo).
  const hubById = new Map(allHubs.map((h) => [h.id, h]));

  const selectedStoppages = (route.hubs || []).map((h) => ({
    hubId: h.hubId ?? null,
    name: h.name,
    type: h.type,
    coordinates: h.coordinates,
    radiusMeters: h.radiusMeters ?? hubById.get(h.hubId)?.radiusMeters ?? null,
    sequenceNo: h.sequenceNo ?? null,
  }));

  const nearbyMasterHubs = allHubs
    .filter((h) => isValidCoordinates(h.coordinates)
      && routePoints.some((p) => distanceKm(p, h.coordinates) * 1000 <= HUBS_NEARBY_RADIUS_METERS))
    .map((h) => ({
      hubId: h.id,
      name: h.name,
      type: h.type,
      coordinates: h.coordinates,
      radiusMeters: h.radiusMeters,
      sequenceNo: null,
    }));

  // Candidates discovered live from the external place-search provider aren't
  // persisted hub records yet, so there's no hubId/radiusMeters for them until
  // someone selects one (selectHubs will then findOrCreate the Hub row, which
  // defaults radiusMeters to 300 — see Hub.create).
  const candidateStoppages = discovered.map((d) => ({
    hubId: null,
    name: d.placeName,
    type: d.placeType,
    coordinates: d.coordinates,
    radiusMeters: null,
    sequenceNo: null,
  }));

  return [...selectedStoppages, ...nearbyMasterHubs, ...candidateStoppages];
}

async function getStoppages(req, res, next) {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found.', data: null, error: 'ROUTE_NOT_FOUND' });
    }

    const stoppages = await buildStoppages(route);
    res.json({
      success: true,
      message: 'Stoppages fetched successfully',
      data: { routeId: route.id, stoppages },
      error: null,
    });
  } catch (err) { next(err); }
}


async function getStoppagesByCoordinates(req, res, next) {
  try {
    const sourceCoordinates = normalizeCoordinateInput(req.body?.source)
      || parseCoordinates(req.query.sourceLat, req.query.sourceLng);
    const destinationCoordinates = normalizeCoordinateInput(req.body?.destination)
      || parseCoordinates(req.query.destinationLat, req.query.destinationLng);

    if (!sourceCoordinates || !destinationCoordinates) {
      return res.status(400).json({
        success: false,
        message: 'source and destination ({lat,lng} or [lat,lng]) are required.',
        data: null,
        error: 'INVALID_COORDINATES',
      });
    }

    let routes = await Route.findByCoordinates(sourceCoordinates, destinationCoordinates, {});
    if (!routes.length) {
      routes = await generateAndPersistRoutes({
        sourceCoordinates, destinationCoordinates, hubs: [], vehicleProfile: req.body?.vehicleProfile, actorId: req.user?.id,
      });
    }
    if (!routes.length) {
      return res.status(404).json({
        success: false,
        message: 'No route could be found or generated for this source/destination.',
        data: null,
        error: 'ROUTE_NOT_FOUND',
      });
    }

    const route = routes[0];
    const stoppages = await buildStoppages(route);
    res.json({
      success: true,
      message: 'Stoppages fetched successfully',
      data: {
        routeId: route.id,
        path: extractPolylinePoints(route.routeGeometry),
        stoppages,
      },
      error: null,
    });
  } catch (err) { next(err); }
}


async function selectHubs(req, res, next) {
  try {
    const { hubs } = req.body;
    if (!Array.isArray(hubs) || !hubs.length) {
      return res.status(400).json({ success: false, message: 'hubs (non-empty array of { hubId } or { name, coordinates } entries) is required.' });
    }

    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    const resolvedHubs = [];
    for (let i = 0; i < hubs.length; i += 1) {
      const h = hubs[i];
      let hub;
      if (h.hubId) {
        hub = await Hub.findById(h.hubId);
        if (!hub) return res.status(404).json({ success: false, message: `hubs[${i}].hubId ${h.hubId} was not found.` });
      } else {
        if (!isValidCoordinates(h.coordinates)) {
          return res.status(400).json({ success: false, message: `hubs[${i}] needs either a hubId, or coordinates ({lat,lng}) to create one.` });
        }
        hub = await Hub.findOrCreate({
          name: h.name || h.placeName || 'Hub',
          type: h.type || h.placeType || 'OTHER',
          coordinates: h.coordinates,
          radiusMeters: h.radiusMeters,
          createdBy: req.user?.id,
        });
      }
      resolvedHubs.push({
        hubId: hub.id,
        name: hub.name,
        type: hub.type,
        coordinates: hub.coordinates,
        radiusMeters: hub.radiusMeters,
        sequenceNo: h.sequenceNo ?? i + 1,
      });
    }
    resolvedHubs.sort((a, b) => a.sequenceNo - b.sequenceNo);

    const updated = await Route.setHubs(route.id, resolvedHubs);
    res.json({ success: true, route: toClientRoute(updated) });
  } catch (err) { next(err); }
}




async function reorderHubs(req, res, next) {
  try {
    const orderedHubIds = req.body.orderedHubIds || req.body.orderedPlaceIds;
    if (!Array.isArray(orderedHubIds) || !orderedHubIds.length) {
      return res.status(400).json({ success: false, message: 'orderedHubIds (non-empty array) is required.' });
    }

    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    const byHubId = new Map(route.hubs.map((h) => [h.hubId, h]));
    const reordered = orderedHubIds
      .map((hubId, i) => (byHubId.has(hubId) ? { ...byHubId.get(hubId), sequenceNo: i + 1 } : null))
      .filter(Boolean);

    const updated = await Route.setHubs(route.id, reordered);
    res.json({ success: true, route: toClientRoute(updated) });
  } catch (err) { next(err); }
}




function normalizeCoordinateInput(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [lat, lng] = value;
    const coordinates = { lat: Number(lat), lng: Number(lng) };
    return isValidCoordinates(coordinates) ? coordinates : null;
  }
  return isValidCoordinates(value) ? value : null;
}



function normalizeHubsInput(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const normalized = value.map(normalizeCoordinateInput).filter(Boolean);
  return normalized.length ? normalized : null;
}

function parseCoordinates(lat, lng) {
  if (lat === undefined || lng === undefined) return null;
  const coordinates = { lat: Number(lat), lng: Number(lng) };
  return isValidCoordinates(coordinates) ? coordinates : null;
}



function parseHubsQuery(hubsParam) {
  if (!hubsParam) return null;
  return hubsParam.split('|').map((pair) => {
    const [lat, lng] = pair.split(',').map(Number);
    return { lat, lng };
  }).filter(isValidCoordinates);
}

module.exports = {
  searchRoutes, getById, selectRoute, getHubs, getStoppages, getStoppagesByCoordinates, selectHubs, reorderHubs,
};