import express from 'express';
import { Puff } from '../models/Puff.js';
import { Flavor } from '../models/Flavor.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Get liquid consumption overview
router.get('/overview', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Get consumption stats
    const [todayStats, weekStats, activeFlavor] = await Promise.all([
      Puff.getDailyStats(req.user._id, now),
      Puff.aggregate([
        {
          $match: {
            userId: req.user._id,
            timestamp: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        { $group: { _id: null, total: { $sum: '$liquidConsumed' } } }
      ]),
      Flavor.findOne({ userId: req.user._id, isActive: true })
    ]);

    res.json({
      success: true,
      consumption: {
        today: todayStats.totalLiquid.toFixed(1),
        week: (weekStats[0]?.total || 0).toFixed(1),
        averagePerDay: weekStats[0]?.total != null
          ? (weekStats[0].total / 7).toFixed(1)
          : '0.0'
      },
      activeFlavor: activeFlavor ? {
        name: activeFlavor.name,
        remaining: activeFlavor.remaining,
        totalCapacity: activeFlavor.totalCapacity,
        percentage: activeFlavor.percentage,
        daysRemaining: activeFlavor.daysRemaining
      } : null
    });
  } catch (error) {
    next(error);
  }
});

// Get tank level
router.get('/tank-level/:deviceId', authenticate, async (req, res, next) => {
  try {
    const flavor = await Flavor.findOne({
      userId: req.user._id,
      deviceId: req.params.deviceId,
      isActive: true
    });

    if (!flavor) {
      return res.json({
        success: true,
        hasLiquid: false
      });
    }

    res.json({
      success: true,
      hasLiquid: true,
      tankLevel: {
        remaining: flavor.remaining,
        totalCapacity: flavor.totalCapacity,
        percentage: flavor.percentage,
        flavorName: flavor.name,
        daysRemaining: flavor.daysRemaining
      }
    });
  } catch (error) {
    next(error);
  }
});

// Record liquid refill
router.post('/refill/:flavorId', authenticate, async (req, res, next) => {
  try {
    const add = Number.parseFloat(String(req.body?.amount ?? '50'));
    const amount = Number.isFinite(add) && add > 0 ? Math.min(add, 500) : 50;

    const existing = await Flavor.findOne({
      _id: req.params.flavorId,
      userId: req.user._id
    });
    if (!existing) {
      throw new AppError('Flavor not found', 404, 'FLAVOR_NOT_FOUND');
    }

    const cap = existing.totalCapacity || 50;
    const nextRemaining = Math.min(cap, (existing.remaining || 0) + amount);

    const flavor = await Flavor.findOneAndUpdate(
      { _id: req.params.flavorId, userId: req.user._id },
      { $set: { remaining: nextRemaining } },
      { new: true }
    );

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

export default router;
