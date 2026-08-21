const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
  validateLogin,
  validateVerifyOtp,
  validateResendOtp,
  validateRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateTwoFactor,
} = require('../middleware/validation');

router.get('/captcha', getCaptcha);

router.post('/login', validateLogin, login);
router.post('/verify-otp', validateVerifyOtp, verifyOtp);
router.post('/resend-otp', validateResendOtp, resendOtp);

router.post('/refresh', refresh);
router.post('/logout', logout);

router.post('/register', requireAuth, requireRole('ADMIN'), validateRegister, register);
router.post('/change-password', requireAuth, validateChangePassword, changePassword);

router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password', validateResetPassword, resetPassword);

router.get('/me', requireAuth, getMe);
router.patch('/2fa', requireAuth, validateUpdateTwoFactor, updateTwoFactorSetting);

module.exports = router;
