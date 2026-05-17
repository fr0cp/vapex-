import express from 'express';
import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Health check
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  // Check database
  try {
    const dbState = mongoose.connection.readyState;
    health.database = {
      status: dbState === 1 ? 'connected' : 'disconnected',
      state: dbState
    };
  } catch (error) {
    health.database = { status: 'error', error: error.message };
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API documentation (basic)
router.get('/docs', (req, res) => {
  res.json({
    name: 'VAPEX API',
    version: '1.0.0',
    description: 'IoT Vape Device Management API',
    baseUrl: '/api/v1',
    endpoints: {
      auth: {
        'POST /auth/register': 'Register new user',
        'POST /auth/login': 'Login user',
        'POST /auth/refresh': 'Refresh JWT token',
        'GET /auth/me': 'Get current user',
        'POST /auth/logout': 'Logout user'
      },
      devices: {
        'GET /devices': 'List all devices',
        'GET /devices/:id': 'Get device details',
        'POST /devices': 'Create new device',
        'PATCH /devices/:id/settings': 'Update device settings',
        'PATCH /devices/:id/mode': 'Change device mode',
        'PATCH /devices/:id/child-lock': 'Toggle child lock',
        'DELETE /devices/:id': 'Delete device'
      },
      puffs: {
        'POST /puffs': 'Record a puff',
        'GET /puffs/today': "Get today's puffs",
        'GET /puffs/history': 'Get puff history',
        'GET /puffs/stats': 'Get puff statistics'
      },
      analytics: {
        'GET /analytics/weekly': 'Weekly comparison',
        'GET /analytics/battery': 'Battery analytics',
        'GET /analytics/nicotine': 'Nicotine consumption',
        'GET /analytics/liquid': 'Liquid consumption',
        'GET /analytics/hourly': 'Hourly usage pattern',
        'GET /analytics/devices': 'Device usage comparison'
      },
      smartModes: {
        'GET /smart-modes': 'List all modes',
        'GET /smart-modes/:deviceId/current': 'Get current mode',
        'POST /smart-modes/:deviceId/set': 'Set device mode',
        'GET /smart-modes/:deviceId/recommendations': 'Get AI recommendations'
      },
      goals: {
        'GET /goals': 'List all goals',
        'POST /goals': 'Create new goal',
        'PATCH /goals/:id/progress': 'Update goal progress',
        'GET /goals/nicotine-reduction/active': 'Get active nicotine goal',
        'GET /goals/puff-limit/status': 'Get puff limit status',
        'DELETE /goals/:id': 'Delete goal'
      },
      find: {
        'GET /find/:deviceId/location': 'Get device location',
        'POST /find/:deviceId/ring': 'Ring device',
        'POST /find/:deviceId/location': 'Update location',
        'GET /find/all/locations': 'Get all device locations'
      },
      settings: {
        'GET /settings': 'Get user settings',
        'PATCH /settings/preferences': 'Update preferences',
        'PATCH /settings/profile': 'Update profile',
        'GET /settings/device/:deviceId': 'Get device settings',
        'PATCH /settings/device/:deviceId': 'Update device settings',
        'GET /settings/cloud': 'Get cloud sync settings',
        'PATCH /settings/cloud': 'Update cloud sync'
      },
      flavors: {
        'GET /flavors': 'List all flavors',
        'GET /flavors/active': 'Get active flavor',
        'POST /flavors': 'Create flavor',
        'PATCH /flavors/:id/activate': 'Set active flavor',
        'PATCH /flavors/:id': 'Update flavor',
        'DELETE /flavors/:id': 'Delete flavor'
      },
      coils: {
        'GET /coils': 'List all coils',
        'GET /coils/device/:deviceId/active': 'Get active coil',
        'POST /coils': 'Install new coil',
        'PATCH /coils/:id/puffs': 'Record coil puffs',
        'POST /coils/:id/reset': 'Reset coil'
      },
      liquids: {
        'GET /liquids/overview': 'Get consumption overview',
        'GET /liquids/tank-level/:deviceId': 'Get tank level',
        'POST /liquids/refill/:flavorId': 'Record refill'
      },
      cloud: {
        'POST /cloud/sync': 'Trigger cloud sync',
        'GET /cloud/status': 'Get sync status',
        'GET /cloud/backup': 'Get backup data',
        'POST /cloud/restore': 'Restore from backup',
        'GET /cloud/devices': 'Get connected devices'
      },
      users: {
        'GET /users/profile': 'Get user profile',
        'PATCH /users/profile': 'Update profile',
        'GET /users/notifications': 'Get notifications',
        'PATCH /users/notifications/:id/read': 'Mark notification read',
        'PATCH /users/notifications/read-all': 'Mark all read',
        'DELETE /users/account': 'Delete account'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      note: 'Get token from /auth/login or /auth/register'
    },
    websocket: {
      url: 'wss://api.vapex.app',
      events: {
        'authenticate': 'Send JWT token to authenticate',
        'device:telemetry': 'Receive device telemetry',
        'puff:recorded': 'Receive puff events',
        'device:ring_command': 'Send ring command'
      }
    }
  });
});

export default router;
