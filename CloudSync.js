import mongoose from 'mongoose';

const cloudSyncSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['settings', 'data', 'backup', 'full'],
    required: true
  },
  // Sync details
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  dataSize: {
    type: Number, // bytes
    default: 0
  },
  recordsSynced: {
    type: Number,
    default: 0
  },
  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  // Error handling
  errorMessage: {
    type: String,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  },
  // Device info
  deviceInfo: {
    platform: String,
    version: String,
    deviceId: String
  }
}, {
  timestamps: true
});

export const CloudSync = mongoose.model('CloudSync', cloudSyncSchema);
