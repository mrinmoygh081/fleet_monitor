const crypto = require('crypto');



const CAPTCHA_TTL_MS = 5 * 60 * 1000; 
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; 

const store = new Map(); 

function cleanupExpired() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(id);
  }
}
setInterval(cleanupExpired, 60 * 1000).unref();

function randomText(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARS[crypto.randomInt(0, CHARS.length)];
  }
  return out;
}

const PALETTE = ['#2f6fd6', '#1c3f73', '#5a8bd6', '#3457a0', '#7fa3e0', '#274b8c'];

function buildSvg(text) {
  const width = 180;
  const height = 60;
  const glyphWidth = width / text.length;

  let glyphs = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const x = glyphWidth * i + glyphWidth / 2 + (crypto.randomInt(-4, 5));
    const y = height / 2 + crypto.randomInt(-6, 7) + 8;
    const rotate = crypto.randomInt(-28, 29);
    const color = PALETTE[crypto.randomInt(0, PALETTE.length)];
    const fontSize = 26 + crypto.randomInt(-3, 4);
    glyphs += `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="Verdana, Arial, sans-serif" font-weight="700" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${escapeXml(char)}</text>`;
  }

  // Noise lines
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    const color = PALETTE[crypto.randomInt(0, PALETTE.length)];
    lines += `<path d="M${x1} ${y1} Q ${width / 2} ${crypto.randomInt(0, height)} ${x2} ${y2}" stroke="${color}" stroke-width="1.2" fill="none" opacity="0.45"/>`;
  }

  // Noise dots
  let dots = '';
  for (let i = 0; i < 25; i++) {
    const cx = crypto.randomInt(0, width);
    const cy = crypto.randomInt(0, height);
    const color = PALETTE[crypto.randomInt(0, PALETTE.length)];
    dots += `<circle cx="${cx}" cy="${cy}" r="1" fill="${color}" opacity="0.5"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="captcha">
    <rect width="100%" height="100%" fill="#eef3fb"/>
    ${lines}
    ${dots}
    ${glyphs}
  </svg>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Creates a new captcha, stores its answer server-side, and returns the
 * SVG markup + the id the client must send back alongside the user's
 * typed answer.
 */
function generateCaptcha() {
  const text = randomText(5);
  const captchaId = crypto.randomBytes(16).toString('hex');
  store.set(captchaId, { text, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { captchaId, svg: buildSvg(text) };
}


function verifyCaptcha(captchaId, text) {
  if (!captchaId || !text) return false;
  const entry = store.get(captchaId);
  store.delete(captchaId);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) return false;
  return entry.text.toLowerCase() === String(text).trim().toLowerCase();
}

module.exports = { generateCaptcha, verifyCaptcha };
