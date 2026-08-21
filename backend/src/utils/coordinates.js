
function toCoordinates(lat, lng) {
  return { lat: Number(lat), lng: Number(lng) };
}

function isValidCoordinates(value) {
  return (
    value &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    value.lat >= -90 && value.lat <= 90 &&
    value.lng >= -180 && value.lng <= 180
  );
}


function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}





const DEFAULT_TOLERANCE_METERS = 75;
function isSameLocation(a, b, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return false;
  return distanceKm(a, b) * 1000 <= toleranceMeters;
}

function boundingBox(point, toleranceMeters = DEFAULT_TOLERANCE_METERS) {
  const deg = (toleranceMeters / 1000 / 111) * 2; 
  return {
    minLat: point.lat - deg,
    maxLat: point.lat + deg,
    minLng: point.lng - deg,
    maxLng: point.lng + deg,
  };
}


function toJsonb(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}






function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 1;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}










function extractPolylinePoints(geometry) {
  if (!geometry) return [];
  let raw = geometry;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }

  
  if (typeof raw.points === 'string') {
    return decodePolyline(raw.points);
  }

  let coordArrays = [];
  if (Array.isArray(raw)) {
    coordArrays = [raw];
    } else if (raw.type === 'MultiLineString' && Array.isArray(raw.coordinates)) {
    coordArrays = raw.coordinates;
  } else if (Array.isArray(raw.coordinates)) {
    coordArrays = [raw.coordinates];
  } else if (Array.isArray(raw.points)) {
    coordArrays = [raw.points];
  }

  const points = [];
  for (const arr of coordArrays) {
    for (const p of arr) {
      if (p && typeof p === 'object' && !Array.isArray(p) && typeof p.lat === 'number' && typeof p.lng === 'number') {
        points.push({ lat: p.lat, lng: p.lng });
      } else if (Array.isArray(p) && p.length >= 2) {
        
        
        const [a, b] = p;
        if (Math.abs(a) <= 90 && Math.abs(b) > 90) points.push({ lat: a, lng: b });
        else points.push({ lat: b, lng: a });
      }
    }
  }
  return points;
}




function pointToPolylineDistanceMeters(point, geometry) {
  const pts = extractPolylinePoints(geometry);
  if (!pts.length) return null;
  if (pts.length === 1) return distanceKm(point, pts[0]) * 1000;

  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distanceToSegmentMeters(point, pts[i], pts[i + 1]);
    if (d < min) min = d;
  }
  return min;
}




function distanceToSegmentMeters(p, a, b) {
  const toXY = (pt, origin) => {
    const R = 6371000;
    const x = ((pt.lng - origin.lng) * Math.PI / 180) * R * Math.cos((origin.lat * Math.PI) / 180);
    const y = ((pt.lat - origin.lat) * Math.PI / 180) * R;
    return { x, y };
  };
  const origin = a;
  const A = toXY(a, origin);
  const B = toXY(b, origin);
  const P = toXY(p, origin);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = A.x + t * dx;
  const projY = A.y + t * dy;
  return Math.sqrt((P.x - projX) ** 2 + (P.y - projY) ** 2);
}








function projectPointOntoPolyline(point, geometry) {
  const pts = extractPolylinePoints(geometry);
  if (pts.length < 2) return null;

  let cumulative = 0;
  let best = { perpDistanceMeters: Infinity, distanceAlongMeters: 0 };
  for (let i = 0; i < pts.length - 1; i += 1) {
    const segStart = pts[i];
    const segEnd = pts[i + 1];
    const segLengthMeters = distanceKm(segStart, segEnd) * 1000;
    const { distanceMeters: perp, t } = projectOntoSegmentMeters(point, segStart, segEnd);
    if (perp < best.perpDistanceMeters) {
      best = { perpDistanceMeters: perp, distanceAlongMeters: cumulative + t * segLengthMeters };
    }
    cumulative += segLengthMeters;
  }
  return { ...best, totalLengthMeters: cumulative };
}

function projectOntoSegmentMeters(p, a, b) {
  const toXY = (pt, origin) => {
    const R = 6371000;
    const x = ((pt.lng - origin.lng) * Math.PI / 180) * R * Math.cos((origin.lat * Math.PI) / 180);
    const y = ((pt.lat - origin.lat) * Math.PI / 180) * R;
    return { x, y };
  };
  const origin = a;
  const A = toXY(a, origin);
  const B = toXY(b, origin);
  const P = toXY(p, origin);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = A.x + t * dx;
  const projY = A.y + t * dy;
  const distanceMeters = Math.sqrt((P.x - projX) ** 2 + (P.y - projY) ** 2);
  return { distanceMeters, t };
}

module.exports = {
  toCoordinates, isValidCoordinates, distanceKm, isSameLocation, boundingBox, DEFAULT_TOLERANCE_METERS,
  toJsonb, decodePolyline, extractPolylinePoints, pointToPolylineDistanceMeters, projectPointOntoPolyline,
};