import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { Device } from '../models/Device.js';
import { Coil } from '../models/Coil.js';
import { Goal } from '../models/Goal.js';
import { Notification } from '../models/Notification.js';
import { Puff } from '../models/Puff.js';
import { broadcastToUser } from './websocket.js';

export const startCronJobs = () => {
  // Check device status every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const offlineDevices = await Device.find({
        lastSeen: { $lt: fiveMinutesAgo },
        status: 'online'
      });

      for (const device of offlineDevices) {
        await Device.findByIdAndUpdate(device._id, { status: 'offline' });

        broadcastToUser(device.userId.toString(), 'device:offline', {
          deviceId: device._id,
          name: device.name,
          lastSeen: device.lastSeen
        });
      }

      logger.info(`Marked ${offlineDevices.length} devices as offline`);
    } catch (error) {
      logger.error({ error }, 'Device status check failed');
    }
  });

  // Daily coil life check (at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const coils = await Coil.find({ status: { $in: ['good', 'fair', 'needs_replacement'] } });

      for (const coil of coils) {
        // Increment days used
        coil.daysUsed += 1;
        await coil.save();

        // Check if warning needed
        if (coil.lifePercentage <= coil.warningThreshold && !coil.lastWarningAt) {
          await Notification.create({
            userId: coil.userId,
            type: 'coil_warning',
            title: 'Coil Replacement Needed',
            message: `Your coil is at ${coil.lifePercentage}% life. Replace soon for best performance.`,
            priority: coil.lifePercentage < 15 ? 'urgent' : 'high',
            relatedDeviceId: coil.deviceId
          });

          coil.lastWarningAt = new Date();
          await coil.save();

          broadcastToUser(coil.userId.toString(), 'notification:coil_warning', {
            coilId: coil._id,
            lifePercentage: coil.lifePercentage,
            daysRemaining: coil.daysRemaining
          });
        }
      }

      logger.info(`Checked ${coils.length} coils for maintenance`);
    } catch (error) {
      logger.error({ error }, 'Coil maintenance check failed');
    }
  });

  // Daily goal progress check
  cron.schedule('0 9 * * *', async () => { // 9 AM daily
    try {
      const activeGoals = await Goal.find({ status: 'active' });

      for (const goal of activeGoals) {
        // Check if goal is on track
        if (!goal.isOnTrack) {
          await Notification.create({
            userId: goal.userId,
            type: 'goal_milestone',
            title: 'Goal Progress Alert',
            message: `Your goal "${goal.title}" is falling behind schedule.`,
            priority: 'normal',
            relatedGoalId: goal._id
          });

          broadcastToUser(goal.userId.toString(), 'notification:goal_alert', {
            goalId: goal._id,
            title: goal.title,
            progress: goal.progress
          });
        }

        // Check if goal is completed
        if (goal.progress >= 100 && !goal.completedAt) {
          goal.status = 'completed';
          goal.completedAt = new Date();
          await goal.save();

          await Notification.create({
            userId: goal.userId,
            type: 'goal_completed',
            title: 'Goal Achieved! 🎉',
            message: `Congratulations! You've completed "${goal.title}".`,
            priority: 'high',
            relatedGoalId: goal._id
          });

          broadcastToUser(goal.userId.toString(), 'notification:goal_completed', {
            goalId: goal._id,
            title: goal.title
          });
        }
      }

      logger.info(`Checked ${activeGoals.length} goals`);
    } catch (error) {
      logger.error({ error }, 'Goal check failed');
    }
  });

  // Battery low check every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const lowBatteryDevices = await Device.find({
        batteryLevel: { $lte: 20 },
        status: 'online',
        isCharging: false
      });

      for (const device of lowBatteryDevices) {
        const existingNotification = await Notification.findOne({
          userId: device.userId,
          type: 'battery_low',
          relatedDeviceId: device._id,
          createdAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } // Last 4 hours
        });

        if (!existingNotification) {
          await Notification.create({
            userId: device.userId,
            type: 'battery_low',
            title: 'Low Battery',
            message: `${device.name} battery is at ${device.batteryLevel}%. Please charge soon.`,
            priority: device.batteryLevel <= 10 ? 'urgent' : 'high',
            relatedDeviceId: device._id
          });

          broadcastToUser(device.userId.toString(), 'notification:battery_low', {
            deviceId: device._id,
            batteryLevel: device.batteryLevel
          });
        }
      }

      logger.info(`Checked ${lowBatteryDevices.length} devices for low battery`);
    } catch (error) {
      logger.error({ error }, 'Battery check failed');
    }
  });

  // Daily analytics aggregation (at 1 AM)
  cron.schedule('0 1 * * *', async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Aggregate daily stats for all users
      const users = await Device.distinct('userId');

      for (const userId of users) {
        const dailyStats = await Puff.getDailyStats(userId, yesterday);
        logger.info({ userId, stats: dailyStats }, 'Daily stats aggregated');
      }

      logger.info('Daily analytics aggregation completed');
    } catch (error) {
      logger.error({ error }, 'Daily analytics aggregation failed');
    }
  });

  logger.info('Cron jobs scheduled');
};
