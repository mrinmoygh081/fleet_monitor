const googleConfig = require('../../config/routeProviders/google.config');

async function generateRoutes({ sourceCoordinates, destinationCoordinates, hubs }) {
  const url = new URL(googleConfig.directionsUrl);
  url.searchParams.set('origin', `${sourceCoordinates.lat},${sourceCoordinates.lng}`);
  url.searchParams.set('destination', `${destinationCoordinates.lat},${destinationCoordinates.lng}`);
  const waypoints = (hubs || []).map((h) => `${h.lat},${h.lng}`).join('|');
  if (waypoints) url.searchParams.set('waypoints', waypoints);
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('key', googleConfig.apiKey);

  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== 'OK' || !Array.isArray(data.routes)) return [];

  return data.routes.map((r, i) => {
    const distanceMeters = r.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const durationSeconds = r.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
    return {
      routeLabel: i === 0 ? 'RECOMMENDED' : `ALTERNATE_${i}`,
      routeGeometry: { type: 'encoded_polyline', points: r.overview_polyline?.points || null },
      distanceMeters,
      durationSeconds,
      provider: 'GOOGLE',
    };
  });
}

module.exports = { name: 'GOOGLE', generateRoutes, isConfigured: () => googleConfig.isConfigured };
