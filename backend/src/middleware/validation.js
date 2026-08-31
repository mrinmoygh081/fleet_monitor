




function validateLogin(req, res, next) {
  const { email, password, captchaId, captchaText } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  if (!captchaId || !captchaText) {
    return res.status(400).json({ success: false, message: 'Please complete the captcha.' });
  }
  next();
}



function validateVerifyOtp(req, res, next) {
  const { otpToken, otp } = req.body;
  if (!otpToken || typeof otpToken !== 'string') {
    return res.status(400).json({ success: false, message: 'otpToken is required.' });
  }
  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return res.status(400).json({ success: false, message: 'Please enter the 6-digit code.' });
  }
  next();
}

function validateResendOtp(req, res, next) {
  const { otpToken } = req.body;
  if (!otpToken || typeof otpToken !== 'string') {
    return res.status(400).json({ success: false, message: 'otpToken is required.' });
  }
  next();
}

function validateRegister(req, res, next) {
  const { name, email, password, role } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'name is required.', data: null, error: 'VALIDATION_ERROR' });
  }
  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'A valid email address is required.', data: null, error: 'VALIDATION_ERROR' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.', data: null, error: 'VALIDATION_ERROR' });
  }
  if (!role || !['OPERATOR', 'ADMIN'].includes(role)) {
    return res.status(400).json({ success: false, message: 'role must be OPERATOR or ADMIN.', data: null, error: 'VALIDATION_ERROR' });
  }
  next();
}

function validateChangePassword(req, res, next) {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || typeof oldPassword !== 'string') {
    return res.status(400).json({ success: false, message: 'oldPassword is required.', data: null, error: 'VALIDATION_ERROR' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'newPassword (min 8 characters) is required.', data: null, error: 'VALIDATION_ERROR' });
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({ success: false, message: 'newPassword must be different from oldPassword.', data: null, error: 'VALIDATION_ERROR' });
  }
  next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }
  next();
}

function validateResetPassword(req, res, next) {
  const { token, password } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, message: 'token is required.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, message: 'password (min 8 characters) is required.' });
  }
  next();
}


function validateUpdateTwoFactor(req, res, next) {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'enabled (boolean) is required.' });
  }
  next();
}

module.exports = {
  validateLogin,
  validateVerifyOtp,
  validateResendOtp,
  validateRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateTwoFactor,
};
