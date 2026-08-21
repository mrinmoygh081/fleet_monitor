const { pool } = require('../config/db');



const SELECT_COLUMNS = `
  vehicle_id AS "id", plate_number AS "plateNumber", vehicle_type AS "vehicleType", capacity_kg AS "capacityKg",
  fuel_type AS "fuelType", gps_device AS "gpsDevice", gps_device_no AS "gpsDeviceNo",
  current_status AS "currentStatus",
  created_at AS "createdAt", created_by AS "createdBy", updated_at AS "updatedAt", updated_by AS "updatedBy",
  cancelled_at AS "cancelledAt", cancelled_by AS "cancelledBy"
`;









async function list({
  status, vehicleType, search, limit, offset,
} = {}) {
  const values = [];
  let whereSql = 'WHERE cancelled_at IS NULL';
  if (status) {
    values.push(status);
    whereSql += ` AND current_status = $${values.length}`;
  }
  if (vehicleType) {
    values.push(vehicleType);
    whereSql += ` AND vehicle_type = $${values.length}`;
  }
  if (search) {
    values.push(`%${search}%`);
    whereSql += ` AND (plate_number ILIKE $${values.length} OR gps_device_no ILIKE $${values.length} OR gps_device ILIKE $${values.length})`;
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
    FROM vehicles ${whereSql} ORDER BY created_at DESC${limitSql}
  `;
  const result = await pool.query(query, listValues);

  if (result.rows.length === 0 && limit !== undefined) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM vehicles ${whereSql}`, values);
    return { rows: [], totalItems: countResult.rows[0].count };
  }

  const totalItems = limit !== undefined ? (result.rows[0]?.totalItems ?? 0) : result.rows.length;
  const rows = result.rows.map(({ totalItems: _drop, ...rest }) => rest);
  return { rows, totalItems };
}

async function findById(id) {
  const query = `SELECT ${SELECT_COLUMNS} FROM vehicles WHERE vehicle_id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

// This is how trip_planning / trips resolve "which vehicle" -- every other
// table links to a vehicle by plate_number, never a copied vehicle id.
async function findByPlateNumber(plateNumber) {
  const query = `SELECT ${SELECT_COLUMNS} FROM vehicles WHERE plate_number = $1`;
  const result = await pool.query(query, [plateNumber]);
  return result.rows[0] || null;
}

// Resolves an inbound GPS ping's device id back to its vehicle.
async function findByGpsDeviceNo(gpsDeviceNo) {
  const query = `SELECT ${SELECT_COLUMNS} FROM vehicles WHERE gps_device_no = $1`;
  const result = await pool.query(query, [gpsDeviceNo]);
  return result.rows[0] || null;
}

async function create({
  plateNumber, vehicleType, capacityKg, fuelType, gpsDevice, gpsDeviceNo, createdBy,
}) {
  const query = `
    INSERT INTO vehicles
      (plate_number, vehicle_type, capacity_kg, fuel_type, gps_device, gps_device_no, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [plateNumber, vehicleType, capacityKg, fuelType, gpsDevice, gpsDeviceNo, createdBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function update(id, {
  plateNumber, vehicleType, capacityKg, fuelType, gpsDevice, gpsDeviceNo, currentStatus, updatedBy,
}) {
  const query = `
    UPDATE vehicles SET
      plate_number = COALESCE($2, plate_number),
      vehicle_type = COALESCE($3, vehicle_type),
      capacity_kg = COALESCE($4, capacity_kg),
      fuel_type = COALESCE($5, fuel_type),
      gps_device = COALESCE($6, gps_device),
      gps_device_no = COALESCE($7, gps_device_no),
      current_status = COALESCE($8, current_status),
      updated_at = NOW(),
      updated_by = $9
    WHERE vehicle_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const values = [id, plateNumber, vehicleType, capacityKg, fuelType, gpsDevice, gpsDeviceNo, currentStatus, updatedBy];
  const result = await pool.query(query, values);
  return result.rows[0];
}


async function cancel(id, cancelledBy) {
  const query = `
    UPDATE vehicles SET cancelled_at = NOW(), cancelled_by = $2
    WHERE vehicle_id = $1
    RETURNING ${SELECT_COLUMNS}
  `;
  const result = await pool.query(query, [id, cancelledBy]);
  return result.rows[0];
}

module.exports = { list, findById, findByPlateNumber, findByGpsDeviceNo, create, update, cancel };
