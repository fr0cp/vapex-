import mongoose from 'mongoose';

const flavorSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true
  },
  blend: {
    type: String,
    enum: ['50/50', '60/40', '70/30', '80/20', 'Max VG'],
    default: '50/50'
  },
  nicotineStrength: {
    type: Number, // mg/ml
    min: 0,
    max: 50,
    required: true
  },
  remaining: {
    type: Number, // ml
    min: 0,
    default: 50
  },
  totalCapacity: {
    type: Number,
    min: 10,
    max: 100,
    default: 50
  },
  icon: {
    type: String,
    default: '💨'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual for percentage remaining
flavorSchema.virtual('percentage').get(function() {
  return Math.round((this.remaining / this.totalCapacity) * 100);
});

// Virtual for days remaining estimate
flavorSchema.virtual('daysRemaining').get(function() {
  const avgDailyConsumption = 4.2; // ml per day
  return Math.round(this.remaining / avgDailyConsumption);
});

export const Flavor = mongoose.model('Flavor', flavorSchema);
