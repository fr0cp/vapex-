/**
 * VAPEX Backend Utilities
 */

// Generate unique device ID
export const generateDeviceId = () => {
  return 'vapex_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Format nicotine consumption
export const formatNicotine = (mg) => {
  return `${mg.toFixed(1)}mg`;
};

// Calculate coil life percentage
export const calculateCoilLife = (totalPuffs, maxPuffs = 5000) => {
  return Math.max(0, Math.round((1 - totalPuffs / maxPuffs) * 100));
};

// Estimate coil days remaining
export const estimateCoilDays = (coilLife, dailyPuffs = 142) => {
  const maxPuffs = 5000;
  const remainingPuffs = (coilLife / 100) * maxPuffs;
  return Math.max(0, Math.round(remainingPuffs / dailyPuffs));
};

// Calculate battery drain rate
export const calculateDrainRate = (puffsPerHour, powerMode = 'eco') => {
  const baseDrain = 8; // % per hour base
  const modeMultipliers = {
    eco: 0.8,
    flavor: 1.0,
    cloud: 1.4,
    stealth: 0.6,
    auto: 1.0
  };
  return (baseDrain * (modeMultipliers[powerMode] || 1.0) * (puffsPerHour / 20)).toFixed(1);
};

// Generate JWT token payload
export const generateTokenPayload = (user) => ({
  userId: user._id,
  email: user.email,
  name: user.name,
  iat: Math.floor(Date.now() / 1000)
});

// Sanitize user data for response
export const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  memberSince: user.memberSince,
  preferences: user.preferences,
  devices: user.devices
});

// Validate email format
export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// Calculate puff statistics
export const calculatePuffStats = (puffs, period = 'week') => {
  const now = new Date();
  const periodMap = {
    day: 1,
    week: 7,
    month: 30
  };
  const days = periodMap[period] || 7;
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);

  const periodPuffs = puffs.filter(p => new Date(p.timestamp) >= cutoff);
  const total = periodPuffs.length;
  const avgPerDay = total / days;

  return {
    total,
    average: Math.round(avgPerDay),
    trend: total > (avgPerDay * days * 0.8) ? 'up' : 'down'
  };
};

// Smart mode power settings
export const SMART_MODES = {
  eco: { power: 0.8, label: 'Eco Mode', desc: 'Reduces power by 20% to save battery' },
  flavor: { power: 1.0, label: 'Flavor Boost', desc: 'Optimal temperature for maximum flavor' },
  cloud: { power: 1.3, label: 'Cloud Chaser', desc: 'Maximum vapor production' },
  stealth: { power: 0.5, label: 'Stealth Mode', desc: 'Minimal vapor, discreet usage' },
  auto: { power: 1.0, label: 'Auto Smart', desc: 'AI adjusts based on your usage pattern' }
};

// Time formatting
export const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval}${unit.charAt(0)} ago`;
    }
  }
  return 'just now';
};

