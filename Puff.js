import mongoose from 'mongoose';

const puffSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  // Puff metrics
  duration: {
    type: Number, // seconds
    min: 0,
    max: 30,
    default: 2
  },
  power: {
    type: Number, // watts
    min: 5,
    max: 100,
    default: 20
  },
  temperature: {
    type: Number, // celsius
    min: 100,
    max: 400,
    default: 200
  },
  resistance: {
    type: Number, // ohms
    default: 0.5
  },
  voltage: {
    type: Number,
    default: 3.7
  },
  // Consumption
  nicotineConsumed: {
    type: Number, // mg
    default: 0
  },
  liquidConsumed: {
    type: Number, // ml
    default: 0
  },
  // Session info
  sessionId: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for analytics
puffSchema.index({ userId: 1, timestamp: -1 });
puffSchema.index({ deviceId: 1, timestamp: -1 });
puffSchema.index({ userId: 1, sessionId: 1 });

// Static method for daily stats
puffSchema.statics.getDailyStats = async function(userId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: null,
        totalPuffs: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        avgPower: { $avg: '$power' },
        avgTemp: { $avg: '$temperature' },
        totalNicotine: { $sum: '$nicotineConsumed' },
        totalLiquid: { $sum: '$liquidConsumed' },
        sessions: { $addToSet: '$sessionId' }
      }
    }
  ]);

  return stats[0] || {
    totalPuffs: 0,
    totalDuration: 0,
    avgPower: 0,
    avgTemp: 0,
    totalNicotine: 0,
    totalLiquid: 0,
    sessions: []
  };
};

// Static method for weekly comparison
puffSchema.statics.getWeeklyComparison = async function(userId) {
  const now = new Date();
  const days = [];
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const count = await this.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      timestamp: { $gte: start, $lte: end }
    });

    days.push({
      day: dayNames[date.getDay()],
      date: date.toISOString().split('T')[0],
      puffs: count,
      isToday: i === 0
    });
  }

  return days;
};

export const Puff = mongoose.model('Puff', puffSchema);
