const Vehicle = require('../models/Vehicle');
const Place = require('../models/Place');
const Route = require('../models/Route');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const ENTITIES = {
  vehicles: async ({ search, vehicleType, status, limit, offset }) => {
    const { rows, totalItems } = await Vehicle.list({ search, vehicleType, status, limit, offset });
    return { key: 'vehicles', rows, totalItems };
  },
  places: async ({ search, placeType, limit, offset }) => {
    const { rows, totalItems } = await Place.list({ search, placeType, limit, offset });
    return { key: 'places', rows, totalItems };
  },
  routes: async ({ search, limit, offset }) => {
    const { rows, totalItems } = await Route.list({ search, limit, offset });
    return { key: 'routes', rows, totalItems };
  },
};

async function search(req, res, next) {
  try {
    const entity = String(req.params.entity || '').toLowerCase();
    const handler = ENTITIES[entity];
    if (!handler) {
      return res.status(400).json({
        success: false,
        message: `Unsupported search entity "${entity}". Supported: ${Object.keys(ENTITIES).join(', ')}.`,
        data: null,
        error: 'UNSUPPORTED_ENTITY',
      });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { key, rows, totalItems } = await handler({
      search: req.query.search,
      vehicleType: req.query.vehicleType,
      status: req.query.status,
      placeType: req.query.placeType,
      limit,
      offset,
    });

    res.json({
      success: true,
      message: 'Search results fetched successfully',
      data: {
        entity,
        [key]: rows,
        pagination: buildPaginationMeta({ page, limit, totalItems }),
      },
      error: null,
    });
  } catch (err) { next(err); }
}

module.exports = { search };
