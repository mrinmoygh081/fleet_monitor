const ExcelJS = require('exceljs');
const Vehicle = require('../models/Vehicle');
const Place = require('../models/Place');
const Hub = require('../models/Hub');
const { isValidCoordinates } = require('../utils/coordinates');

const ENTITY_CONFIG = {
  vehicles: {
    columns: ['plateNumber', 'vehicleType', 'capacityKg', 'fuelType', 'gpsDevice', 'gpsDeviceNo'],
    sample: [{ plateNumber: 'WB-01-AB-1234', vehicleType: 'TRUCK', capacityKg: 5000, fuelType: 'DIESEL', gpsDevice: 'Teltonika FMB920', gpsDeviceNo: 'GPS-0001' }],
    importRow: async (row, createdBy) => {
      if (!row.plateNumber) throw new Error('plateNumber is required.');
      return Vehicle.create({
        plateNumber: String(row.plateNumber).trim(),
        vehicleType: row.vehicleType ? String(row.vehicleType).trim() : null,
        capacityKg: row.capacityKg !== undefined && row.capacityKg !== '' ? Number(row.capacityKg) : null,
        fuelType: row.fuelType ? String(row.fuelType).trim() : null,
        gpsDevice: row.gpsDevice ? String(row.gpsDevice).trim() : null,
        gpsDeviceNo: row.gpsDeviceNo ? String(row.gpsDeviceNo).trim() : null,
        createdBy,
      });
    },
  },
  places: {
    columns: ['placeName', 'lat', 'lng', 'placeType'],
    sample: [{ placeName: 'Kolkata Central Warehouse', lat: 22.5726, lng: 88.3639, placeType: 'WAREHOUSE' }],
    importRow: async (row, createdBy) => {
      const coordinates = { lat: Number(row.lat), lng: Number(row.lng) };
      if (!row.placeName || !isValidCoordinates(coordinates)) {
        throw new Error('placeName, lat and lng are required.');
      }
      return Place.findOrCreate({
        placeName: String(row.placeName).trim(),
        coordinates,
        placeType: row.placeType ? String(row.placeType).trim() : undefined,
        createdBy,
      });
    },
  },
  hubs: {
    columns: ['name', 'type', 'lat', 'lng', 'radiusMeters'],
    sample: [{ name: 'Durgapur Highway Rest Stop', type: 'REST_AREA', lat: 23.5204, lng: 87.3119, radiusMeters: 300 }],
    importRow: async (row, createdBy) => {
      const coordinates = { lat: Number(row.lat), lng: Number(row.lng) };
      if (!row.name || !isValidCoordinates(coordinates)) {
        throw new Error('name, lat and lng are required.');
      }
      return Hub.findOrCreate({
        name: String(row.name).trim(),
        type: row.type ? String(row.type).trim() : undefined,
        coordinates,
        radiusMeters: row.radiusMeters !== undefined && row.radiusMeters !== '' ? Number(row.radiusMeters) : undefined,
        createdBy,
      });
    },
  },
};

function resolveEntity(req, res) {
  const entity = String(req.params.entity || '').toLowerCase();
  const config = ENTITY_CONFIG[entity];
  if (!config) {
    res.status(400).json({
      success: false,
      message: `Unsupported import entity "${entity}". Supported: ${Object.keys(ENTITY_CONFIG).join(', ')}.`,
      data: null,
      error: 'UNSUPPORTED_ENTITY',
    });
    return null;
  }
  return { entity, config };
}

async function sheetToRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let value = cell.value;
      if (value && typeof value === 'object' && 'text' in value) value = value.text;
      if (value && typeof value === 'object' && value instanceof Date) value = value.toISOString();
      obj[key] = value === null || value === undefined ? '' : value;
      if (obj[key] !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return rows;
}

async function importExcel(req, res, next) {
  try {
    const resolved = resolveEntity(req, res);
    if (!resolved) return;
    const { entity, config } = resolved;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'An excel file (field name "file") is required.',
        data: null,
        error: 'FILE_REQUIRED',
      });
    }

    const rows = await sheetToRows(req.file.buffer);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file has no data rows.',
        data: null,
        error: 'EMPTY_FILE',
      });
    }

    const results = { inserted: 0, failed: 0, errors: [] };
    for (let i = 0; i < rows.length; i += 1) {
      try {
        await config.importRow(rows[i], req.user?.id);
        results.inserted += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({ row: i + 2, message: err.message });
      }
    }

    res.json({
      success: true,
      message: 'Excel data imported successfully',
      data: {
        entity,
        totalRows: rows.length,
        inserted: results.inserted,
        failed: results.failed,
        errors: results.errors,
      },
      error: null,
    });
  } catch (err) { next(err); }
}

async function downloadSampleTemplate(req, res, next) {
  try {
    const resolved = resolveEntity(req, res);
    if (!resolved) return;
    const { entity, config } = resolved;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(entity);
    worksheet.columns = config.columns.map((key) => ({ header: key, key }));
    config.sample.forEach((row) => worksheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}-import-sample.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
}

module.exports = { importExcel, downloadSampleTemplate };
