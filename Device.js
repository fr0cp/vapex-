import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coordinates: {
    lat: Number,
    lng: Number
  },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true
  },
  serialNumber: {
    type: String,
    required: true,
    unique: true
  },
  firmwareVersion: {
    type: String,
    default: '1.0.0'
  },
  // Battery
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  batteryHealth: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  chargeCycles: {
    type: Number,
    default: 0
  },
  isCharging: {
    type: Boolean,
    default: false
  },
  // Status
  status: {
    type: String,
    enum: ['online', 'offline', 'sleeping', 'error'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // Location
  location: {
    name: { type: String, default: 'Unknown' },
    lastUpdated: { type: Date, default: Date.now }
  },
  locationHistory: [locationSchema],
  // Settings
  settings: {
    puffLimit: { type: Number, default: 200 },
    sessionTimeout: { type: Number, default: 30 },
    autoLock: { type: Boolean, default: true },
    ledBrightness: { type: Number, min: 0, max: 100, default: 80 },
    vibration: { type: Boolean, default: true }
  },
  // Smart Mode
  currentMode: {
    type: String,
    enum: ['eco', 'flavor', 'cloud', 'stealth', 'auto'],
    default: 'eco'
  },
  // Security
  childLockEnabled: {
    type: Boolean,
    default: true
  },
  pinCode: {
    type: String,
    default: null
  },
  // Connection
  bluetoothId: {
    type: String,
    default: null
  },
  wifiConnected: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for device queries
deviceSchema.index({ userId: 1, status: 1 });
// serialNumber index is defined via unique:true in the schema field above

// Virtual for battery drain rate
deviceSchema.virtual('batteryDrainRate').get(function() {
  const modeMultipliers = { eco: 0.8, flavor: 1.0, cloud: 1.4, stealth: 0.6, auto: 1.0 };
  const baseDrain = 12;
  return Math.round(baseDrain * (modeMultipliers[this.currentMode] || 1.0));
});

// Virtual for estimated battery life
deviceSchema.virtual('estimatedBatteryLife').get(function() {
  if (this.batteryLevel <= 0) return '0h';
  const drainRate = this.batteryDrainRate;
  const hours = Math.round((this.batteryLevel / drainRate) * 10) / 10;
  return `${hours}h`;
});

export const Device = mongoose.model('Device', deviceSchema);
