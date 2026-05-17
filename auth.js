import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { getJwtSecret } from '../config/env.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    logger.error({ error }, 'Auth middleware error');
    return res.status(500).json({ success: false, error: 'Authentication failed', code: 'AUTH_ERROR' });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret());
      const user = await User.findById(decoded.userId).select('-password');
      if (user) req.user = user;
    }
    next();
  } catch {
    next();
  }
};

export const requireDeviceOwnership = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const user = req.user;

    const hasDevice = (user.devices ?? []).some(d => d.toString() === deviceId);
    if (!hasDevice) {
      return res.status(403).json({ 
        success: false,
        error: 'You do not own this device',
        code: 'DEVICE_NOT_OWNED'
      });
    }
    next();
  } catch (error) {
    logger.error({ error }, 'Device ownership check failed');
    return res.status(500).json({ success: false, error: 'Authorization check failed', code: 'AUTHZ_ERROR' });
  }
};
