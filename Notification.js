import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'coil_warning',
      'battery_low',
      'puff_limit_reached',
      'goal_milestone',
      'goal_completed',
      'device_found',
      'liquid_low',
      'nicotine_alert',
      'system'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  // Action
  actionUrl: {
    type: String,
    default: null
  },
  actionLabel: {
    type: String,
    default: null
  },
  // Related entities
  relatedDeviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    default: null
  },
  relatedGoalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    default: null
  }
}, {
  timestamps: true
});

// Index for unread notifications
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
