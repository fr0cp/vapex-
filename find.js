import express from 'express';
import { Device } from '../models/Device.js';
import { authenticate, requireDeviceOwnership } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';
import { publishToDevice } from '../services/mqtt.js';

const router = express.Router();

// Static paths must be registered before `/:deviceId/...` or `all` is captured as deviceId.
router.get('/all/locations', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id });

    const locations = devices.map(device => {
      const timeAgo = device.lastSeen
        ? Math.round((Date.now() - new Date(device.lastSeen)) / 60000)
        : null;

      return {
        deviceId: device._id,
        deviceName: device.name,
        location: device.location,
        lastSeen: device.lastSeen,
        timeAgo: timeAgo ? `${timeAgo}m ago` : 'Unknown',
        status: device.status,
        isOnline: device.status === 'online'
      };
    });

    res.json({
      success: true,
      locations
    });
  } catch (error) {
    next(error);
  }
});

// Get device location
router.get('/:deviceId/location', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.deviceId);

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    const timeAgo = device.lastSeen 
      ? Math.round((Date.now() - new Date(device.lastSeen)) / 60000)
      : null;

    res.json({
      success: true,
      device: {
        id: device._id,
        name: device.name,
        currentLocation: device.location,
        lastSeen: device.lastSeen,
        timeAgo: timeAgo ? `${timeAgo}m ago` : 'Unknown',
        status: device.status,
        isOnline: device.status === 'online'
      },
      locationHistory: device.locationHistory.slice(-10).map(loc => ({
        name: loc.name,
        timestamp: loc.timestamp,
        coordinates: loc.coordinates
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Ring device
router.post('/:deviceId/ring', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.deviceId);

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    // Send ring command via MQTT (works even if offline — will execute when device reconnects)
    const published = publishToDevice(device.serialNumber, 'ring', {
      duration: 5000,
      pattern: 'sos',
      timestamp: new Date().toISOString()
    });

    // Also try WebSocket
    broadcastToUser(req.user._id.toString(), 'device:ring_command', {
      deviceId: device._id,
      duration: 5000
    });

    res.json({
      success: true,
      message: 'Ring command sent to device',
      device: {
        id: device._id,
        name: device.name,
        commandSent: published
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update device location (from device or mobile app)
router.post('/:deviceId/location', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const { name, coordinates } = req.body;

    const device = await Device.findByIdAndUpdate(
      req.params.deviceId,
      {
        location: {
          name: name || 'Unknown',
          lastUpdated: new Date()
        },
        $push: {
          locationHistory: {
            name: name || 'Unknown',
            coordinates,
            timestamp: new Date()
          }
        },
        lastSeen: new Date()
      },
      { new: true }
    );

    broadcastToUser(req.user._id.toString(), 'device:location_updated', {
      deviceId: device._id,
      location: device.location
    });

    res.json({
      success: true,
      location: device.location
    });
  } catch (error) {
    next(error);
  }
});

export default router;
