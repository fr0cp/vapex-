import express from 'express';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';

const router = express.Router();

// Get user settings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      settings: {
        profile: {
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          memberSince: user.memberSince
        },
        preferences: user.preferences,
        cloudSync: user.cloudSync
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update user preferences
router.patch('/preferences', authenticate, validate(schemas.settingsUpdate), async (req, res, next) => {
  try {
    const updates = {};
    const allowedFields = ['notifications', 'childLock', 'healthMode', 'darkMode', 'language'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[`preferences.${field}`] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid preferences to update', 400, 'NO_VALID_UPDATES');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    broadcastToUser(req.user._id.toString(), 'settings:updated', {
      preferences: user.preferences
    });

    res.json({
      success: true,
      preferences: user.preferences
    });
  } catch (error) {
    next(error);
  }
});

// Update profile
router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (avatar) updates.avatar = avatar;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update', 400, 'NO_VALID_UPDATES');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true }
    );

    res.json({
      success: true,
      profile: {
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get device settings
router.get('/device/:deviceId', authenticate, async (req, res, next) => {
  try {
    const device = await Device.findOne({
      _id: req.params.deviceId,
      userId: req.user._id
    });

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    res.json({
      success: true,
      deviceSettings: {
        deviceId: device._id,
        name: device.name,
        settings: device.settings,
        childLockEnabled: device.childLockEnabled,
        currentMode: device.currentMode
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update device settings
router.patch('/device/:deviceId', authenticate, async (req, res, next) => {
  try {
    const device = await Device.findOne({
      _id: req.params.deviceId,
      userId: req.user._id
    });

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    const allowedSettings = ['puffLimit', 'sessionTimeout', 'autoLock', 'ledBrightness', 'vibration'];
    const updates = {};

    for (const key of allowedSettings) {
      if (req.body[key] !== undefined) {
        updates[`settings.${key}`] = req.body[key];
      }
    }

    if (req.body.childLockEnabled !== undefined) {
      updates.childLockEnabled = req.body.childLockEnabled;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid settings to update', 400, 'NO_VALID_UPDATES');
    }

    const updatedDevice = await Device.findByIdAndUpdate(
      req.params.deviceId,
      { $set: updates },
      { new: true }
    );

    res.json({
      success: true,
      deviceSettings: {
        deviceId: updatedDevice._id,
        settings: updatedDevice.settings,
        childLockEnabled: updatedDevice.childLockEnabled
      }
    });
  } catch (error) {
    next(error);
  }
});

// Cloud sync settings
router.get('/cloud', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      cloudSync: user.cloudSync
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/cloud', authenticate, async (req, res, next) => {
  try {
    const { enabled, backupEnabled } = req.body;
    const updates = {};

    if (enabled !== undefined) updates['cloudSync.enabled'] = enabled;
    if (backupEnabled !== undefined) updates['cloudSync.backupEnabled'] = backupEnabled;
    updates['cloudSync.lastSync'] = new Date();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    res.json({
      success: true,
      cloudSync: user.cloudSync
    });
  } catch (error) {
    next(error);
  }
});

export default router;
