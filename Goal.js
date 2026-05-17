import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['nicotine_reduction', 'puff_limit', 'coil_life', 'liquid_saving', 'session_time'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  // Progress tracking
  startValue: {
    type: Number,
    required: true
  },
  currentValue: {
    type: Number,
    required: true
  },
  targetValue: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    default: ''
  },
  // Timeline
  startedAt: {
    type: Date,
    default: Date.now
  },
  deadline: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'failed', 'paused'],
    default: 'active'
  },
  // Steps/Milestones
  steps: [{
    value: Number,
    label: String,
    completed: { type: Boolean, default: false },
    completedAt: Date
  }],
  // Notifications
  notifyOnMilestone: {
    type: Boolean,
    default: true
  },
  notifyOnComplete: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for progress percentage
goalSchema.virtual('progress').get(function() {
  const total = Math.abs(this.startValue - this.targetValue);
  const current = Math.abs(this.startValue - this.currentValue);
  if (total === 0) return 100;
  return Math.min(100, Math.round((current / total) * 100));
});

// Virtual for days active
goalSchema.virtual('daysActive').get(function() {
  return Math.floor((Date.now() - this.startedAt) / (1000 * 60 * 60 * 24));
});

// Virtual for amount saved/reduced
goalSchema.virtual('amountChanged').get(function() {
  return Math.abs(this.startValue - this.currentValue);
});

// Check if goal is on track
goalSchema.virtual('isOnTrack').get(function() {
  if (!this.deadline) return true;
  const totalDays = (this.deadline - this.startedAt) / (1000 * 60 * 60 * 24);
  const elapsedDays = (Date.now() - this.startedAt) / (1000 * 60 * 60 * 24);
  const expectedProgress = elapsedDays / totalDays;
  return (this.progress / 100) >= expectedProgress;
});

export const Goal = mongoose.model('Goal', goalSchema);
