/**
 * Authentication configuration
 * Loads configuration from environment variables with sensible defaults
 */

module.exports = {
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be set in production');
    }
    return 'dev-secret-change-in-production';
  })(),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || (() => {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET must be set in production');
    }
    return 'dev-refresh-secret-change-in-production';
  })(),
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  // Password Configuration
  PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH || '6', 10),
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),

  // Verification Configuration
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || '6', 10),
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  RESET_TOKEN_EXPIRY_HOURS: parseInt(process.env.RESET_TOKEN_EXPIRY_HOURS || '1', 10),

  // SMS/WhatsApp Configuration
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'twilio', // 'twilio', 'aws-sns', 'messagebird'
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED === 'true',
  WHATSAPP_PHONE_NUMBER: process.env.WHATSAPP_PHONE_NUMBER, // Twilio WhatsApp number

  // Rate Limiting (for auth endpoints)
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5', 10), // 5 requests per window

  // Account Deletion
  ACCOUNT_DELETION_RETENTION_DAYS: parseInt(process.env.ACCOUNT_DELETION_RETENTION_DAYS || '30', 10),
};

