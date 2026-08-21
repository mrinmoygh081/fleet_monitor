const crypto = require('crypto');



const OTP_TTL_MS = 5 * 60 * 1000; 
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000; 

const store = new Map(); 

function cleanupExpired() {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(token);
  }
}
setInterval(cleanupExpired, 60 * 1000).unref();

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}


function createOtpChallenge(email, userPayload) {
  const otp = generateOtpCode();
  const otpToken = crypto.randomBytes(24).toString('hex');
  store.set(otpToken, {
    email,
    otpHash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
    userPayload,
  });
  return { otpToken, otp };
}

function verifyOtpChallenge(otpToken, otp) {
  const entry = store.get(otpToken);
  if (!entry) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (entry.expiresAt < Date.now()) {
    store.delete(otpToken);
    return { ok: false, reason: 'EXPIRED' };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(otpToken);
    return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  const isMatch = entry.otpHash === hashOtp(String(otp || '').trim());
  if (!isMatch) {
    entry.attempts += 1;
    return { ok: false, reason: 'INVALID', attemptsRemaining: MAX_ATTEMPTS - entry.attempts };
  }

  store.delete(otpToken); 
  return { ok: true, email: entry.email, userPayload: entry.userPayload };
}


function resendOtpChallenge(otpToken) {
  const entry = store.get(otpToken);
  if (!entry) return { ok: false, reason: 'EXPIRED' };
  if (entry.expiresAt < Date.now()) {
    store.delete(otpToken);
    return { ok: false, reason: 'EXPIRED' };
  }
  const sinceLast = Date.now() - entry.lastSentAt;
  if (sinceLast < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'COOLDOWN', retryAfterMs: RESEND_COOLDOWN_MS - sinceLast };
  }

  const otp = generateOtpCode();
  entry.otpHash = hashOtp(otp);
  entry.expiresAt = Date.now() + OTP_TTL_MS;
  entry.attempts = 0;
  entry.lastSentAt = Date.now();
  return { ok: true, email: entry.email, otp };
}

module.exports = { createOtpChallenge, verifyOtpChallenge, resendOtpChallenge };
