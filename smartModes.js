import express from 'express';
import { Device } from '../models/Device.js';
import { authenticate, requireDeviceOwnership } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { SMART_MODES } from '../utils/helpers.js';
import { broadcastToUser } from '../services/websocket.js';
import { publishToDevice } from '../services/mqtt.js';

const router = express.Router();

// Get all smart modes
router.get('/', authenticate, async (req, res) => {
  const modes = Object.entries(SMART_MODES).map(([key, value]) => ({
    id: key,
    ...value,
    icon: getModeIcon(key)
  }));

  res.json({
    success: true,
    modes
  });
});

// Get current device mode
router.get('/:deviceId/current', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.deviceId);

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    const modeInfo = SMART_MODES[device.currentMode];

    res.json({
      success: true,
      currentMode: {
        id: device.currentMode,
        ...modeInfo,
        icon: getModeIcon(device.currentMode)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Set device mode
router.post('/:deviceId/set', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const { mode } = req.body;
    const validModes = Object.keys(SMART_MODES);

    if (!validModes.includes(mode)) {
      throw new AppError('Invalid smart mode', 400, 'INVALID_MODE');
    }

    const device = await Device.findByIdAndUpdate(
      req.params.deviceId,
      { currentMode: mode },
      { new: true }
    );

    // Send to device via MQTT
    publishToDevice(device.serialNumber, 'mode', {
      mode,
      power: SMART_MODES[mode].power,
      timestamp: new Date().toISOString()
    });

    // Broadcast to WebSocket
    broadcastToUser(req.user._id.toString(), 'smart_mode:changed', {
      deviceId: device._id,
      mode,
      modeInfo: SMART_MODES[mode]
    });

    res.json({
      success: true,
      device: {
        id: device._id,
        currentMode: device.currentMode,
        modeInfo: SMART_MODES[mode]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get mode recommendations (AI-based)
router.get('/:deviceId/recommendations', authenticate, requireDeviceOwnership, async (req, res, next) => {
  try {
    const { Puff } = await import('../models/Puff.js');

    // Analyze recent usage patterns
    const recentPuffs = await Puff.find({
      userId: req.user._id,
      deviceId: req.params.deviceId,
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ timestamp: -1 });

    const avgPower = recentPuffs.length > 0
      ? recentPuffs.reduce((sum, p) => sum + p.power, 0) / recentPuffs.length
      : 20;

    const dailyPuffCount = recentPuffs.length / 7;

    // Simple recommendation logic
    let recommendation = 'auto';
    let reason = 'Based on your usage pattern';

    if (dailyPuffCount > 200) {
      recommendation = 'eco';
      reason = 'High usage detected. Eco mode recommended to save battery.';
    } else if (avgPower > 40) {
      recommendation = 'flavor';
      reason = 'You prefer high power. Flavor Boost will optimize taste.';
    } else if (dailyPuffCount < 50) {
      recommendation = 'stealth';
      reason = 'Low usage pattern. Stealth mode for discreet vaping.';
    }

    res.json({
      success: true,
      recommendation: {
        mode: recommendation,
        reason,
        modeInfo: SMART_MODES[recommendation],
        confidence: 0.85,
        analytics: {
          avgPower: avgPower.toFixed(1),
          dailyPuffCount: Math.round(dailyPuffCount),
          totalRecentPuffs: recentPuffs.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

function getModeIcon(mode) {
  const icons = {
    eco: '🍃',
    flavor: '🔥',
    cloud: '☁️',
    stealth: '🥷',
    auto: '🤖'
  };
  return icons[mode] || '⚙️';
}

export default router;
