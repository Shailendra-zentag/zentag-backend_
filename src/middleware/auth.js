import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import User from '../models/User.js';
import { AppError, asyncHandler } from './errorHandler.js';
import logger from '../utils/logger.js';

// Verify JWT token
export const protect = asyncHandler(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;

  logger.debug('Auth headers:', req.headers.authorization);
  logger.debug('Cookies:', req.cookies);

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    logger.debug('Token from Bearer header:', token);
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
    logger.debug('Token from cookie:', token);
  }

  if (!token) {
    logger.debug('No token found in headers or cookies');
    return next(new AppError('Access denied - No token provided', 401, 'Token missing'));
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id).select('+active');
  if (!currentUser) {
    return next(new AppError('The user belonging to this token does no longer exist.', 401));
  }

  // 4) Check if user is active
  if (!currentUser.active) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // 5) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password! Please log in again.', 401));
  }

  // Grant access to protected route
  req.user = currentUser;
  next();
});

// Optional authentication (doesn't throw error if no token)
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next();
  }

  try {
    // Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    // Check if user still exists
    const currentUser = await User.findById(decoded.id).select('+active');
    if (!currentUser || !currentUser.active) {
      return next();
    }

    // Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next();
    }

    req.user = currentUser;
  } catch (error) {
    // If token is invalid, continue without user
    logger.debug('Optional auth failed:', error.message);
  }
  
  next();
});

// Restrict access to specific roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

// Check if user owns the resource or is admin
export const checkOwnership = (resourceUserField = 'user') => {
  return (req, res, next) => {
    // If user is admin, allow access
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.resource ? req.resource[resourceUserField] : req.params.userId;
    
    if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
      return next(new AppError('You can only access your own resources', 403));
    }
    
    next();
  };
};

// Rate limiting for sensitive operations
export const sensitiveOperationLimit = (windowMs = 15 * 60 * 1000, maxAttempts = 3) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const key = `${req.ip}-${req.user?._id}`;
    const now = Date.now();
    const userAttempts = attempts.get(key) || [];
    
    // Clean old attempts
    const recentAttempts = userAttempts.filter(timestamp => now - timestamp < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return next(new AppError('Too many attempts. Please try again later.', 429));
    }
    
    // Record this attempt
    recentAttempts.push(now);
    attempts.set(key, recentAttempts);
    
    next();
  };
};
