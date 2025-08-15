import express from 'express';
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  refreshToken,
  getMe,
  updatePassword
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword
} from '../middleware/validation.js';

const router = express.Router();

// Public routes
router.post('/signup', signup);
router.post('/login', validateLogin, login);
router.post('/logout', logout);
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.patch('/reset-password/:token', validateResetPassword, resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/refresh-token', refreshToken);

// Protected routes
router.use(protect); // All routes after this middleware are protected

router.get('/me', getMe);
router.patch('/update-password', validateChangePassword, updatePassword);

export default router;
