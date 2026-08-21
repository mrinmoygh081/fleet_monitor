const nodemailer = require('nodemailer');
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = require('../config/env');


let transporter = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in your .env before Forgot Password emails can be sent.'
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, 
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      
      
      
      
      
      
      
      
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}


function logSmtpError(context, err) {
  console.error(`[emailService] ${context} failed:`, {
    message: err.message,
    code: err.code,
    command: err.command,
    responseCode: err.responseCode,
    response: err.response,
  });

  if (err.code === 'EAUTH' || err.responseCode === 535) {
    console.error(
      '[emailService] Hint: SMTP authentication was rejected. For Gmail, SMTP_USER/SMTP_PASSWORD must be a ' +
        '16-character App Password (not the normal account password), and the Google account must have ' +
        '2-Step Verification turned on. Generate one at https://myaccount.google.com/apppasswords, then update ' +
        'SMTP_PASSWORD in .env and restart the server.'
    );
  } else if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED'].includes(err.code)) {
    console.error(
      '[emailService] Hint: could not reach the SMTP server at all. If this backend is deployed on a free-tier ' +
        'host (Render, Railway, Replit, etc.), outbound SMTP ports (25/465/587) are frequently blocked — use a ' +
        'transactional email API over HTTPS instead (SendGrid, Resend, Mailgun) or confirm the host allows ' +
        'outbound SMTP. If running locally, check your firewall/antivirus and SMTP_HOST/SMTP_PORT values.'
    );
  }
}


async function verifyEmailTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.warn('[emailService] SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing) — OTP and password-reset emails will fail.');
    return false;
  }
  try {
    await getTransporter().verify();
    console.log(`[emailService] SMTP connection OK (${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}). OTP emails should send fine.`);
    return true;
  } catch (err) {
    logSmtpError('Startup SMTP verification', err);
    return false;
  }
}


async function sendPasswordResetEmail({ to, name, resetUrl, expiryMinutes }) {
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a2332;">
      <h2 style="color: #14335e;">Reset your password</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received a request to reset the password for your Fleet Dashboard account. Click the button below to choose a new password. This link expires in ${expiryMinutes} minutes.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: linear-gradient(135deg, #1c3f73, #2f6fd6); color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 13px; color: #45536b;">${resetUrl}</p>
      <p style="font-size: 13px; color: #6b7688; margin-top: 24px;">
        If you didn't request this, you can safely ignore this email — your password will not change.
      </p>
    </div>
  `;

  try {
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Reset your Fleet Dashboard password',
      html,
    });
  } catch (err) {
    logSmtpError('sendPasswordResetEmail', err);
    throw err;
  }
}

const BRAND_LOGO_URL = 'https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/256x256/30eba7e5e79ba6e7c72f582bc13b87f3';

function emailShell(bodyHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a2332; background:#f4f7fd; padding: 24px;">
      <div style="background:#ffffff; border-radius: 14px; overflow:hidden; box-shadow: 0 4px 18px rgba(28,63,115,0.12);">
        <div style="background: linear-gradient(135deg, #123a75, #2f6fd6); padding: 24px; text-align:center;">
          <img src="${BRAND_LOGO_URL}" alt="Technocon Services" width="52" height="52" style="border-radius: 10px; background:#fff; padding:4px;" />
          <div style="color:#ffffff; font-size: 15px; font-weight:700; margin-top:10px; letter-spacing:0.3px;">TECHNOCON SERVICES</div>
          <div style="color:#cfe0ff; font-size: 12px; margin-top:2px;">FleetWatch Control Room</div>
        </div>
        <div style="padding: 28px;">
          ${bodyHtml}
        </div>
      </div>
      <p style="text-align:center; font-size: 11px; color: #9aa6b8; margin-top: 16px;">This is an automated message from FleetWatch. Please do not reply to this email.</p>
    </div>
  `;
}


async function sendOtpEmail({ to, name, otp, expiryMinutes }) {
  const body = `
    <h2 style="color:#14335e; margin-top:0;">Your login verification code</h2>
    <p>Hi ${escapeHtml(name || 'there')},</p>
    <p>Use the code below to finish signing in to your FleetWatch Control Room account. This code expires in ${expiryMinutes} minutes.</p>
    <div style="text-align:center; margin: 28px 0;">
      <span style="display:inline-block; background: linear-gradient(135deg, #1c3f73, #2f6fd6); color:#fff; font-size: 30px; font-weight:700; letter-spacing: 10px; padding: 14px 26px; border-radius: 10px;">${escapeHtml(otp)}</span>
    </div>
    <p style="font-size: 13px; color:#6b7688;">Didn't try to log in? You can safely ignore this email — your account is still secure and no changes were made.</p>
  `;
  try {
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to,
      subject: `${otp} is your FleetWatch verification code`,
      html: emailShell(body),
    });
  } catch (err) {
    logSmtpError('sendOtpEmail', err);
    throw err;
  }
}


async function sendUserWelcomeEmail({ to, name, role }) {
  const roleLabel = role === 'ADMIN' ? 'Administrator' : 'Operator';
  const body = `
    <h2 style="color:#14335e; margin-top:0;">${roleLabel} account created</h2>
    <p>Hi ${escapeHtml(name || 'there')},</p>
    <p>An ${roleLabel} account for <strong>FleetWatch Control Room</strong> has been created using this email address (${escapeHtml(to)}).</p>
    <p>You can now sign in from the Login page using your email and password — you'll be asked for an OTP sent to this inbox as an extra verification step.</p>
    <p style="font-size: 13px; color:#6b7688;">If you didn't request this account, please contact your system administrator.</p>
  `;
  try {
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to,
      subject: `Your FleetWatch ${roleLabel} account is ready`,
      html: emailShell(body),
    });
  } catch (err) {
    logSmtpError('sendUserWelcomeEmail', err);
    throw err;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { sendPasswordResetEmail, sendOtpEmail, sendUserWelcomeEmail, verifyEmailTransport };
