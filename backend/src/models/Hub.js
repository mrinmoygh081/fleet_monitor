const { pool } = require('../config/db');
const { isSameLocation, boundingBox } = require('../utils/coordinates');

const SELECT_COLUMNS = `
  hub_id AS "id", name, type, coordinates, radius_meters AS "radiusMeters",
  created_at AS "createdAt", created_by AS "createdBy", updated_at AS "updatedAt", updated_by AS "updatedBy",
  cancelled_at AS "cancelledAt", cancelled_by AS "cancelledBy"
`;

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM hubs WHERE hub_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

async function findByIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const query = `SELECT ${SELECT_COLUMNS} FROM hubs WHERE hub_id = ANY($1::int[])`;
  const result = await pool.query(query, [ids]);
  return result.rows;
}

async function findNearCoordinates(coordinates, toleranceMeters) {
  const box = boundingBox(coordinates, toleranceMeters);
  const query = `
    SELECT ${SELECT_COLUMNS} FROM hubs
    WHERE cancelled_at IS NULL
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

async function findOrCreate({ name, type, coordinates, radiusMeters, createdBy }, toleranceMeters) {
  const existing = await findNearCoordinates(coordinates, toleranceMeters);
  if (existing) return existing;
  return create({ name, type, coordinates, radiusMeters, createdBy });
}

async function list({
  type, onlyActive = true, limit, offset,
} = {}) {
  const whereClauses = [];
  const values = [];
  if (onlyActive) whereClauses.push('cancelled_at IS NULL');
  if (type) {
    values.push(type);
    whereClauses.push(`type = $${values.length}`);
  }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // limit === undefined means "no pagination requested" — used internally
  // by routeController (getStoppages calls Hub.list() with no args and
  // needs every hub, not one page of them), so this stays backward
  // compatible with the plain array shape when limit isn't passed.
  if (limit === undefined) {
    const query = `SELECT ${SELECT_COLUMNS} FROM hubs ${whereSql} ORDER BY created_at DESC`;
    const result = await pool.query(query, values);
    return result.rows;
  }

  const listValues = [...values, limit, offset || 0];
  const query = `
    SELECT ${SELECT_COLUMNS}, COUNT(*) OVER()::int AS "totalItems" FROM hubs ${whereSql}
    ORDER BY created_at DESC LIMIT $${listValues.length - 1} OFFSET $${listValues.length}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM hubs ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = result.rows[0]?.totalItems ?? 0;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

async function create({ name, type, coordinates, radiusMeters, createdBy }) {
  const query = `
    INSERT INTO hubs (name, type, coordinates, radius_meters, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [name, type || 'OTHER', coordinates, radiusMeters ?? 300, createdBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function update(id, { name, type, coordinates, radiusMeters, updatedBy }) {
  const query = `
    UPDATE hubs SET
      name = COALESCE($2, name),
      type = COALESCE($3, type),
      coordinates = COALESCE($4, coordinates),
      radius_meters = COALESCE($5, radius_meters),
      updated_at = NOW(),
      updated_by = $6
    WHERE hub_id = $1 AND cancelled_at IS NULL
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id, name, type, coordinates, radiusMeters, updatedBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function remove(id, cancelledBy) {
  const query = `
    UPDATE hubs SET cancelled_at = NOW(), cancelled_by = $2
    WHERE hub_id = $1 AND cancelled_at IS NULL
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, cancelledBy]);
  return result.rows[0] || null;
}

module.exports = { findById, findByIds, findNearCoordinates, findOrCreate, list, create, update, remove };
