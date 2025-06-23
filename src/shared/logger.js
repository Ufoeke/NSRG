const winston = require('winston');
const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Configure winston colors
winston.addColors(logColors);

// Create the logger configuration
const createLogger = () => {
  // Determine log level from environment
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  // Create formats
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, service, requestId, ...meta }) => {
      let logMessage = `${timestamp} [${level}]`;
      
      if (service) {
        logMessage += ` [${service}]`;
      }
      
      if (requestId) {
        logMessage += ` [${requestId}]`;
      }
      
      logMessage += `: ${message}`;
      
      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta)}`;
      }
      
      return logMessage;
    })
  );

  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Create transports
  const transports = [
    // Console transport (for Docker containers)
    new winston.transports.Console({
      level: logLevel,
      format: consoleFormat,
    })
  ];

  // Add file transports if not in Docker (when logs directory exists)
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    const fs = require('fs');
    if (fs.existsSync(logsDir) || process.env.NODE_ENV !== 'production') {
      // Ensure logs directory exists
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      transports.push(
        // General log file
        new winston.transports.File({
          filename: path.join(logsDir, 'app.log'),
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        
        // Error log file
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );
    }
  } catch (err) {
    // Silently continue without file logging if there are issues
    console.warn('File logging disabled:', err.message);
  }

  return winston.createLogger({
    levels: logLevels,
    transports,
    // Handle uncaught exceptions
    exceptionHandlers: [
      new winston.transports.Console({
        format: consoleFormat
      })
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
      new winston.transports.Console({
        format: consoleFormat
      })
    ]
  });
};

// Create the main logger instance
const logger = createLogger();

// Enhanced logging methods with context support
const createContextualLogger = (service, requestId = null) => {
  return {
    error: (message, meta = {}) => logger.error(message, { service, requestId, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { service, requestId, ...meta }),
    info: (message, meta = {}) => logger.info(message, { service, requestId, ...meta }),
    http: (message, meta = {}) => logger.http(message, { service, requestId, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { service, requestId, ...meta }),
  };
};

// Request-specific logger factory
const createRequestLogger = (requestId, service = 'intelligence-engine') => {
  return createContextualLogger(service, requestId);
};

// Service-specific logger factory
const createServiceLogger = (serviceName) => {
  return createContextualLogger(serviceName);
};

// Export the logger and factory functions
module.exports = {
  // Main logger instance methods
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => logger.http(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  
  // Factory functions
  createContextualLogger,
  createRequestLogger,
  createServiceLogger,
  
  // Log levels for reference
  levels: logLevels,
  
  // Direct access to winston logger instance
  winston: logger,
  
  // Middleware for Express.js
  expressMiddleware: () => {
    return (req, res, next) => {
      const start = Date.now();
      const requestId = req.headers['x-request-id'] || 
                       req.headers['request-id'] || 
                       `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      req.logger = createRequestLogger(requestId, 'http');
      req.requestId = requestId;
      
      // Log the incoming request
      req.logger.http(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('content-length')
      });
      
      // Log the response when it finishes
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - start;
        req.logger.http(`${req.method} ${req.originalUrl} - ${res.statusCode}`, {
          duration: `${duration}ms`,
          contentLength: data ? data.length : 0
        });
        originalSend.call(this, data);
      };
      
      next();
    };
  }
}; 