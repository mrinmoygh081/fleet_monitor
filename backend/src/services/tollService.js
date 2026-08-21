const { TOLL_PROVIDER, TOLLGURU_API_KEY, OVERPASS_BASE_URL } = require('../config/env');
const { extractPolylinePoints } = require('../utils/coordinates');

async function fetchWithTimeout(url, { timeout = 12000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const err = new Error(`Request failed with status ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function estimateViaTollGuru({ routeGeometry, vehicleType }) {
  const points = extractPolylinePoints(routeGeometry);
  if (points.length < 2) return { totalTollCost: null, tolls: [] };

  const response = await fetchWithTimeout('https://apis.tollguru.com/toll/v2/origin-destination-waypoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': TOLLGURU_API_KEY },
    body: JSON.stringify({
      from: { lat: points[0].lat, lng: points[0].lng },
      to: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
      vehicleType: vehicleType || '2AxlesAuto',
    }),
    timeout: 15000,
  });
  const data = await response.json();
  const route = data?.route;
  if (!route) return { totalTollCost: null, tolls: [] };

  return {
    totalTollCost: route.costs?.total ?? null,
    tolls: (route.tolls || []).map((t) => ({
      name: t.name,
      coordinates: { lat: t.lat, lng: t.lng },
      cost: t.tagCost ?? t.cashCost ?? null,
      provider: 'TOLLGURU',
    })),
  };
}



async function estimateViaOverpass(routeGeometry) {
  const points = extractPolylinePoints(routeGeometry);
  if (!points.length) return { totalTollCost: null, tolls: [] };

  
  
  const step = Math.max(1, Math.floor(points.length / 8));
  const samplePoints = points.filter((_, i) => i % step === 0).slice(0, 8);

  const clauses = samplePoints.map(
    (p) => `node["barrier"="toll_booth"](around:2000,${p.lat},${p.lng});\nway["highway"="toll_gantry"](around:2000,${p.lat},${p.lng});`,
  ).join('\n');
  const query = `[out:json][timeout:20];(\n${clauses}\n);out center 30;`;

  const response = await fetchWithTimeout(OVERPASS_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
    timeout: 15000,
  });
  const data = await response.json();

  const seen = new Set();
  const tolls = [];
  for (const el of data?.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tolls.push({
      name: el.tags?.name || 'Toll Plaza',
      coordinates: { lat, lng },
      cost: null,
      provider: 'OSM',
    });
  }
  return { totalTollCost: null, tolls };
}

async function estimateToll({ routeGeometry, vehicleType }) {
  try {
    if (TOLL_PROVIDER === 'TOLLGURU' && TOLLGURU_API_KEY) {
      const result = await estimateViaTollGuru({ routeGeometry, vehicleType });
      if (result.tolls.length || result.totalTollCost != null) return result;
    }
  } catch (err) {
    console.warn('[tollService] TollGuru estimation failed, falling back to OSM Overpass:', err.message);
  }

  try {
    return await estimateViaOverpass(routeGeometry);
  } catch (err) {
    console.error('[tollService] Overpass toll lookup failed:', err.message);
    return { totalTollCost: null, tolls: [] };
  }
}

module.exports = { estimateToll };