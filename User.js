import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  avatar: {
    type: String,
    default: ''
  },
  memberSince: {
    type: Date,
    default: Date.now
  },
  preferences: {
    notifications: { type: Boolean, default: true },
    childLock: { type: Boolean, default: true },
    healthMode: { type: Boolean, default: true },
    darkMode: { type: Boolean, default: true },
    language: { type: String, default: 'en' }
  },
  devices: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device'
    }],
    default: []
  },
  cloudSync: {
    enabled: { type: Boolean, default: true },
    lastSync: { type: Date, default: null },
    backupEnabled: { type: Boolean, default: true }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for member duration
userSchema.virtual('memberDuration').get(function() {
  return Math.floor((Date.now() - this.memberSince) / (1000 * 60 * 60 * 24));
});

export const User = mongoose.model('User', userSchema);
