import { logger } from '../utils/logger.js';

class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log error
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode
    },
    req: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: req.user?._id
    }
  }, 'Error occurred');

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: messages
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = err.keyValue && Object.keys(err.keyValue).length > 0
      ? Object.keys(err.keyValue)[0]
      : undefined;
    return res.status(409).json({
      success: false,
      error: 'Duplicate field value',
      code: 'DUPLICATE_ERROR',
      ...(field ? { field } : {})
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid ${err.path}: ${err.value}`,
      code: 'CAST_ERROR'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Operational errors (trusted)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }

  // Programming or unknown errors
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
    code: 'INTERNAL_ERROR'
  });
};

export { errorHandler, AppError };
