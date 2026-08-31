const Hub = require('../models/Hub');
const { isValidCoordinates } = require('../utils/coordinates');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

function toCoordinates(body) {
  if (body.latitude === undefined && body.longitude === undefined) return undefined;
  return { lat: Number(body.latitude), lng: Number(body.longitude) };
}

async function list(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: hubs, totalItems } = await Hub.list({ type: req.query.type, limit, offset });
    res.json({
      success: true,
      hubs,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const hub = await Hub.findById(req.params.id);
    if (!hub) return res.status(404).json({ success: false, message: 'Hub not found.' });
    res.json({ success: true, hub });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const coordinates = toCoordinates(req.body);
    if (!req.body.name || !isValidCoordinates(coordinates)) {
      return res.status(400).json({ success: false, message: 'name, latitude and longitude are required.' });
    }
    const hub = await Hub.findOrCreate({
      name: req.body.name,
      type: req.body.type,
      coordinates,
      radiusMeters: req.body.radius_meters,
      createdBy: req.user?.id,
    });
    res.status(201).json({ success: true, hub });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const coordinates = toCoordinates(req.body);
    const hub = await Hub.update(req.params.id, {
      name: req.body.name,
      type: req.body.type,
      coordinates,
      radiusMeters: req.body.radius_meters,
      updatedBy: req.user?.id,
    });
    if (!hub) return res.status(404).json({ success: false, message: 'Hub not found.' });
    res.json({ success: true, hub });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {

    const hub = await Hub.remove(req.params.id, req.user?.id || null);
    if (!hub) return res.status(404).json({ success: false, message: 'Hub not found (or already deleted).' });
    res.json({ success: true, message: 'Hub deleted.', hub });
  } catch (err) { next(err); }
}

module.exports = { list, getById, create, update, remove };
