import Joi from 'joi';
import { AppError } from './errorHandler.js';

export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const details = error.details.map(d => ({
        field: d.path[0],
        message: d.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details
      });
    }

    next();
  };
};

// Common schemas
export const schemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(100).required()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  puffRecord: Joi.object({
    deviceId: Joi.string().hex().length(24).required(),
    duration: Joi.number().min(0).max(30).default(2),
    power: Joi.number().min(5).max(100).default(20),
    temperature: Joi.number().min(100).max(400).default(200)
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().min(10).max(4096).required()
  }),

  cloudSyncTrigger: Joi.object({
    type: Joi.string().valid('settings', 'data', 'backup', 'full').default('full')
  }),

  deviceCreate: Joi.object({
    name: Joi.string().min(1).max(50).required(),
    model: Joi.string().required(),
    serialNumber: Joi.string().required()
  }),

  flavorCreate: Joi.object({
    name: Joi.string().min(1).max(50).required(),
    blend: Joi.string().valid('50/50', '60/40', '70/30', '80/20', 'Max VG').required(),
    nicotineStrength: Joi.number().min(0).max(50).required(),
    totalCapacity: Joi.number().min(10).max(100).default(50),
    icon: Joi.string().max(10).default('💨'),
    deviceId: Joi.string().hex().length(24).optional()
  }),

  goalCreate: Joi.object({
    type: Joi.string().valid('nicotine_reduction', 'puff_limit', 'coil_life').required(),
    targetValue: Joi.number().required(),
    startValue: Joi.number().required(),
    deadline: Joi.date().iso().required()
  }),

  settingsUpdate: Joi.object({
    notifications: Joi.boolean(),
    childLock: Joi.boolean(),
    healthMode: Joi.boolean(),
    darkMode: Joi.boolean(),
    puffLimit: Joi.number().min(50).max(1000),
    sessionTimeout: Joi.number().min(5).max(120)
  })
};
