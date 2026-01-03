const fs = require('fs');
const path = require('path');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE || 'logs/app.log';
const LOG_ERROR_FILE = process.env.LOG_ERROR_FILE || 'logs/error.log';

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function writeLog(level, message, data, isError = false) {
  const logEntry = {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  const logLine = JSON.stringify(logEntry) + '\n';
  const logFile = isError ? LOG_ERROR_FILE : LOG_FILE;

  // Write to file (async, don't block)
  fs.appendFile(logFile, logLine, (err) => {
    if (err) {
      console.error('Failed to write log:', err);
    }
  });

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console[level](logEntry);
  }
}

const logger = {
  info: (message, data) => {
    if (['info', 'warn', 'error'].includes(LOG_LEVEL)) {
      writeLog('info', message, data);
    }
  },
  warn: (message, data) => {
    if (['warn', 'error'].includes(LOG_LEVEL)) {
      writeLog('warn', message, data);
    }
  },
  error: (message, data) => {
    writeLog('error', message, data, true);
  },
  /**
   * Log error with request context
   * @param {string} message - Error message
   * @param {object} errorData - Error data (error object, context, etc.)
   */
  errorWithContext: (message, errorData) => {
    writeLog('error', message, errorData, true);
  },
};

module.exports = { logger };


