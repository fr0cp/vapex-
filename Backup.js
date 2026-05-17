const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['settings', 'full', 'devices', 'history'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  size: {
    type: Number, // bytes
    default: 0
  },
  checksum: {
    type: String,
    default: null
  },
  storageProvider: {
    type: String,
    enum: ['local', 's3', 'gcs', 'azure'],
    default: 'local'
  },
  storageUrl: {
    type: String,
    default: null
  },
  isEncrypted: {
    type: Boolean,
    default: true
  },
  restoredAt: {
    type: Date,
    default: null
  },
  restoreCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Backup', backupSchema);
