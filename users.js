import express from 'express';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { Notification } from '../models/Notification.js';
import { Puff } from '../models/Puff.js';
import { Flavor } from '../models/Flavor.js';
import { Goal } from '../models/Goal.js';
import { Coil } from '../models/Coil.js';
import { CloudSync } from '../models/CloudSync.js';
import { Session } from '../models/Session.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const deviceCount = await Device.countDocuments({ userId: req.user._id });
    const unreadNotifications = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        memberSince: user.memberSince,
        memberDuration: user.memberDuration,
        preferences: user.preferences,
        stats: {
          deviceCount,
          unreadNotifications
        }
      }
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

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true }
    );

    res.json({
      success: true,
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get notifications
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const { unreadOnly = false, limit = 20, page = 1 } = req.query;

    const query = { userId: req.user._id };
    if (unreadOnly === 'true') query.isRead = false;

    const limitNum = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 20));
    const pageNum = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId: req.user._id, isRead: false })
    ]);

    res.json({
      success: true,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      notifications: notifications.map(n => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        priority: n.priority,
        isRead: n.isRead,
        createdAt: n.createdAt,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Mark all notifications as read (must be before `/:notificationId/read`)
router.patch('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.patch('/notifications/:notificationId/read', authenticate, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, userId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }

    res.json({ success: true, notification: { id: notification._id, isRead: true } });
  } catch (error) {
    next(error);
  }
});

// Delete account
router.delete('/account', authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    const isValid = await user.comparePassword(password);

    if (!isValid) {
      throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
    }

    // Delete all user data
    await Promise.all([
      Device.deleteMany({ userId: req.user._id }),
      Puff.deleteMany({ userId: req.user._id }),
      Flavor.deleteMany({ userId: req.user._id }),
      Goal.deleteMany({ userId: req.user._id }),
      Coil.deleteMany({ userId: req.user._id }),
      CloudSync.deleteMany({ userId: req.user._id }),
      Notification.deleteMany({ userId: req.user._id }),
      Session.deleteMany({ userId: req.user._id })
    ]);
    await User.findByIdAndDelete(req.user._id);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
