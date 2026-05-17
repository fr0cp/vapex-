import express from 'express';
import { Coil } from '../models/Coil.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';

const router = express.Router();

// Get all coils
router.get('/', authenticate, async (req, res, next) => {
  try {
    const coils = await Coil.find({ userId: req.user._id })
      .populate('deviceId', 'name')
      .sort({ installedAt: -1 });

    res.json({
      success: true,
      count: coils.length,
      coils: coils.map(c => ({
        id: c._id,
        type: c.type,
        resistance: c.resistance,
        material: c.material,
        totalPuffs: c.totalPuffs,
        maxPuffs: c.maxPuffs,
        lifePercentage: c.lifePercentage,
        daysUsed: c.daysUsed,
        daysRemaining: c.daysRemaining,
        status: c.status,
        installedAt: c.installedAt,
        estimatedReplacementDate: c.estimatedReplacementDate,
        deviceName: c.deviceId?.name,
        warningThreshold: c.warningThreshold
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get active coil for device
router.get('/device/:deviceId/active', authenticate, async (req, res, next) => {
  try {
    const coil = await Coil.findOne({
      userId: req.user._id,
      deviceId: req.params.deviceId,
      status: { $nin: ['expired'] }
    }).sort({ installedAt: -1 });

    if (!coil) {
      return res.json({
        success: true,
        hasCoil: false
      });
    }

    const needsWarning = coil.lifePercentage <= coil.warningThreshold;

    res.json({
      success: true,
      hasCoil: true,
      coil: {
        id: coil._id,
        type: coil.type,
        lifePercentage: coil.lifePercentage,
        daysUsed: coil.daysUsed,
        daysRemaining: coil.daysRemaining,
        totalPuffs: coil.totalPuffs,
        maxPuffs: coil.maxPuffs,
        status: coil.status,
        needsWarning,
        estimatedReplacementDate: coil.estimatedReplacementDate
      }
    });
  } catch (error) {
    next(error);
  }
});

// Install new coil
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { deviceId, type, resistance, material, maxPuffs } = req.body;

    // Verify device ownership
    const device = await Device.findOne({
      _id: deviceId,
      userId: req.user._id
    });

    if (!device) {
      throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
    }

    // Mark old coils as expired
    await Coil.updateMany(
      { deviceId, userId: req.user._id, status: { $ne: 'expired' } },
      { status: 'expired' }
    );

    const coil = await Coil.create({
      userId: req.user._id,
      deviceId,
      type: type || 'mesh',
      resistance: resistance || 0.5,
      material: material || 'mesh',
      maxPuffs: maxPuffs || 5000,
      installedAt: new Date()
    });

    broadcastToUser(req.user._id.toString(), 'coil:installed', {
      coilId: coil._id,
      deviceId,
      type: coil.type
    });

    res.status(201).json({
      success: true,
      coil: {
        id: coil._id,
        type: coil.type,
        resistance: coil.resistance,
        lifePercentage: coil.lifePercentage,
        maxPuffs: coil.maxPuffs,
        status: coil.status,
        installedAt: coil.installedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update coil (record puffs)
router.patch('/:coilId/puffs', authenticate, async (req, res, next) => {
  try {
    const { puffs } = req.body;

    const coil = await Coil.findOneAndUpdate(
      { _id: req.params.coilId, userId: req.user._id },
      { $inc: { totalPuffs: puffs || 1 } },
      { new: true }
    );

    if (!coil) {
      throw new AppError('Coil not found', 404, 'COIL_NOT_FOUND');
    }

    // Check if warning needed
    if (coil.lifePercentage <= coil.warningThreshold && !coil.lastWarningAt) {
      coil.lastWarningAt = new Date();
      await coil.save();
    }

    res.json({
      success: true,
      coil: {
        id: coil._id,
        totalPuffs: coil.totalPuffs,
        lifePercentage: coil.lifePercentage,
        daysRemaining: coil.daysRemaining,
        status: coil.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Reset coil (when user says they changed it)
router.post('/:coilId/reset', authenticate, async (req, res, next) => {
  try {
    const coil = await Coil.findOneAndUpdate(
      { _id: req.params.coilId, userId: req.user._id },
      {
        totalPuffs: 0,
        daysUsed: 0,
        lifePercentage: 100,
        status: 'new',
        installedAt: new Date(),
        lastWarningAt: null
      },
      { new: true }
    );

    if (!coil) {
      throw new AppError('Coil not found', 404, 'COIL_NOT_FOUND');
    }

    broadcastToUser(req.user._id.toString(), 'coil:reset', {
      coilId: coil._id,
      deviceId: coil.deviceId
    });

    res.json({
      success: true,
      message: 'Coil reset successfully',
      coil: {
        id: coil._id,
        lifePercentage: coil.lifePercentage,
        status: coil.status,
        installedAt: coil.installedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
