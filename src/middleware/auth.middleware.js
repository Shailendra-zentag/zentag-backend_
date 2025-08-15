import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getCache, setCache } from '../utils/redis.js';
import logger from '../utils/logger.js';

export const authenticateToken = async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    let token = req.cookies?.accessToken;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return res.status(401).json({
        status: false,
        message: 'Access token not provided',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Try to get user from cache first
    let user = await getCache(`user:${decoded.userId}`);
    
    if (!user) {
      // If not in cache, get from database
      user = await User.findByPk(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          status: false,
          message: 'User not found',
        });
      }

      // Cache user data for 1 hour
      await setCache(`user:${decoded.userId}`, user.toJSON(), 3600);
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        status: false,
        message: 'User account is deactivated',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: false,
        message: 'Invalid token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: false,
        message: 'Token expired',
      });
    }

    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      status: false,
      message: 'Authentication error',
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    // Get token from cookies or Authorization header
    let token = req.cookies?.accessToken;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      // No token provided, continue without authentication
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Try to get user from cache first
    let user = await getCache(`user:${decoded.userId}`);
    
    if (!user) {
      // If not in cache, get from database
      user = await User.findByPk(decoded.userId);
      
      if (user) {
        // Cache user data for 1 hour
        await setCache(`user:${decoded.userId}`, user.toJSON(), 3600);
      }
    }

    // Attach user to request if found and active
    if (user && user.is_active) {
      req.user = user;
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without authentication
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    const userRole = req.user.subscription_plan;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        status: false,
        message: 'Insufficient permissions',
      });
    }

    next();
  };
};

export const checkStorageLimit = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    const user = await User.findByPk(req.user.id);
    const fileSize = req.file?.size || req.body?.file_size || 0;

    if (user.storage_used + fileSize > user.storage_limit) {
      return res.status(413).json({
        status: false,
        message: 'Storage limit exceeded',
        current: user.storage_used,
        limit: user.storage_limit,
        required: fileSize,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Storage limit check error:', error);
    res.status(500).json({
      status: false,
      message: 'Storage limit check failed',
    });
  }
};
