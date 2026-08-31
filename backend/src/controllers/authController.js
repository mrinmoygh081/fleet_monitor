const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuthToken = require('../models/AuthToken');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordResetEmail, sendOtpEmail, sendUserWelcomeEmail } = require('../services/emailService');
const { generateCaptcha, verifyCaptcha } = require('../services/captchaService');
const { createOtpChallenge, verifyOtpChallenge, resendOtpChallenge } = require('../services/otpService');
const {
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN_DAYS,
  FRONTEND_URL,
  PASSWORD_RESET_TOKEN_EXPIRY_MIN,
} = require('../config/env');

const OTP_EXPIRY_MIN = 5;

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!user || !domain) return email;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(user.length - visible.length, 2))}@${domain}`;
}



function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isDefault: user.isDefault,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

function signAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}









async function issueRefreshToken(userId) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
  await AuthToken.create({ userId, tokenHash: hashToken(rawToken), expiresAt });
  return rawToken;
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}


async function getCaptcha(req, res, next) {
  try {
    const { captchaId, svg } = generateCaptcha();
    res.json({ success: true, captchaId, svg });
  } catch (err) {
    next(err);
  }
}


async function login(req, res, next) {
  try {
    const { email, password, captchaId, captchaText } = req.body;

    
    
    if (!verifyCaptcha(captchaId, captchaText)) {
      return res.status(400).json({ success: false, code: 'INVALID_CAPTCHA', message: 'Incorrect captcha. Please try again.' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    
    if (user.twoFactorEnabled === false) {
      const { accessToken, refreshToken } = await issueSession(user);
      return res.json({
        success: true,
        twoFactorEnabled: false,
        accessToken,
        refreshToken,
        user: serializeUser(user),
        message: 'Login successful.',
      });
    }

    const { otpToken, otp } = createOtpChallenge(user.email, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
    });

    
    
    
    
    
    
    
    
    sendOtpEmail({ to: user.email, name: user.name, otp, expiryMinutes: OTP_EXPIRY_MIN }).catch((emailErr) => {
      console.error('Failed to send OTP email:', emailErr.message);
    });

    res.json({
      success: true,
      twoFactorEnabled: true,
      otpToken,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: OTP_EXPIRY_MIN * 60,
      message: 'A 6-digit verification code has been sent to your email.',
    });
  } catch (err) {
    next(err);
  }
}


async function verifyOtp(req, res, next) {
  try {
    const { otpToken, otp } = req.body;
    const result = verifyOtpChallenge(otpToken, otp);

    if (!result.ok) {
      const messages = {
        EXPIRED: 'This code has expired. Please request a new one.',
        TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
        INVALID: 'Incorrect code. Please try again.',
      };
      return res.status(400).json({
        success: false,
        code: result.reason,
        message: messages[result.reason] || 'Could not verify this code.',
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    const { userPayload } = result;
    const { accessToken, refreshToken } = await issueSession(userPayload);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: serializeUser(userPayload),
    });
  } catch (err) {
    next(err);
  }
}


async function resendOtp(req, res, next) {
  try {
    const { otpToken } = req.body;
    const result = resendOtpChallenge(otpToken);

    if (!result.ok) {
      if (result.reason === 'COOLDOWN') {
        return res.status(429).json({
          success: false,
          code: 'COOLDOWN',
          message: 'Please wait a few seconds before requesting another code.',
          retryAfterMs: result.retryAfterMs,
        });
      }
      return res.status(400).json({
        success: false,
        code: result.reason,
        message: 'This login session has expired. Please log in again.',
      });
    }

    
    
    User.findByEmail(result.email)
      .then((user) =>
        sendOtpEmail({ to: result.email, name: user?.name, otp: result.otp, expiryMinutes: OTP_EXPIRY_MIN })
      )
      .catch((emailErr) => {
        console.error('Failed to resend OTP email:', emailErr.message);
      });

    res.json({ success: true, message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    next(err);
  }
}


async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.', data: null, error: 'EMAIL_ALREADY_EXISTS' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashed,
      role,
      isDefault: true,
    });

    sendUserWelcomeEmail({ to: user.email, name: user.name, role: user.role }).catch((emailErr) => {
      console.error('Failed to send welcome email:', emailErr.message);
    });

    res.status(201).json({
      success: true,
      message: 'User account created.',
      data: { user: serializeUser(user) },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}


async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.', data: null, error: 'USER_NOT_FOUND' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.', data: null, error: 'INVALID_CURRENT_PASSWORD' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const updated = await User.updatePassword(user.id, hashed);

    res.json({
      success: true,
      message: 'Password changed successfully.',
      data: { user: serializeUser(updated) },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}


async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required.' });
    }

    const genericResponse = {
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    };

    const user = await User.findByEmail(email);
    if (!user) {
      
      return res.json(genericResponse);
    }

    
    await PasswordResetToken.invalidateAllForUser(user.id);

    
    
    
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MIN * 60 * 1000);

    await PasswordResetToken.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    
    
    
    
    
    sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiryMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MIN,
    }).catch((emailErr) => {
      console.error('Failed to send password reset email:', emailErr.message);
    });

    return res.json(genericResponse);
  } catch (err) {
    next(err);
  }
}


async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'token and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'password must be at least 8 characters.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecord = await PasswordResetToken.findValidByTokenHash(tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.updatePassword(resetRecord.userId, hashed);
    await PasswordResetToken.markUsed(resetRecord.id);

    return res.json({ success: true, message: 'Password has been reset. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
}


async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}


async function updateTwoFactorSetting(req, res, next) {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled (boolean) is required.' });
    }

    const user = await User.updateTwoFactor(req.user.id, enabled);

    res.json({
      success: true,
      message: enabled
        ? 'Two-factor authentication is now ON. You will be emailed a code on every future login.'
        : 'Two-factor authentication is now OFF. Future logins will sign you in directly after your password and captcha.',
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}


async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required.' });
    }

    const tokenHash = hashToken(refreshToken);
    const existing = await AuthToken.findValidByHash(tokenHash);
    if (!existing) {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid or has expired. Please log in again.' });
    }

    const user = await User.findById(existing.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    await AuthToken.revoke(existing.id);
    const accessToken = signAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);

    res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
}


async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required.' });
    }
    await AuthToken.revokeByHash(hashToken(refreshToken));
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  verifyOtp,
  resendOtp,
  getCaptcha,
  register,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  updateTwoFactorSetting,
  refresh,
  logout,
};
