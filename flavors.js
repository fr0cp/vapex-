import express from 'express';
import { Flavor } from '../models/Flavor.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';

const router = express.Router();

// Get all flavors for user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const flavors = await Flavor.find({ userId: req.user._id })
      .populate('deviceId', 'name')
      .sort({ isActive: -1, createdAt: -1 });

    res.json({
      success: true,
      count: flavors.length,
      flavors: flavors.map(f => ({
        id: f._id,
        name: f.name,
        blend: f.blend,
        nicotineStrength: f.nicotineStrength,
        remaining: f.remaining,
        totalCapacity: f.totalCapacity,
        percentage: f.percentage,
        daysRemaining: f.daysRemaining,
        icon: f.icon,
        isActive: f.isActive,
        deviceName: f.deviceId?.name,
        usageCount: f.usageCount,
        lastUsed: f.lastUsed
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get active flavor
router.get('/active', authenticate, async (req, res, next) => {
  try {
    const flavor = await Flavor.findOne({
      userId: req.user._id,
      isActive: true
    }).populate('deviceId', 'name');

    if (!flavor) {
      return res.json({
        success: true,
        hasActiveFlavor: false
      });
    }

    res.json({
      success: true,
      hasActiveFlavor: true,
      flavor: {
        id: flavor._id,
        name: flavor.name,
        blend: flavor.blend,
        nicotineStrength: flavor.nicotineStrength,
        remaining: flavor.remaining,
        totalCapacity: flavor.totalCapacity,
        percentage: flavor.percentage,
        daysRemaining: flavor.daysRemaining,
        icon: flavor.icon,
        deviceName: flavor.deviceId?.name
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new flavor
router.post('/', authenticate, validate(schemas.flavorCreate), async (req, res, next) => {
  try {
    const { name, blend, nicotineStrength, totalCapacity, icon, deviceId } = req.body;

    // Verify device ownership
    if (deviceId) {
      const device = await Device.findOne({
        _id: deviceId,
        userId: req.user._id
      });

      if (!device) {
        throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
      }
    }

    const flavor = await Flavor.create({
      userId: req.user._id,
      deviceId: deviceId || req.user.devices[0],
      name,
      blend,
      nicotineStrength,
      totalCapacity: totalCapacity || 50,
      remaining: totalCapacity || 50,
      icon: icon || '💨'
    });

    res.status(201).json({
      success: true,
      flavor: {
        id: flavor._id,
        name: flavor.name,
        blend: flavor.blend,
        nicotineStrength: flavor.nicotineStrength,
        remaining: flavor.remaining,
        percentage: flavor.percentage,
        icon: flavor.icon,
        isActive: flavor.isActive
      }
    });
  } catch (error) {
    next(error);
  }
});

// Set active flavor
router.patch('/:flavorId/activate', authenticate, async (req, res, next) => {
  try {
    // Deactivate all other flavors
    await Flavor.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );

    // Activate selected flavor
    const flavor = await Flavor.findOneAndUpdate(
      { _id: req.params.flavorId, userId: req.user._id },
      { 
        isActive: true,
        lastUsed: new Date(),
        $inc: { usageCount: 1 }
      },
      { new: true }
    );

    if (!flavor) {
      throw new AppError('Flavor not found', 404, 'FLAVOR_NOT_FOUND');
    }

    broadcastToUser(req.user._id.toString(), 'flavor:changed', {
      flavorId: flavor._id,
      name: flavor.name,
      nicotineStrength: flavor.nicotineStrength
    });

    res.json({
      success: true,
      flavor: {
        id: flavor._id,
        name: flavor.name,
        blend: flavor.blend,
        nicotineStrength: flavor.nicotineStrength,
        remaining: flavor.remaining,
        percentage: flavor.percentage,
        icon: flavor.icon,
        isActive: true
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update flavor (e.g., refill)
router.patch('/:flavorId', authenticate, async (req, res, next) => {
  try {
    const { remaining, name } = req.body;
    const updates = {};

    if (remaining !== undefined) updates.remaining = remaining;
    if (name) updates.name = name;

    const flavor = await Flavor.findOneAndUpdate(
      { _id: req.params.flavorId, userId: req.user._id },
      updates,
      { new: true }
    );

    if (!flavor) {
      throw new AppError('Flavor not found', 404, 'FLAVOR_NOT_FOUND');
    }

    res.json({
      success: true,
      flavor: {
        id: flavor._id,
        name: flavor.name,
        remaining: flavor.remaining,
        percentage: flavor.percentage,
        daysRemaining: flavor.daysRemaining
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete flavor
router.delete('/:flavorId', authenticate, async (req, res, next) => {
  try {
    const flavor = await Flavor.findOneAndDelete({
      _id: req.params.flavorId,
      userId: req.user._id
    });

    if (!flavor) {
      throw new AppError('Flavor not found', 404, 'FLAVOR_NOT_FOUND');
    }

    res.json({ success: true, message: 'Flavor deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
