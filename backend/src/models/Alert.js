const { pool } = require('../config/db');
const { toJsonb } = require('../utils/coordinates');








const SELECT_COLUMNS = `
  alert_id AS "id", trip_id AS "tripId", gps_device_no AS "gpsDeviceNo", alert_type AS "alertType",
  coordinates, reason, meta, status,
  resolved_at AS "resolvedAt", resolved_by AS "resolvedBy",
  created_at AS "createdAt"
`;

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM alerts WHERE alert_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}


async function findPendingByTripAndType(tripId, alertType) {
  const query = `
    SELECT ${SELECT_COLUMNS} FROM alerts
    WHERE trip_id = $1 AND alert_type = $2 AND status = 'PENDING'
    LIMIT 1
  `;
  const result = await pool.query(query, [tripId, alertType]);
  return result.rows[0] || null;
}


async function list({
  tripId, gpsDeviceNo, status, alertType, limit, offset,
} = {}) {
  const values = [];
  const whereClauses = [];
  if (tripId) { values.push(tripId); whereClauses.push(`trip_id = $${values.length}`); }
  if (gpsDeviceNo) { values.push(gpsDeviceNo); whereClauses.push(`gps_device_no = $${values.length}`); }
  if (status) { values.push(status); whereClauses.push(`status = $${values.length}`); }
  if (alertType) { values.push(alertType); whereClauses.push(`alert_type = $${values.length}`); }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const listValues = [...values];
  let limitSql = '';
  if (limit !== undefined) {
    listValues.push(limit);
    limitSql += ` LIMIT $${listValues.length}`;
    listValues.push(offset || 0);
    limitSql += ` OFFSET $${listValues.length}`;
  }

  const query = `
    SELECT ${SELECT_COLUMNS}, COUNT(*) OVER()::int AS "totalItems" FROM alerts
    ${whereSql}
    ORDER BY created_at DESC${limitSql}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM alerts ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

async function insertAlert({
  tripId, gpsDeviceNo, alertType, coordinates, reason, meta,
}) {
  const query = `
    INSERT INTO alerts (trip_id, gps_device_no, alert_type, coordinates, reason, meta)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [tripId, gpsDeviceNo, alertType, coordinates || null, reason || null, toJsonb(meta)];
  const result = await pool.query(query, values);
  return result.rows[0];
}

// `note`, when given, is appended onto the alert's own reason (e.g.



async function resolve(id, { resolvedBy, note } = {}) {
  const query = `
    UPDATE alerts
    SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $2,
        reason = CASE WHEN $3::text IS NULL THEN reason ELSE COALESCE(reason || ' ', '') || $3 END
    WHERE alert_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, resolvedBy, note || null]);
  return result.rows[0];
}




async function markWrong(id, { resolvedBy, note } = {}) {
  const query = `
    UPDATE alerts
    SET status = 'WRONG', resolved_at = NOW(), resolved_by = $2,
        reason = CASE WHEN $3::text IS NULL THEN reason ELSE COALESCE(reason || ' ', '') || $3 END
    WHERE alert_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, resolvedBy, note || null]);
  return result.rows[0];
}

module.exports = {
  findById, findPendingByTripAndType, list, insertAlert, resolve, markWrong,
};
