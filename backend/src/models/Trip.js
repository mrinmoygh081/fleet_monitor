const { pool } = require('../config/db');



const SELECT_COLUMNS = `
  trip_id AS "id", trip_planning_id AS "tripPlanningId", route_id AS "routeId", trip_name AS "tripName",
  status, curr_coords AS "currentCoordinates", hub_ids AS "hubIds", notifications, started_at AS "startedAt", completed_at AS "completedAt",
  cancelled_at AS "cancelledAt", cancelled_by AS "cancelledBy", cancellation_reason AS "cancellationReason",
  created_at AS "createdAt", created_by AS "createdBy", updated_at AS "updatedAt", updated_by AS "updatedBy"
`;

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM trips WHERE trip_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}


async function findDetailedById(id) {
  const query = `
    SELECT
      t.trip_id AS "id", t.trip_planning_id AS "tripPlanningId", t.route_id AS "routeId", t.trip_name AS "tripName",
      t.status, t.curr_coords AS "currentCoordinates", t.hub_ids AS "hubIds", t.notifications,
      t.started_at AS "startedAt", t.completed_at AS "completedAt",
      t.cancelled_at AS "cancelledAt", t.cancelled_by AS "cancelledBy", t.cancellation_reason AS "cancellationReason",
      t.created_at AS "createdAt", t.updated_at AS "updatedAt",
      tp.src_coords AS "sourceCoordinates", tp.dest_coords AS "destinationCoordinates",
      tp.plate_number AS "plateNumber",
      v.vehicle_id AS "vehicleId", v.vehicle_type AS "vehicleType", v.gps_device_no AS "gpsDeviceNo",
      v.current_status AS "vehicleStatus"
    FROM trips t
    JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id
    LEFT JOIN vehicles v ON v.plate_number = tp.plate_number
    WHERE t.trip_id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}


async function findTrackingContext(id) {
  const query = `
    SELECT
      t.trip_id AS "id", t.status, t.started_at AS "startedAt",
      t.hub_ids AS "hubIds", t.notifications,
      v.gps_device_no AS "gpsDeviceNo",
      tp.src_coords AS "sourceCoordinates", tp.dest_coords AS "destinationCoordinates",
      tp.hubs AS "tripPlanningHubs",
      r.route_geometry AS "routeGeometry", r.hubs AS "routeHubs", r.dist AS "routeDistMeters"
    FROM trips t
    JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id
    LEFT JOIN vehicles v ON v.plate_number = tp.plate_number
    LEFT JOIN routes r ON r.route_id = t.route_id
    WHERE t.trip_id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}



async function findOngoingByGpsDeviceNo(gpsDeviceNo) {
  const query = `
    SELECT ${LIST_COLUMNS}
    FROM trips t
    JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id
    JOIN vehicles v ON v.plate_number = tp.plate_number
    WHERE v.gps_device_no = $1 AND t.status = 'ONGOING'
    LIMIT 1
  `;
  const result = await pool.query(query, [gpsDeviceNo]);
  return result.rows[0] || null;
}


async function findStaleOngoing(minutesThreshold) {
  const query = `
    SELECT
      t.trip_id AS "id", t.notifications,
      v.gps_device_no AS "gpsDeviceNo",
      COALESCE(t.updated_at, t.started_at) AS "lastSeenAt"
    FROM trips t
    JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id
    LEFT JOIN vehicles v ON v.plate_number = tp.plate_number
    WHERE t.status = 'ONGOING'
      AND COALESCE(t.updated_at, t.started_at) < NOW() - ($1 || ' minutes')::interval
      AND COALESCE(t.notifications ->> 'gps_offline_alert', 'true') != 'false'
      AND v.gps_device_no IS NOT NULL
  `;
  const result = await pool.query(query, [minutesThreshold]);
  return result.rows;
}

const LIST_COLUMNS = `
  t.trip_id AS "id", t.trip_planning_id AS "tripPlanningId", t.route_id AS "routeId", t.trip_name AS "tripName",
  t.status, t.curr_coords AS "currentCoordinates", t.hub_ids AS "hubIds", t.notifications, t.started_at AS "startedAt", t.completed_at AS "completedAt",
  t.cancelled_at AS "cancelledAt", t.cancelled_by AS "cancelledBy", t.cancellation_reason AS "cancellationReason",
  t.created_at AS "createdAt", t.created_by AS "createdBy", t.updated_at AS "updatedAt", t.updated_by AS "updatedBy",
  tp.plate_number AS "vehicleNo", tp.src_coords AS "source", tp.dest_coords AS "destination"
`;


