import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  // Timing
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // minutes
    default: 0
  },
  // Stats
  puffCount: {
    type: Number,
    default: 0
  },
  totalNicotine: {
    type: Number,
    default: 0
  },
  totalLiquid: {
    type: Number,
    default: 0
  },
  avgPower: {
    type: Number,
    default: 0
  },
  avgTemperature: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'timeout', 'aborted'],
    default: 'active'
  },
  // Location
  location: {
    name: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  }
}, {
  timestamps: true
});

// Index for active sessions lookup
sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ deviceId: 1, status: 1 });

export const Session = mongoose.model('Session', sessionSchema);
