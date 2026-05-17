const mongoose = require('mongoose');

const puffSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  puffs: [{
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 2 }, // seconds
    power: { type: Number, default: 20 }, // watts
    temperature: { type: Number, default: 200 }, // celsius
    volume: { type: Number, default: 15 }, // ml vapor
    nicotine: { type: Number, default: 0.018 } // mg
  }],
  totalPuffs: {
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
  flavor: {
    name: String,
    blend: String,
    nicotineStrength: Number
  },
  smartMode: {
    type: String,
    enum: ['eco', 'flavor', 'cloud', 'stealth', 'auto']
  },
  location: {
    name: String,
    lat: Number,
    lng: Number
  }
}, {
  timestamps: true
});

// Indexes for analytics queries
puffSessionSchema.index({ user: 1, startTime: -1 });
puffSessionSchema.index({ device: 1, startTime: -1 });
puffSessionSchema.index({ user: 1, 'puffs.timestamp': -1 });

// Pre-save hook to calculate totals
puffSessionSchema.pre('save', function(next) {
  this.totalPuffs = this.puffs.length;
  this.totalNicotine = this.puffs.reduce((sum, p) => sum + (p.nicotine || 0), 0);
  this.totalLiquid = this.puffs.reduce((sum, p) => sum + (p.volume || 0) * 0.002, 0); // approx ml per puff
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / 1000);
  }
  next();
});

// Static method for daily stats
puffSessionSchema.statics.getDailyStats = async function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const sessions = await this.find({
    user: userId,
    startTime: { $gte: startOfDay, $lte: endOfDay }
  });

  return {
    date: startOfDay,
    totalPuffs: sessions.reduce((sum, s) => sum + s.totalPuffs, 0),
    totalNicotine: sessions.reduce((sum, s) => sum + s.totalNicotine, 0),
    totalLiquid: sessions.reduce((sum, s) => sum + s.totalLiquid, 0),
    totalSessions: sessions.length,
    totalDuration: sessions.reduce((sum, s) => sum + s.duration, 0),
    avgPuffsPerSession: sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.totalPuffs, 0) / sessions.length 
      : 0
  };
};

// Static method for weekly comparison
puffSessionSchema.statics.getWeeklyStats = async function(userId, endDate) {
  const days = [];
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const stats = await this.getDailyStats(userId, date);
    days.push({
      day: dayNames[date.getDay()],
      date: date,
      puffs: stats.totalPuffs,
      isToday: i === 0
    });
  }

  return days;
};

module.exports = mongoose.model('PuffSession', puffSessionSchema);
