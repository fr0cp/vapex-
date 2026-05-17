import express from 'express';
import { Puff } from '../models/Puff.js';
import { Device } from '../models/Device.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Weekly comparison chart data
router.get('/weekly', authenticate, async (req, res, next) => {
  try {
    const weeklyData = await Puff.getWeeklyComparison(req.user._id);

    const totalPuffs = weeklyData.reduce((sum, d) => sum + d.puffs, 0);
    const avgPuffs = Math.round(totalPuffs / 7);
    const todayPuffs = weeklyData[6]?.puffs || 0;
    const diff = todayPuffs - avgPuffs;

    res.json({
      success: true,
      data: {
        chart: weeklyData,
        summary: {
          today: todayPuffs,
          average: avgPuffs,
          total: totalPuffs,
          difference: Math.abs(diff),
          trend: diff >= 0 ? 'up' : 'down'
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Battery analytics
router.get('/battery', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id });

    const analytics = devices.map(device => {
      const drainRate = device.batteryDrainRate;
      const estimatedLife = device.estimatedBatteryLife;
      const health = device.batteryHealth;

      return {
        deviceId: device._id,
        deviceName: device.name,
        batteryLevel: device.batteryLevel,
        chargeCycles: device.chargeCycles,
        health: `${health}%`,
        drainRate: `${drainRate}%/h`,
        estimatedLife,
        isCharging: device.isCharging,
        lastCharged: device.lastSeen // Approximation
      };
    });

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    next(error);
  }
});

// Nicotine consumption analytics
router.get('/nicotine', authenticate, async (req, res, next) => {
  try {
    const now = new Date();

    // Today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStats = await Puff.getDailyStats(req.user._id, now);

    // This week
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const weekStats = await Puff.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$nicotineConsumed' }
        }
      }
    ]);

    // This month
    const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const monthStats = await Puff.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: monthStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$nicotineConsumed' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        today: todayStats.totalNicotine.toFixed(1),
        week: (weekStats[0]?.total || 0).toFixed(1),
        month: (monthStats[0]?.total || 0).toFixed(1),
        dailyLimit: 5.0, // mg
        percentageOfLimit: Math.min(100, (todayStats.totalNicotine / 5.0) * 100).toFixed(1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Liquid consumption analytics
router.get('/liquid', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [todayStats, weekStats, monthStats] = await Promise.all([
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
      Puff.aggregate([
        {
          $match: {
            userId: req.user._id,
            timestamp: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        { $group: { _id: null, total: { $sum: '$liquidConsumed' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        today: todayStats.totalLiquid.toFixed(1),
        week: (weekStats[0]?.total || 0).toFixed(1),
        month: (monthStats[0]?.total || 0).toFixed(1),
        averagePerDay: (todayStats.totalLiquid).toFixed(1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Hourly usage pattern
router.get('/hourly', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const hourlyData = await Puff.aggregate([
      {
        $match: {
          userId: req.user._id,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing hours
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hourData = hourlyData.find(h => h._id === i);
      return {
        hour: i,
        label: `${i}:00`,
        puffs: hourData?.count || 0,
        avgDuration: hourData?.avgDuration?.toFixed(1) || 0
      };
    });

    res.json({
      success: true,
      data: hours
    });
  } catch (error) {
    next(error);
  }
});

// Device usage comparison
router.get('/devices', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id });

    const deviceStats = await Promise.all(
      devices.map(async (device) => {
        const stats = await Puff.aggregate([
          {
            $match: {
              userId: req.user._id,
              deviceId: device._id,
              timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              totalPuffs: { $sum: 1 },
              totalNicotine: { $sum: '$nicotineConsumed' },
              totalLiquid: { $sum: '$liquidConsumed' },
              avgPower: { $avg: '$power' }
            }
          }
        ]);

        const stat = stats[0] || {
          totalPuffs: 0,
          totalNicotine: 0,
          totalLiquid: 0,
          avgPower: 0
        };

        return {
          deviceId: device._id,
          deviceName: device.name,
          totalPuffs: stat.totalPuffs,
          totalNicotine: stat.totalNicotine.toFixed(2),
          totalLiquid: stat.totalLiquid.toFixed(2),
          avgPower: stat.avgPower?.toFixed(1) || 0,
          batteryHealth: device.batteryHealth,
          status: device.status
        };
      })
    );

    res.json({
      success: true,
      devices: deviceStats
    });
  } catch (error) {
    next(error);
  }
});

export default router;
