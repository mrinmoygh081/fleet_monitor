const mapplsConfig = require('../../config/routeProviders/mappls.config');

let tokenCache = { token: null, expiresAt: 0 };
async function getAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 30000) {
    return tokenCache.token;
  }
  const response = await fetch(mapplsConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: mapplsConfig.clientId,
      client_secret: mapplsConfig.clientSecret,
    }),
  });
  const data = await response.json();
  const { access_token: token, expires_in: expiresIn } = data;
  tokenCache = { token, expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000 };
  return token;
}

async function generateRoutes({ sourceCoordinates, destinationCoordinates, hubs }) {
  const token = await getAccessToken();

  const points = [sourceCoordinates, ...(hubs || []), destinationCoordinates];
  const coordsPath = points.map((p) => `${p.lng},${p.lat}`).join(';');

  const url = `${mapplsConfig.routeUrlBase}/${token}/route_adv/driving/${coordsPath}`
    + `?alternatives=true&geometries=geojson&overview=full`;

  const response = await fetch(url);
  const data = await response.json();
  if (!Array.isArray(data.routes)) return [];

  return data.routes.map((r, i) => ({
    routeLabel: i === 0 ? 'RECOMMENDED' : `ALTERNATE_${i}`,
    routeGeometry: r.geometry,
    distanceMeters: Math.round(r.distance),
    durationSeconds: Math.round(r.duration),
    provider: 'MAPPLS',
  }));
}

module.exports = { name: 'MAPPLS', generateRoutes, isConfigured: () => mapplsConfig.isConfigured };
