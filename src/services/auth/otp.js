const crypto = require('crypto');
const { OTP_LENGTH, OTP_EXPIRY_MINUTES } = require('../../config/auth');

/**
 * Generate random OTP code
 * @param {number} length - Length of OTP code (default from config)
 * @returns {string} OTP code
 */
function generateOTP(length = OTP_LENGTH) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

/**
 * Generate OTP expiry timestamp
 * @returns {string} ISO 8601 timestamp
 */
function getOTPExpiry() {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
  return expiry.toISOString();
}

module.exports = { generateOTP, getOTPExpiry };

