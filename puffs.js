import express from 'express';
import { Puff } from '../models/Puff.js';
import { Device } from '../models/Device.js';
import { Coil } from '../models/Coil.js';
import { Flavor } from '../models/Flavor.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastToUser } from '../services/websocket.js';

const router = express.Router();

// Record a new puff
router.post('/', authenticate, validate(schemas.puffRecord), async (req, res, next) => {
  try {
    const { deviceId, duration, power, temperature } = req.body;

    // Verify device ownership
    const device = await Device.findOne({
      _id: deviceId,
      userId: req.user._id
    });

    if (!device) {
      throw new AppError('Device not found or not owned', 404, 'DEVICE_NOT_FOUND');
    }

    const activeFlavor = await Flavor.findOne({
      userId: req.user._id,
      deviceId,
      isActive: true
    });

    const puffDuration = duration || 2;
    const puffPower = power || device.settings.power || 20;
    const liquidPerPuff = Number(((puffDuration / 2) * (puffPower / 20) * 0.03).toFixed(4));
    const nicotineStrength = activeFlavor?.nicotineStrength || 0;
    const nicotinePerPuff = Number((liquidPerPuff * nicotineStrength).toFixed(4));

    const puff = await Puff.create({
      userId: req.user._id,
      deviceId,
      duration: puffDuration,
      power: puffPower,
      temperature: temperature || 200,
      nicotineConsumed: nicotinePerPuff,
      liquidConsumed: liquidPerPuff,
      timestamp: new Date()
    });

    const updates = [
      Device.findByIdAndUpdate(deviceId, { lastSeen: new Date() }),
      Coil.findOneAndUpdate(
        { userId: req.user._id, deviceId, status: { $nin: ['expired'] } },
        { $inc: { totalPuffs: 1 } },
        { sort: { installedAt: -1 }, new: true }
      )
    ];

    if (activeFlavor) {
      updates.push(
        Flavor.findByIdAndUpdate(activeFlavor._id, {
          $set: { lastUsed: new Date() },
          $inc: {
            remaining: -Math.min(activeFlavor.remaining, liquidPerPuff),
            usageCount: 1
          }
        })
      );
    }

    await Promise.all(updates);

    // Get updated daily stats
    const dailyStats = await Puff.getDailyStats(req.user._id);

    // Broadcast to WebSocket
    broadcastToUser(req.user._id.toString(), 'puff:new', {
      puffId: puff._id,
      deviceId,
      timestamp: puff.timestamp,
      dailyStats: {
        totalPuffs: dailyStats.totalPuffs,
        totalNicotine: dailyStats.totalNicotine.toFixed(1),
        totalLiquid: dailyStats.totalLiquid.toFixed(1)
      }
    });

    res.status(201).json({
      success: true,
      puff: {
        id: puff._id,
        deviceId: puff.deviceId,
        duration: puff.duration,
        power: puff.power,
        nicotineConsumed: puff.nicotineConsumed,
        liquidConsumed: puff.liquidConsumed,
        timestamp: puff.timestamp
      },
      flavor: activeFlavor ? {
        id: activeFlavor._id,
        name: activeFlavor.name,
        nicotineStrength: activeFlavor.nicotineStrength
      } : null,
      dailyStats: {
        totalPuffs: dailyStats.totalPuffs,
        totalDuration: dailyStats.totalDuration,
        avgPower: dailyStats.avgPower?.toFixed(1),
        totalNicotine: dailyStats.totalNicotine.toFixed(2),
        totalLiquid: dailyStats.totalLiquid.toFixed(2)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get today's puffs
router.get('/today', authenticate, async (req, res, next) => {
  try {
    const stats = await Puff.getDailyStats(req.user._id);

    // Get individual puffs
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const puffs = await Puff.find({
      userId: req.user._id,
      timestamp: { $gte: startOfDay }
    })
    .sort({ timestamp: -1 })
    .limit(50)
    .populate('deviceId', 'name');

    res.json({
      success: true,
      stats: {
        totalPuffs: stats.totalPuffs,
        totalDuration: stats.totalDuration,
        avgPower: stats.avgPower?.toFixed(1),
        avgTemp: stats.avgTemp?.toFixed(0),
        totalNicotine: stats.totalNicotine.toFixed(2),
        totalLiquid: stats.totalLiquid.toFixed(2),
        sessionCount: stats.sessions?.length || 0
      },
      puffs: puffs.map(p => ({
        id: p._id,
        deviceName: p.deviceId?.name || 'Unknown',
        duration: p.duration,
        power: p.power,
        temperature: p.temperature,
        nicotineConsumed: p.nicotineConsumed,
        liquidConsumed: p.liquidConsumed,
        timestamp: p.timestamp
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Reset today's puff counter
router.delete('/today', authenticate, async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayPuffs = await Puff.find({
      userId: req.user._id,
      timestamp: { $gte: startOfDay }
    }).select('deviceId');

    const countByDevice = todayPuffs.reduce((totals, puff) => {
      const id = puff.deviceId.toString();
      totals[id] = (totals[id] || 0) + 1;
      return totals;
    }, {});

    await Puff.deleteMany({
      userId: req.user._id,
      timestamp: { $gte: startOfDay }
    });

    await Promise.all(Object.entries(countByDevice).map(async ([deviceId, count]) => {
      const coil = await Coil.findOne(
        { userId: req.user._id, deviceId, status: { $nin: ['expired'] } },
        null,
        { sort: { installedAt: -1 } }
      );
      if (!coil) return;
      coil.totalPuffs = Math.max(0, coil.totalPuffs - count);
      await coil.save();
    }));

    broadcastToUser(req.user._id.toString(), 'puff:reset', {
      resetAt: new Date(),
      count: todayPuffs.length
    });

    res.json({
      success: true,
      resetCount: todayPuffs.length,
      stats: {
        totalPuffs: 0,
        totalDuration: 0,
        totalNicotine: 0,
        totalLiquid: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get puff history with filters
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, deviceId, limit = 100, page = 1 } = req.query;

    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (deviceId) query.deviceId = deviceId;

    const limitNum = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 100));
    const pageNum = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [puffs, total] = await Promise.all([
      Puff.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('deviceId', 'name model'),
      Puff.countDocuments(query)
    ]);

    res.json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      puffs: puffs.map(p => ({
        id: p._id,
        deviceName: p.deviceId?.name,
        duration: p.duration,
        power: p.power,
        temperature: p.temperature,
        nicotineConsumed: p.nicotineConsumed,
        liquidConsumed: p.liquidConsumed,
        timestamp: p.timestamp
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get puff statistics
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const allowedPeriod = ['day', 'week', 'month'];
    const period = allowedPeriod.includes(String(req.query.period)) ? req.query.period : 'week';

    const now = new Date();
    let startDate;

    switch (period) {
      case 'day':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    const stats = await Puff.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalPuffs: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          avgDuration: { $avg: '$duration' },
          avgPower: { $avg: '$power' },
          avgTemp: { $avg: '$temperature' },
          totalNicotine: { $sum: '$nicotineConsumed' },
          totalLiquid: { $sum: '$liquidConsumed' },
          maxPower: { $max: '$power' },
          maxTemp: { $max: '$temperature' }
        }
      }
    ]);

    const result = stats[0] || {
      totalPuffs: 0,
      totalDuration: 0,
      avgDuration: 0,
      avgPower: 0,
      avgTemp: 0,
      totalNicotine: 0,
      totalLiquid: 0,
      maxPower: 0,
      maxTemp: 0
    };

    res.json({
      success: true,
      period,
      stats: {
        totalPuffs: result.totalPuffs,
        totalDuration: result.totalDuration.toFixed(1),
        avgDuration: result.avgDuration?.toFixed(1),
        avgPower: result.avgPower?.toFixed(1),
        avgTemp: result.avgTemp?.toFixed(0),
        totalNicotine: result.totalNicotine.toFixed(2),
        totalLiquid: result.totalLiquid.toFixed(2),
        maxPower: result.maxPower,
        maxTemp: result.maxTemp
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
