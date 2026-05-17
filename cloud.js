import express from 'express';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { Puff } from '../models/Puff.js';
import { Flavor } from '../models/Flavor.js';
import { Goal } from '../models/Goal.js';
import { CloudSync } from '../models/CloudSync.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validate, schemas } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Trigger cloud sync
router.post('/sync', authenticate, validate(schemas.cloudSyncTrigger), async (req, res, next) => {
  try {
    const { type = 'full' } = req.body;
    const userId = req.user._id;

    // Create sync record
    const syncRecord = await CloudSync.create({
      userId,
      type,
      status: 'in_progress',
      startedAt: new Date()
    });

    // Gather data to sync
    const syncData = await gatherUserData(userId);

    // Update user last sync
    await User.findByIdAndUpdate(userId, {
      'cloudSync.lastSync': new Date()
    });

    // Complete sync
    syncRecord.status = 'completed';
    syncRecord.completedAt = new Date();
    syncRecord.recordsSynced = syncData.recordCount;
    await syncRecord.save();

    logger.info({ userId, type, records: syncData.recordCount }, 'Cloud sync completed');

    res.json({
      success: true,
      sync: {
        id: syncRecord._id,
        type: syncRecord.type,
        status: syncRecord.status,
        startedAt: syncRecord.startedAt,
        completedAt: syncRecord.completedAt,
        recordsSynced: syncRecord.recordsSynced,
        dataSize: JSON.stringify(syncData).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get sync status
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const lastSync = await CloudSync.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 });

    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      cloudSync: {
        enabled: user.cloudSync.enabled,
        lastSync: user.cloudSync.lastSync,
        backupEnabled: user.cloudSync.backupEnabled,
        lastSyncRecord: lastSync ? {
          id: lastSync._id,
          type: lastSync.type,
          status: lastSync.status,
          completedAt: lastSync.completedAt,
          recordsSynced: lastSync.recordsSynced
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all user data (for restore/backup)
router.get('/backup', authenticate, async (req, res, next) => {
  try {
    const userData = await gatherUserData(req.user._id);

    res.json({
      success: true,
      backup: userData,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Restore from backup
router.post('/restore', authenticate, async (req, res, next) => {
  try {
    const { backup } = req.body;

    if (!backup) {
      throw new AppError('Backup data required', 400, 'NO_BACKUP_DATA');
    }

    // Validate backup structure
    if (!backup.user || !backup.devices) {
      throw new AppError('Invalid backup format', 400, 'INVALID_BACKUP');
    }

    // Note: In production, this would carefully merge/restore data
    // For now, we just acknowledge receipt

    res.json({
      success: true,
      message: 'Backup restore initiated',
      restoreId: `restore_${Date.now()}`,
      records: backup.recordCount || 0
    });
  } catch (error) {
    next(error);
  }
});

// Get connected devices
router.get('/devices', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id });

    res.json({
      success: true,
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        model: d.model,
        serialNumber: d.serialNumber,
        status: d.status,
        lastSeen: d.lastSeen,
        firmwareVersion: d.firmwareVersion
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to gather all user data
async function gatherUserData(userId) {
  const [user, devices, puffs, flavors, goals] = await Promise.all([
    User.findById(userId).select('-password'),
    Device.find({ userId }),
    Puff.find({ userId }).sort({ timestamp: -1 }).limit(1000),
    Flavor.find({ userId }),
    Goal.find({ userId })
  ]);

  return {
    recordCount: devices.length + puffs.length + flavors.length + goals.length,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      preferences: user.preferences
    },
    devices: devices.map(d => ({
      id: d._id,
      name: d.name,
      model: d.model,
      serialNumber: d.serialNumber,
      settings: d.settings
    })),
    puffs: puffs.map(p => ({
      deviceId: p.deviceId,
      duration: p.duration,
      power: p.power,
      timestamp: p.timestamp
    })),
    flavors: flavors.map(f => ({
      name: f.name,
      blend: f.blend,
      nicotineStrength: f.nicotineStrength,
      remaining: f.remaining
    })),
    goals: goals.map(g => ({
      type: g.type,
      title: g.title,
      progress: g.progress,
      status: g.status
    }))
  };
}

export default router;
