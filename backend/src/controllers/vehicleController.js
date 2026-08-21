const Vehicle = require('../models/Vehicle');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');


async function list(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: vehicles, totalItems } = await Vehicle.list({
      status: req.query.status,
      vehicleType: req.query.vehicleType,
      search: req.query.search,
      limit,
      offset,
    });
    res.json({
      success: true,
      vehicles,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    res.json({ success: true, vehicle });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    if (!req.body.plateNumber) {
      return res.status(400).json({ success: false, message: 'plateNumber is required.' });
    }
    const vehicle = await Vehicle.create({ ...req.body, createdBy: req.user?.id });
    res.status(201).json({ success: true, vehicle });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const vehicle = await Vehicle.update(req.params.id, { ...req.body, updatedBy: req.user?.id });
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    res.json({ success: true, vehicle });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    
    
    const vehicle = await Vehicle.cancel(req.params.id, req.user?.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    res.json({ success: true, vehicle });
  } catch (err) { next(err); }
}

module.exports = { list, getById, create, update, remove };
