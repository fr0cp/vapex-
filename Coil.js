import mongoose from 'mongoose';

const coilSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['mesh', 'round_wire', 'clapton', 'fused_clapton', 'alien'],
    default: 'mesh'
  },
  resistance: {
    type: Number,
    default: 0.5
  },
  material: {
    type: String,
    enum: ['kanthal', 'nichrome', 'stainless_steel', 'titanium'],
    default: 'mesh'
  },
  // Life tracking
  totalPuffs: {
    type: Number,
    default: 0
  },
  maxPuffs: {
    type: Number,
    default: 5000
  },
  lifePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  daysUsed: {
    type: Number,
    default: 0
  },
  installedAt: {
    type: Date,
    default: Date.now
  },
  // Status
  status: {
    type: String,
    enum: ['new', 'good', 'fair', 'needs_replacement', 'expired'],
    default: 'new'
  },
  // Warnings
  warningThreshold: {
    type: Number,
    default: 30 // percentage
  },
  lastWarningAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Pre-save hook to calculate life percentage
coilSchema.pre('save', function(next) {
  this.lifePercentage = Math.max(0, Math.round((1 - this.totalPuffs / this.maxPuffs) * 100));

  // Update status based on life
  if (this.lifePercentage > 70) this.status = 'good';
  else if (this.lifePercentage > 40) this.status = 'fair';
  else if (this.lifePercentage > 10) this.status = 'needs_replacement';
  else this.status = 'expired';

  next();
});

// Virtual for days remaining
coilSchema.virtual('daysRemaining').get(function() {
  const avgDailyPuffs = 142;
  const remainingPuffs = (this.lifePercentage / 100) * this.maxPuffs;
  return Math.max(0, Math.round(remainingPuffs / avgDailyPuffs));
});

// Virtual for estimated replacement date
coilSchema.virtual('estimatedReplacementDate').get(function() {
  const daysLeft = this.daysRemaining;
  const date = new Date();
  date.setDate(date.getDate() + daysLeft);
  return date;
});

export const Coil = mongoose.model('Coil', coilSchema);
