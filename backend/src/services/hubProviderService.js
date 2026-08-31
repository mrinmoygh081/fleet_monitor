const {
  HUB_PROVIDER, MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET, OVERPASS_BASE_URL,
} = require('../config/env');
const { extractPolylinePoints, distanceKm } = require('../utils/coordinates');

async function fetchWithTimeout(url, { timeout = 12000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        
        
        
        
        
        'User-Agent': 'TechnoconFleetBackend/1.0 (+hub-discovery)',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
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






async function safeJson(response) {
  const text = await response.text();
  if (!text) throw new Error(`Empty response body from ${response.url}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${response.url}: ${text.slice(0, 200)}`);
  }
}




function sampleRoutePoints(points, targetSpacingKm = 15, maxSamples = 8) {
  if (!points.length) return [];
  if (points.length === 1) return points;

  const samples = [points[0]];
  let lastSample = points[0];
  for (let i = 1; i < points.length; i += 1) {
    if (distanceKm(lastSample, points[i]) >= targetSpacingKm) {
      samples.push(points[i]);
      lastSample = points[i];
      if (samples.length >= maxSamples - 1) break;
    }
  }
  const last = points[points.length - 1];
  if (samples[samples.length - 1] !== last) samples.push(last);
  return samples;
}

const OVERPASS_TAGS = [
  ['amenity', 'fuel', 'FUEL_STATION'],
  ['amenity', 'restaurant', 'RESTAURANT'],
  ['amenity', 'cafe', 'RESTAURANT'],
  ['amenity', 'hospital', 'HOSPITAL'],
  ['highway', 'rest_area', 'REST_AREA'],
  ['highway', 'services', 'REST_AREA'],
  ['shop', 'car_repair', 'SERVICE_CENTRE'],
];

function buildOverpassQuery(samplePoints, radiusMeters) {
  const clauses = samplePoints.flatMap((p) => OVERPASS_TAGS.map(
    ([key, value]) => `node["${key}"="${value}"](around:${radiusMeters},${p.lat},${p.lng});`,
  )).join('\n');
  return `[out:json][timeout:20];(\n${clauses}\n);out center 60;`;
}

function mapOverpassTag(tags = {}) {
  if (tags.amenity === 'fuel') return 'FUEL_STATION';
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'RESTAURANT';
  if (tags.amenity === 'hospital') return 'HOSPITAL';
  if (tags.highway === 'rest_area' || tags.highway === 'services') return 'REST_AREA';
  if (tags.shop === 'car_repair') return 'SERVICE_CENTRE';
  return 'OTHER';
}

async function discoverViaOverpass(routeGeometry) {
  const points = extractPolylinePoints(routeGeometry);
  if (!points.length) return [];

  const samplePoints = sampleRoutePoints(points);
  const query = buildOverpassQuery(samplePoints, 3000);

  const response = await fetchWithTimeout(OVERPASS_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
    timeout: 15000,
  });
  const data = await safeJson(response);

  const seen = new Set();
  const results = [];
  for (const el of data?.elements || []) {
    if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
    const key = `${el.lat.toFixed(4)},${el.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      placeName: el.tags?.name || mapOverpassTag(el.tags),
      address: el.tags?.['addr:full'] || null,
      coordinates: { lat: el.lat, lng: el.lon },
      placeType: mapOverpassTag(el.tags),
      provider: 'OSM',
    });
  }
  return results;
}



let mapplsTokenCache = { token: null, expiresAt: 0 };
async function getMapplsAccessToken() {
  if (mapplsTokenCache.token && mapplsTokenCache.expiresAt > Date.now() + 30000) {
    return mapplsTokenCache.token;
  }
  const response = await fetchWithTimeout('https://outpost.mappls.com/api/security/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: MAPPLS_CLIENT_ID,
      client_secret: MAPPLS_CLIENT_SECRET,
    }),
    timeout: 8000,
  });
  const data = await safeJson(response);
  const { access_token: token, expires_in: expiresIn } = data;
  mapplsTokenCache = { token, expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000 };
  return token;
}






async function discoverViaMappls(routeGeometry) {
  const points = extractPolylinePoints(routeGeometry);
  if (!points.length) return [];
  const samplePoints = sampleRoutePoints(points);
  const token = await getMapplsAccessToken();

  const perPointResults = await Promise.all(samplePoints.map(async (p) => {
    const url = new URL('https://atlas.mappls.com/api/places/nearby/json');
    url.search = new URLSearchParams({
      keywords: 'fuel,restaurant,hospital,rest area',
      refLocation: `${p.lat},${p.lng}`,
      radius: '3000',
    }).toString();
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await safeJson(response);
    return (data?.suggestedLocations || []).map((r) => ({
      placeName: r.placeName || r.placeAddress,
      address: r.placeAddress,
      coordinates: { lat: Number(r.latitude), lng: Number(r.longitude) },
      placeType: 'OTHER',
      provider: 'MAPPLS',
    }));
  }));

  return perPointResults.flat();
}

async function discoverHubsAlongRoute(routeGeometry) {
  const points = extractPolylinePoints(routeGeometry);
  if (!points.length) {
    console.warn('[hubProviderService] routeGeometry produced 0 points — nothing to search around. Check Route.routeGeometry shape for this route.');
    return [];
  }

  if (HUB_PROVIDER === 'MAPPLS') {
    if (!MAPPLS_CLIENT_ID || !MAPPLS_CLIENT_SECRET) {
      console.warn('[hubProviderService] HUB_PROVIDER=MAPPLS but MAPPLS_CLIENT_ID/MAPPLS_CLIENT_SECRET are not set — skipping straight to Overpass.');
    } else {
      try {
        const results = await discoverViaMappls(routeGeometry);
        if (results.length) return results;
        console.warn('[hubProviderService] Mappls returned 0 suggestedLocations for this route — falling back to Overpass.');
      } catch (err) {
        console.warn('[hubProviderService] MAPPLS discovery failed, falling back to OSM Overpass:', err.message);
      }
    }
  }

  try {
    const results = await discoverViaOverpass(routeGeometry);
    if (!results.length) {
      console.warn('[hubProviderService] Overpass returned 0 elements for', points.length, 'route points. Either no matching amenities within radius, or the request itself failed silently — check network egress to', OVERPASS_BASE_URL, 'from this server (try: curl -s -X POST ' + OVERPASS_BASE_URL + ' --data-urlencode "data=[out:json];node(1);out;").');
    }
    return results;
  } catch (err) {
    console.error('[hubProviderService] Overpass discovery failed:', err.message);
    return [];
  }
}

module.exports = { discoverHubsAlongRoute };