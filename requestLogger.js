import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = (req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?._id
    };

    if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with error');
    } else {
      logger.debug(logData, 'Request completed');
    }
  });

  next();
};
