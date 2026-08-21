const {
  PLACES_PROVIDER, MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET, GOOGLE_PLACES_API_KEY,
  OSM_NOMINATIM_BASE_URL, OSM_NOMINATIM_USER_AGENT,
} = require('../config/env');
const Place = require('../models/Place');






const INDIA_BOUNDS = { minLat: 6.0, maxLat: 37.6, minLng: 68.0, maxLng: 97.5 };
function withinIndia(coordinates) {
  return coordinates
    && coordinates.lat >= INDIA_BOUNDS.minLat && coordinates.lat <= INDIA_BOUNDS.maxLat
    && coordinates.lng >= INDIA_BOUNDS.minLng && coordinates.lng <= INDIA_BOUNDS.maxLng;
}


async function fetchWithTimeout(url, { timeout = 8000, ...options } = {}) {
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


async function searchViaOsm(queryText) {
  const url = new URL(`${OSM_NOMINATIM_BASE_URL}/search`);
  url.search = new URLSearchParams({
    q: queryText,
    countrycodes: 'in',
    format: 'jsonv2',
    addressdetails: 1,
    limit: 10,
  }).toString();

  const response = await fetchWithTimeout(url, {
    headers: {
      
      
      'User-Agent': OSM_NOMINATIM_USER_AGENT,
      Accept: 'application/json',
    },
  });
  const data = await response.json();

  return (data || [])
    .map((r) => ({
      placeName: r.display_name?.split(',')[0]?.trim() || r.display_name,
      address: r.display_name,
      coordinates: { lat: Number(r.lat), lng: Number(r.lon) },
      placeType: mapOsmTypeToPlaceType(r.type, r.class),
      provider: 'OSM',
    }))
    .filter((r) => withinIndia(r.coordinates));
}

function mapOsmTypeToPlaceType(type, osmClass) {
  const t = (type || '').toLowerCase();
  const c = (osmClass || '').toLowerCase();
  if (t.includes('fuel')) return 'FUEL_STATION';
  if (c === 'amenity' && (t.includes('restaurant') || t.includes('cafe') || t.includes('food'))) return 'RESTAURANT';
  if (t.includes('hospital') || t.includes('clinic')) return 'HOSPITAL';
  if (c === 'shop' || t.includes('service')) return 'SERVICE_CENTRE';
  if (c === 'place' || c === 'boundary') return 'CITY';
  return 'OTHER';
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
  const data = await response.json();
  const { access_token: token, expires_in: expiresIn } = data;
  mapplsTokenCache = { token, expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000 };
  return token;
}

async function searchViaMappls(queryText) {
  const token = await getMapplsAccessToken();
  const url = new URL('https://atlas.mappls.com/api/places/search/json');
  url.search = new URLSearchParams({ query: queryText, region: 'IND' }).toString();

  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  return (data?.suggestedLocations || [])
    .map((r) => ({
      placeName: r.placeName || r.placeAddress,
      address: r.placeAddress,
      coordinates: { lat: Number(r.latitude), lng: Number(r.longitude) },
      placeType: 'OTHER',
      provider: 'MAPPLS',
    }))
    .filter((r) => withinIndia(r.coordinates) && Number.isFinite(r.coordinates.lat) && Number.isFinite(r.coordinates.lng));
}



async function searchViaGoogle(queryText) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.search = new URLSearchParams({
    query: queryText,
    region: 'in',
    components: 'country:in',
    key: GOOGLE_PLACES_API_KEY,
  }).toString();

  const response = await fetchWithTimeout(url);
  const data = await response.json();

  return (data?.results || [])
    .map((r) => ({
      placeName: r.name,
      address: r.formatted_address,
      coordinates: { lat: r.geometry?.location?.lat, lng: r.geometry?.location?.lng },
      placeType: 'OTHER',
      provider: 'GOOGLE',
    }))
    .filter((r) => withinIndia(r.coordinates));
}

async function searchExternal(queryText) {
  try {
    if (PLACES_PROVIDER === 'MAPPLS' && MAPPLS_CLIENT_ID && MAPPLS_CLIENT_SECRET) {
      const results = await searchViaMappls(queryText);
      if (results.length) return results;
    } else if (PLACES_PROVIDER === 'GOOGLE' && GOOGLE_PLACES_API_KEY) {
      const results = await searchViaGoogle(queryText);
      if (results.length) return results;
    }
  } catch (err) {
    console.warn(`[placeProviderService] ${PLACES_PROVIDER} search failed, falling back to OSM:`, err.message);
  }

  
  
  try {
    return await searchViaOsm(queryText);
  } catch (err) {
    console.error('[placeProviderService] OSM search failed:', err.message);
    return [];
  }
}






async function reverseGeocodeViaOsm(coordinates) {
  const url = new URL(`${OSM_NOMINATIM_BASE_URL}/reverse`);
  url.search = new URLSearchParams({
    lat: String(coordinates.lat),
    lon: String(coordinates.lng),
    format: 'jsonv2',
    addressdetails: 1,
    zoom: 12,
  }).toString();

  const response = await fetchWithTimeout(url, {
    headers: { 'User-Agent': OSM_NOMINATIM_USER_AGENT, Accept: 'application/json' },
  });
  const data = await response.json();
  if (!data || data.error) return null;

  const a = data.address || {};
  const placeName = data.name
    || a.town || a.city || a.municipality || a.suburb || a.village
    || a.amenity || a.shop || a.building || a.road
    || data.display_name?.split(',')[0]?.trim();

  if (!placeName) return null;
  return {
    placeName,
    address: data.display_name,
    placeType: mapOsmTypeToPlaceType(data.type, data.class),
    provider: 'OSM',
  };
}

async function reverseGeocodeViaMappls(coordinates) {
  const token = await getMapplsAccessToken();
  const url = new URL('https://atlas.mappls.com/api/places/reverse-geocode/json');
  url.search = new URLSearchParams({ lat: String(coordinates.lat), lng: String(coordinates.lng) }).toString();

  const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  const result = data?.results?.[0];
  if (!result) return null;

  return {
    placeName: result.poi || result.formatted_address?.split(',')[0]?.trim() || result.locality,
    address: result.formatted_address,
    placeType: 'OTHER',
    provider: 'MAPPLS',
  };
}

async function reverseGeocode(coordinates) {
  if (!withinIndia(coordinates)) return null;

  try {
    if (PLACES_PROVIDER === 'MAPPLS' && MAPPLS_CLIENT_ID && MAPPLS_CLIENT_SECRET) {
      const result = await reverseGeocodeViaMappls(coordinates);
      if (result) return result;
    }
  } catch (err) {
    console.warn('[placeProviderService] Mappls reverse geocode failed, falling back to OSM:', err.message);
  }

  try {
    return await reverseGeocodeViaOsm(coordinates);
  } catch (err) {
    console.error('[placeProviderService] OSM reverse geocode failed:', err.message);
    return null;
  }
}

async function searchAndImport(queryText, actorId, { placeType } = {}) {
  const local = await Place.search(queryText, { placeType });
  if (local.length) return local;

  const externalResults = await searchExternal(queryText);
  const imported = [];
  for (const r of externalResults) {
    const place = await Place.findOrCreate({
      placeName: r.placeName,
      coordinates: r.coordinates,
      placeType: placeType || r.placeType,
      createdBy: actorId,
    }, 75);
    imported.push(place);
  }
  return imported;
}

module.exports = { searchExternal, searchAndImport, reverseGeocode };
