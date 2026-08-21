const { pool } = require('../config/db');





const SELECT_COLUMNS = `
  tp.trip_planning_id AS "id", tp.erp_reference_id AS "erpReferenceId",
  tp.trip_name AS "tripName",
  tp.src_coords AS "sourceCoordinates", tp.dest_coords AS "destinationCoordinates",
  tp.plate_number AS "plateNumber", tp.hubs, tp.status,
  tp.created_at AS "createdAt", tp.created_by AS "createdBy",
  tp.updated_at AS "updatedAt", tp.updated_by AS "updatedBy",
  tp.cancelled_at AS "cancelledAt", tp.cancelled_by AS "cancelledBy"
`;




const CONVERTED_TRIP_COLUMN = `t.trip_id AS "convertedTripId"`;

async function findById(id) {
  const query = `
    SELECT ${SELECT_COLUMNS}, ${CONVERTED_TRIP_COLUMN}
    FROM trip_planning tp
    LEFT JOIN trips t ON t.trip_planning_id = tp.trip_planning_id
    WHERE tp.trip_planning_id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}








async function list({
  onlyActive, search, limit, offset,
} = {}) {
  const values = [];
  const whereClauses = [];
  if (onlyActive) {
    whereClauses.push('tp.cancelled_at IS NULL');
    whereClauses.push('t.trip_id IS NULL');
  }
  if (search) {
    values.push(`%${search}%`);
    whereClauses.push(`(tp.trip_name ILIKE $${values.length} OR tp.plate_number ILIKE $${values.length})`);
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

  const query = `
    SELECT ${SELECT_COLUMNS}, ${CONVERTED_TRIP_COLUMN}, COUNT(*) OVER()::int AS "totalItems"
    FROM trip_planning tp
    LEFT JOIN trips t ON t.trip_planning_id = tp.trip_planning_id
    ${whereSql}
    ORDER BY tp.created_at DESC${limitSql}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM trip_planning tp
      LEFT JOIN trips t ON t.trip_planning_id = tp.trip_planning_id
      ${whereSql}
    `;
    const countResult = await pool.query(countQuery, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

// POST /trip-planning — plain insert, no erpReferenceId (manual/no-ERP-id
// case). Kept as-is for backward compatibility.
async function create({
  tripName, sourceCoordinates, destinationCoordinates,
  plateNumber, hubs, status, actorId,
}) {
  const query = `
    INSERT INTO trip_planning
      (trip_name, src_coords, dest_coords, plate_number, hubs, status, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING trip_planning_id
  `;
  const values = [
    tripName ?? null, sourceCoordinates, destinationCoordinates,
    plateNumber ?? null, JSON.stringify(hubs || []), status || 'PLANNED', actorId,
  ];
  const result = await pool.query(query, values);
  return findById(result.rows[0].trip_planning_id);
}


async function upsert({
  erpReferenceId, tripName, sourceCoordinates, destinationCoordinates,
  plateNumber, hubs, status, actorId,
}) {
  const query = `
    INSERT INTO trip_planning
      (erp_reference_id, trip_name, src_coords, dest_coords, plate_number, hubs, status, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (erp_reference_id) DO UPDATE SET
      trip_name      = EXCLUDED.trip_name,
      src_coords     = EXCLUDED.src_coords,
      dest_coords    = EXCLUDED.dest_coords,
      plate_number   = EXCLUDED.plate_number,
      hubs           = EXCLUDED.hubs,
      status         = COALESCE(EXCLUDED.status, trip_planning.status),
      updated_at     = NOW(),
      updated_by     = EXCLUDED.created_by
    RETURNING trip_planning_id, (xmax = 0) AS "wasInserted"
  `;
  const values = [
    erpReferenceId, tripName ?? null, sourceCoordinates, destinationCoordinates,
    plateNumber ?? null, JSON.stringify(hubs || []), status || null, actorId,
  ];
  const result = await pool.query(query, values);
  const { trip_planning_id: id, wasInserted } = result.rows[0];
  const row = await findById(id);
  return { row, wasInserted };
}




async function assignVehicle(id, plateNumber, updatedBy) {
  const query = `
    UPDATE trip_planning SET plate_number = $2, updated_at = NOW(), updated_by = $3
    WHERE trip_planning_id = $1
    RETURNING trip_planning_id
  `;
  const result = await pool.query(query, [id, plateNumber, updatedBy]);
  if (!result.rows[0]) return null;
  return findById(id);
}






async function findActiveConflictForPlate(plateNumber, excludingTripPlanningId) {
  const query = `
    SELECT tp.trip_planning_id AS "id", tp.trip_name AS "tripName", t.status AS "tripStatus"
    FROM trip_planning tp
    JOIN trips t ON t.trip_planning_id = tp.trip_planning_id
    WHERE tp.plate_number = $1
      AND tp.trip_planning_id <> $2
      AND t.status IN ('CREATED', 'ONGOING')
    LIMIT 1
  `;
  const result = await pool.query(query, [plateNumber, excludingTripPlanningId]);
  return result.rows[0] || null;
}


async function cancel(id, cancelledBy) {
  const query = `
    UPDATE trip_planning SET cancelled_at = NOW(), cancelled_by = $2, status = 'CANCELLED'
    WHERE trip_planning_id = $1
    RETURNING trip_planning_id
  `;
  const result = await pool.query(query, [id, cancelledBy]);
  if (!result.rows[0]) return null;
  return findById(id);
}

module.exports = {
  findById, list, create, upsert, assignVehicle, findActiveConflictForPlate, cancel,
};
