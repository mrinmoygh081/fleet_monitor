const osrmConfig = require('../../config/routeProviders/osrm.config');

async function generateRoutes({ sourceCoordinates, destinationCoordinates, hubs }) {
  const points = [sourceCoordinates, ...(hubs || []), destinationCoordinates];
  const coordsPath = points.map((p) => `${p.lng},${p.lat}`).join(';');

  const url = `${osrmConfig.baseUrl}/${coordsPath}?alternatives=true&overview=full&geometries=geojson`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`OSRM request failed: ${response.status}`);
  const data = await response.json();

  if (data.code !== 'Ok' || !Array.isArray(data.routes)) return [];

  return data.routes.map((r, i) => ({
    routeLabel: i === 0 ? 'RECOMMENDED' : `ALTERNATE_${i}`,
    routeGeometry: r.geometry,
    distanceMeters: Math.round(r.distance),
    durationSeconds: Math.round(r.duration),
    provider: 'OSRM',
  }));
}

module.exports = { name: 'OSRM', generateRoutes, isConfigured: () => osrmConfig.isConfigured };
