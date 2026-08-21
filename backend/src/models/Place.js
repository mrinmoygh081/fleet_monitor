const { pool } = require('../config/db');
const { isSameLocation, boundingBox, isValidCoordinates } = require('../utils/coordinates');


const SELECT_COLUMNS = `
  place_id AS "id", place_name AS "placeName",
  coordinates, place_type AS "placeType",
  created_at AS "createdAt", created_by AS "createdBy", updated_at AS "updatedAt", updated_by AS "updatedBy",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM places WHERE place_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}






async function findNearCoordinates(coordinates, toleranceMeters) {
  const box = boundingBox(coordinates, toleranceMeters);
  const query = `
    SELECT ${SELECT_COLUMNS} FROM places
    WHERE deleted_at IS NULL
      AND (coordinates->>'lat')::double precision BETWEEN $1 AND $2
      AND (coordinates->>'lng')::double precision BETWEEN $3 AND $4
  `;
  const result = await pool.query(query, [box.minLat, box.maxLat, box.minLng, box.maxLng]);
  let closest = null;
  let closestDistance = Infinity;
  for (const row of result.rows) {
    if (isSameLocation(coordinates, row.coordinates, toleranceMeters)) {
      const d = Math.abs(row.coordinates.lat - coordinates.lat) + Math.abs(row.coordinates.lng - coordinates.lng);
      if (d < closestDistance) { closest = row; closestDistance = d; }
    }
  }
  return closest;
}



async function findOrCreate({ placeName, coordinates, placeType, createdBy }, toleranceMeters) {
  const existing = await findNearCoordinates(coordinates, toleranceMeters);
  if (existing) return existing;
  return create({ placeName, coordinates, placeType, createdBy });
}

async function search(queryText, { placeType } = {}) {
  const values = [`%${queryText}%`];
  let whereSql = `WHERE deleted_at IS NULL AND place_name ILIKE $1`;
  if (placeType) {
    values.push(placeType);
    whereSql += ` AND place_type = $${values.length}`;
  }
  const query = `SELECT ${SELECT_COLUMNS} FROM places ${whereSql} ORDER BY place_name ASC LIMIT 20`;
  const result = await pool.query(query, values);
  return result.rows;
}


async function list({
  placeType, search, onlyActive = true, limit, offset,
} = {}) {
  const whereClauses = [];
  const values = [];
  if (onlyActive) whereClauses.push('deleted_at IS NULL');
  if (placeType) {
    values.push(placeType);
    whereClauses.push(`place_type = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    whereClauses.push(`place_name ILIKE $${values.length}`);
  }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const listValues = [...values];
  let limitSql = '';
  if (limit !== undefined) {
    listValues.push(limit);
    limitSql += ` LIMIT $${listValues.length}`;
    listValues.push(offset || 0);
    limitSql += ` OFFSET $${listValues.length}`;
  }

  const query = `SELECT ${SELECT_COLUMNS}, COUNT(*) OVER()::int AS "totalItems" FROM places ${whereSql} ORDER BY created_at DESC${limitSql}`;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM places ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

async function create({ placeName, coordinates, placeType, createdBy }) {
  const query = `
    INSERT INTO places (place_name, coordinates, place_type, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [placeName, coordinates, placeType || 'OTHER', createdBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function update(id, { placeName, coordinates, placeType, updatedBy }) {
  const query = `
    UPDATE places SET
      place_name = COALESCE($2, place_name),
      coordinates = COALESCE($3, coordinates),
      place_type = COALESCE($4, place_type),
      updated_at = NOW(),
      updated_by = $5
    WHERE place_id = $1 AND deleted_at IS NULL
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id, placeName, coordinates, placeType, updatedBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}







async function remove(id, deletedBy) {
  const query = `
    UPDATE places SET deleted_at = NOW(), deleted_by = $2
    WHERE place_id = $1 AND deleted_at IS NULL
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, deletedBy]);
  return result.rows[0] || null;
}

async function distinctTypes() {
  const query = `SELECT DISTINCT place_type AS "placeType" FROM places WHERE deleted_at IS NULL ORDER BY place_type ASC`;
  const result = await pool.query(query);
  return result.rows.map((r) => r.placeType);
}

async function resolvePlaceForCoordinates(coordinates, fallbackName, placeType, createdBy) {
  const existing = await findNearCoordinates(coordinates);
  if (existing) return existing;

  let resolvedName = fallbackName;
  let resolvedType = placeType || 'OTHER';
  if (!fallbackName) {
    try {
      const { reverseGeocode } = require('../services/placeProviderService');
      const geocoded = await reverseGeocode(coordinates);
      if (geocoded?.placeName) {
        resolvedName = geocoded.placeName;
        resolvedType = placeType || geocoded.placeType || 'OTHER';
      }
    } catch (err) {
      console.warn('[Place] reverse geocode failed, using coordinate fallback name:', err.message);
    }
  }

  if (!resolvedName) {
    resolvedName = `Unnamed location (${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)})`;
  }

  return create({
    placeName: resolvedName, coordinates, placeType: resolvedType, createdBy,
  });
}

async function saveRouteEndpoints({
  sourceCoordinates, destinationCoordinates, sourceName, destinationName, placeType, createdBy,
}) {
  const jobs = [];
  if (isValidCoordinates(sourceCoordinates)) {
    jobs.push(resolvePlaceForCoordinates(sourceCoordinates, sourceName, placeType, createdBy));
  }
  if (isValidCoordinates(destinationCoordinates)) {
    jobs.push(resolvePlaceForCoordinates(destinationCoordinates, destinationName, placeType, createdBy));
  }
  return Promise.all(jobs);
}

module.exports = {
  findById, findNearCoordinates, findOrCreate, search, list, distinctTypes, create, update, remove, saveRouteEndpoints,
};
