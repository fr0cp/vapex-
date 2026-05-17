import { body, param, query, validationResult } from 'express-validator';

export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      messages: errors.array().map(e => e.msg)
    });
  };
};

// Common validators
export const validators = {
  email: body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  password: body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  name: body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  deviceId: param('deviceId').isMongoId().withMessage('Valid device ID required'),
  puffCount: body('puffCount').isInt({ min: 1, max: 100 }).withMessage('Puff count must be 1-100'),
  nicotineStrength: body('nicotineStrength').isFloat({ min: 0, max: 50 }).withMessage('Nicotine strength 0-50mg'),
  liquidVolume: body('volume').isFloat({ min: 0, max: 120 }).withMessage('Volume 0-120ml'),
  goalType: body('type').isIn(['nicotine_reduction', 'puff_limit', 'liquid_limit', 'cost_limit', 'days_clean']),
  smartMode: body('mode').isIn(['eco', 'flavor', 'cloud', 'stealth', 'auto']),
  date: query('date').optional().isISO8601().withMessage('Valid date required'),
  limit: query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit 1-100')
};
