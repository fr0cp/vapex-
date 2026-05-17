const mongoose = require('mongoose');

const liquidSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  brand: {
    type: String,
    default: 'Unknown'
  },
  flavor: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: '🧊'
  },
  blend: {
    type: String,
    enum: ['50/50', '60/40', '70/30', '80/20', 'Max VG'],
    default: '50/50'
  },
  nicotineStrength: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  },
  volume: {
    total: { type: Number, required: true }, // ml
    remaining: { type: Number, required: true },
    consumed: { type: Number, default: 0 }
  },
  tankCapacity: {
    type: Number,
    default: 5 // ml
  },
  consumption: {
    daily: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

liquidSchema.methods.consume = async function(amount) {
  this.volume.remaining = Math.max(0, this.volume.remaining - amount);
  this.volume.consumed += amount;
  this.consumption.daily += amount;
  this.consumption.weekly += amount;
  this.consumption.monthly += amount;
  return this.save();
};

liquidSchema.methods.getPercentage = function() {
  return Math.round((this.volume.remaining / this.volume.total) * 100);
};

liquidSchema.methods.resetDaily = function() {
  this.consumption.daily = 0;
};

liquidSchema.methods.resetWeekly = function() {
  this.consumption.weekly = 0;
};

liquidSchema.methods.resetMonthly = function() {
  this.consumption.monthly = 0;
};

module.exports = mongoose.model('ELiquid', liquidSchema);