async function list({
  status, plateNumber, id, tripName, onlyActive, limit, offset,
} = {}) {
  const values = [];
  const whereClauses = [];
  const joinSql = 'JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id';
  if (status) { values.push(status); whereClauses.push(`t.status = $${values.length}`); }
  if (plateNumber) { values.push(`%${plateNumber}%`); whereClauses.push(`tp.plate_number ILIKE $${values.length}`); }
  if (id) { values.push(id); whereClauses.push(`t.trip_id = $${values.length}`); }
  if (tripName) { values.push(`%${tripName}%`); whereClauses.push(`t.trip_name ILIKE $${values.length}`); }
  // Active = not yet finished (i.e. still CREATED or ONGOING). Ignored when a
  // specific `status` filter is already provided since that's more specific.
  if (onlyActive && !status) { whereClauses.push("t.status IN ('CREATED', 'ONGOING')"); }
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
    SELECT ${LIST_COLUMNS}, COUNT(*) OVER()::int AS "totalItems"
    FROM trips t
    ${joinSql}
    ${whereSql}
    ORDER BY t.created_at DESC${limitSql}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM trips t ${joinSql} ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

// Status counts across ALL trips matching the given (non-status) filters —
// i.e. ignores pagination and the `status` filter itself, so the UI can
// show "Ongoing: 4, Created: 2, Completed: 10, Cancelled: 1" tabs/badges
// alongside a status-filtered, paginated list.
const STATUSES = ['CREATED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

async function getStatusCounts({
  plateNumber, id, tripName,
} = {}) {
  const values = [];
  const whereClauses = [];
  const joinSql = 'JOIN trip_planning tp ON tp.trip_planning_id = t.trip_planning_id';
  if (plateNumber) { values.push(`%${plateNumber}%`); whereClauses.push(`tp.plate_number ILIKE $${values.length}`); }
  if (id) { values.push(id); whereClauses.push(`t.trip_id = $${values.length}`); }
  if (tripName) { values.push(`%${tripName}%`); whereClauses.push(`t.trip_name ILIKE $${values.length}`); }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT t.status, COUNT(*)::int AS count
    FROM trips t
    ${joinSql}
    ${whereSql}
    GROUP BY t.status
  `;
  const result = await pool.query(query, values);

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  let total = 0;
  result.rows.forEach((row) => {
    counts[row.status] = row.count;
    total += row.count;
  });

  return {
    total,
    created: counts.CREATED,
    ongoing: counts.ONGOING,
    completed: counts.COMPLETED,
    cancelled: counts.CANCELLED,
  };
}

const DEFAULT_NOTIFICATIONS = {
  deviation_alert: true,
  delay_alert: true,
  stoppage_alert: false,
  gps_offline_alert: true,
  // Added per your decision: DESTINATION_REACHED and EMERGENCY are now
  // toggleable the same as the other four. Note this only controls
  // whether the ALERT row/notification is raised — reaching the
  // destination still auto-completes the trip either way (that's trip

  destination_alert: true,
  emergency_alert: true,
};

async function insertTrip({
  tripPlanningId, routeId, tripName, hubIds, notifications, createdBy,
}) {
  const query = `
    INSERT INTO trips (trip_planning_id, route_id, trip_name, hub_ids, notifications, status, created_by)
    VALUES ($1, $2, $3, $4, $5, 'CREATED', $6)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [
    tripPlanningId, routeId, tripName || null, hubIds || [],
    JSON.stringify({ ...DEFAULT_NOTIFICATIONS, ...(notifications || {}) }),
    createdBy,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}


async function updateRoute(id, routeId, {
  hubIds, notifications, updatedBy,
} = {}) {
  const query = `
    UPDATE trips SET
      route_id = $2,
      hub_ids = $3,
      notifications = CASE WHEN $5::jsonb IS NULL THEN notifications ELSE notifications || $5::jsonb END,
      updated_at = NOW(),
      updated_by = $4
    WHERE trip_id = $1 AND status = 'CREATED'
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [
    id, routeId, hubIds || [], updatedBy,
    notifications ? JSON.stringify(notifications) : null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function start(id) {
  const query = `
    UPDATE trips SET status = 'ONGOING', started_at = NOW(), updated_at = NOW()
    WHERE trip_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function complete(id) {
  const query = `
    UPDATE trips SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
    WHERE trip_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function cancel(id, { cancelledBy, cancellationReason }) {
  const query = `
    UPDATE trips SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = $2,
      cancellation_reason = $3, updated_at = NOW()
    WHERE trip_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, cancelledBy, cancellationReason]);
  return result.rows[0];
}


async function updateCurrentLocation(id, coordinates) {
  const query = `
    UPDATE trips SET curr_coords = $2, updated_at = NOW()
    WHERE trip_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, coordinates]);
  return result.rows[0];
}

module.exports = {
  getStatusCounts,
  findById, findDetailedById, findTrackingContext, findOngoingByGpsDeviceNo, findStaleOngoing, list, insertTrip, updateRoute, start, complete, cancel, updateCurrentLocation, DEFAULT_NOTIFICATIONS,
};
