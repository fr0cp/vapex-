import express from 'express';
import { Device } from '../models/Device.js';
import { Puff } from '../models/Puff.js';
import { Session } from '../models/Session.js';
import { Flavor } from '../models/Flavor.js';
import { Coil } from '../models/Coil.js';
import { authenticate, requireDeviceOwnership } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';
import { publishToDevice } from '../services/mqtt.js';

const router = express.Router();

// Get all user devices
router.get('/', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id })
      .populate('userId', 'name email')
      .sort({ lastSeen: -1 });

    res.json({
      success: true,
      count: devices.length,
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        model: d.model,
        serialNumber: d.serialNumber,
        firmwareVersion: d.firmwareVersion,
        batteryLevel: d.batteryLevel,
        batteryHealth: d.batteryHealth,
        chargeCycles: d.chargeCycles,
        isCharging: d.isCharging,
        status: d.status,
        lastSeen: d.lastSeen,
        location: d.location,
        currentMode: d.currentMode,
        settings: d.settings,
        childLockEnabled: d.childLockEnabled,
        estimatedBatteryLife: d.estimatedBatteryLife,
        batteryDrainRate: d.batteryDrainRate,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get single device
router.get('/:deviceId', authenticate, requireDeviceOwnership, async (req, res, next) => {
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
      device: {
        id: device._id,
        name: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        firmwareVersion: device.firmwareVersion,
        batteryLevel: device.batteryLevel,
        batteryHealth: device.batteryHealth,
        chargeCycles: device.chargeCycles,
        isCharging: device.isCharging,
        status: device.status,
        lastSeen: device.lastSeen,
        location: device.location,
        locationHistory: device.locationHistory.slice(-10),
        currentMode: device.currentMode,
        settings: device.settings,
        childLockEnabled: device.childLockEnabled,
        estimatedBatteryLife: device.estimatedBatteryLife,
        batteryDrainRate: device.batteryDrainRate,
        wifiConnected: device.wifiConnected,
        bluetoothId: device.bluetoothId
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new device
router.post('/', authenticate, validate(schemas.deviceCreate), async (req, res, next) => {
  try {
    const { name, model, serialNumber } = req.body;

    const existing = await Device.findOne({ serialNumber });
    if (existing) {
      throw new AppError('Device with this serial number already exists', 409, 'DEVICE_EXISTS');
    }

    const device = await Device.create({
      userId: req.user._id,
      name,
      model,
      serialNumber
    });

    // Add to user's devices
    req.user.devices.push(device._id);
    await req.user.save();

    res.status(201).json({
      success: true,
      device: {
        id: device._id,
        name: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        status: device.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update device settings
router.patch('/:deviceId/settings', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const allowedUpdates = ['puffLimit', 'sessionTimeout', 'autoLock', 'ledBrightness', 'vibration'];
    const updates = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[`settings.${key}`] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid settings to update', 400, 'NO_VALID_UPDATES');
    }

    const device = await Device.findByIdAndUpdate(
      req.params.deviceId,
      { $set: updates },
      { new: true }
    );

    // Send settings update to device via MQTT
    publishToDevice(device.serialNumber, 'settings', {
      settings: device.settings,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      device: {
        id: device._id,
        settings: device.settings
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update device mode
router.patch('/:deviceId/mode', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const { mode } = req.body;
    const validModes = ['eco', 'flavor', 'cloud', 'stealth', 'auto'];

    if (!validModes.includes(mode)) {
      throw new AppError('Invalid mode', 400, 'INVALID_MODE');
    }

    const device = await Device.findByIdAndUpdate(
      req.params.deviceId,
      { currentMode: mode },
      { new: true }
    );

    // Send mode change to device
    publishToDevice(device.serialNumber, 'mode', { mode });

    broadcastToUser(req.user._id.toString(), 'device:mode_changed', {
      deviceId: device._id,
      mode: device.currentMode
    });

    res.json({
      success: true,
      device: {
        id: device._id,
        currentMode: device.currentMode
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update child lock
router.patch('/:deviceId/child-lock', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const { enabled, pinCode } = req.body;

    const updates = { childLockEnabled: enabled };
    if (pinCode !== undefined) updates.pinCode = pinCode;

    const device = await Device.findByIdAndUpdate(
      req.params.deviceId,
      updates,
      { new: true }
    );

    publishToDevice(device.serialNumber, 'child_lock', {
      enabled: device.childLockEnabled,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      device: {
        id: device._id,
        childLockEnabled: device.childLockEnabled
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete device
router.delete('/:deviceId', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const id = req.params.deviceId;
    await Promise.all([
      Puff.deleteMany({ deviceId: id }),
      Session.deleteMany({ deviceId: id }),
      Flavor.deleteMany({ deviceId: id }),
      Coil.deleteMany({ deviceId: id })
    ]);
    await Device.findByIdAndDelete(id);

    // Remove from user's devices
    req.user.devices = req.user.devices.filter(
      d => d.toString() !== id
    );
    await req.user.save();

    res.json({ success: true, message: 'Device removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
