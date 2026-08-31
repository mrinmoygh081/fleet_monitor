const Place = require('../models/Place');
const { searchAndImport } = require('../services/placeProviderService');
const { isValidCoordinates } = require('../utils/coordinates');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const BASE_PLACE_TYPES = ['SOURCE', 'DESTINATION', 'FUEL_STATION', 'REST_AREA', 'HOSPITAL', 'RESTAURANT', 'SERVICE_CENTRE', 'TOLL_PLAZA', 'WAREHOUSE', 'OTHER'];

async function listTypes(req, res, next) {
  try {
    const stored = await Place.distinctTypes();
    const types = Array.from(new Set([...BASE_PLACE_TYPES, ...stored])).sort();
    res.json({
      success: true,
      message: 'Place types fetched successfully',
      data: { placeTypes: types },
      error: null,
    });
  } catch (err) { next(err); }
}


async function list(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { rows: places, totalItems } = await Place.list({ placeType: req.query.placeType, limit, offset });
    res.json({
      success: true,
      places,
      pagination: buildPaginationMeta({ page, limit, totalItems }),
    });
  } catch (err) { next(err); }
}


















async function search(req, res, next) {
  try {
    const searchText = req.query.name || req.query.query;
    if (!searchText) return res.status(400).json({ success: false, message: 'name is required.' });
    const places = await searchAndImport(searchText, req.user?.id, { placeType: req.query.placeType });
    res.json({ success: true, places });
  } catch (err) { next(err); }
}




async function create(req, res, next) {
  try {
    const { placeName, coordinates } = req.body;
    if (!placeName || !isValidCoordinates(coordinates)) {
      return res.status(400).json({ success: false, message: 'placeName and coordinates ({lat,lng}) are required.' });
    }
    const place = await Place.findOrCreate({ ...req.body, createdBy: req.user?.id });
    res.status(201).json({ success: true, place });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const place = await Place.update(req.params.id, { ...req.body, updatedBy: req.user?.id });
    if (!place) return res.status(404).json({ success: false, message: 'Place not found.' });
    res.json({ success: true, place });
  } catch (err) { next(err); }
}



async function remove(req, res, next) {
  try {
    const cancelled = await Place.remove(req.params.id, req.user?.id || null);
    if (!cancelled) return res.status(404).json({ success: false, message: 'Place not found (or already deleted).' });
    res.json({ success: true, message: 'Place deleted.', place: cancelled });
  } catch (err) { next(err); }
}

module.exports = { list, listTypes, search, create, update, remove };
