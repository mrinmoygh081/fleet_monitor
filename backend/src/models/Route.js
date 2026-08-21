const { pool } = require('../config/db');
const { isSameLocation, boundingBox, toJsonb } = require('../utils/coordinates');








const SELECT_COLUMNS = `
  route_id AS "id", src_coords AS "sourceCoordinates", dest_coords AS "destinationCoordinates",
  route_label AS "routeLabel", route_geometry AS "routeGeometry", hubs,
  dist, duration_seconds AS "durationSeconds",
  toll_info AS "tollInfo", times_used AS "timesUsed", last_used_at AS "lastUsedAt",
  is_delete AS "isDelete",
  created_at AS "createdAt", created_by AS "createdBy"
`;

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM routes WHERE route_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}


async function findByCoordinates(sourceCoordinates, destinationCoordinates, { hubs, toleranceMeters } = {}) {
  const srcBox = boundingBox(sourceCoordinates, toleranceMeters);
  const dstBox = boundingBox(destinationCoordinates, toleranceMeters);
  const query = `
    SELECT ${SELECT_COLUMNS} FROM routes
    WHERE is_delete = FALSE
      AND (src_coords->>'lat')::double precision BETWEEN $1 AND $2
      AND (src_coords->>'lng')::double precision BETWEEN $3 AND $4
      AND (dest_coords->>'lat')::double precision BETWEEN $5 AND $6
      AND (dest_coords->>'lng')::double precision BETWEEN $7 AND $8
    ORDER BY times_used DESC, last_used_at DESC NULLS LAST, route_label ASC
  `;
  const result = await pool.query(query, [
    srcBox.minLat, srcBox.maxLat, srcBox.minLng, srcBox.maxLng,
    dstBox.minLat, dstBox.maxLat, dstBox.minLng, dstBox.maxLng,
  ]);

  let rows = result.rows.filter(
    (r) => isSameLocation(sourceCoordinates, r.sourceCoordinates, toleranceMeters)
      && isSameLocation(destinationCoordinates, r.destinationCoordinates, toleranceMeters)
  );

  if (Array.isArray(hubs) && hubs.length) {
    rows = rows.filter((r) => hubsMatch(r.hubs, hubs, toleranceMeters));
  }

  return rows;
}

function hubsMatch(storedHubs, requestedHubs, toleranceMeters) {
  if (!Array.isArray(storedHubs) || storedHubs.length !== requestedHubs.length) return false;
  return storedHubs.every((h, i) => isSameLocation(h.coordinates, requestedHubs[i], toleranceMeters));
}



async function findPreferred(sourceCoordinates, destinationCoordinates, options) {
  const rows = await findByCoordinates(sourceCoordinates, destinationCoordinates, options);
  return rows[0] || null;
}

async function create({
  sourceCoordinates, destinationCoordinates, routeLabel, routeGeometry, hubs,
  dist, durationSeconds, tollInfo, createdBy,
}) {
  const query = `
    INSERT INTO routes
      (src_coords, dest_coords, route_label, route_geometry, hubs,
       dist, duration_seconds, toll_info, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${SELECT_COLUMNS}
  `;
  
  
  
  
  
  const values = [
    toJsonb(sourceCoordinates), toJsonb(destinationCoordinates), routeLabel || 'RECOMMENDED', toJsonb(routeGeometry),
    toJsonb(hubs || []), dist ?? null, durationSeconds ?? null,
    toJsonb(tollInfo), createdBy,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}



async function setHubs(id, hubs) {
  const query = `
    UPDATE routes SET hubs = $2
    WHERE route_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, toJsonb(hubs)]);
  return result.rows[0];
}



async function markUsed(id) {
  const query = `
    UPDATE routes SET times_used = times_used + 1, last_used_at = NOW()
    WHERE route_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}


async function softDelete(id) {
  const query = `
    UPDATE routes SET is_delete = TRUE
    WHERE route_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function list({ search, limit, offset } = {}) {
  const values = [];
  let whereSql = 'WHERE is_delete = FALSE';
  if (search) {
    values.push(`%${search}%`);
    whereSql += ` AND route_label ILIKE $${values.length}`;
  }

  const listValues = [...values];
  let limitSql = '';
  if (limit !== undefined) {
    listValues.push(limit);
    limitSql += ` LIMIT $${listValues.length}`;
    listValues.push(offset || 0);
    limitSql += ` OFFSET $${listValues.length}`;
  }

  const query = `
    SELECT ${SELECT_COLUMNS}, COUNT(*) OVER()::int AS "totalItems"
    FROM routes ${whereSql} ORDER BY created_at DESC${limitSql}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM routes ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

module.exports = { findById, findByCoordinates, findPreferred, list, create, setHubs, markUsed, softDelete };
