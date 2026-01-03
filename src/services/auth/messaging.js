const { logger } = require('../logger');
const {
  SMS_PROVIDER,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  WHATSAPP_ENABLED,
  WHATSAPP_PHONE_NUMBER,
} = require('../../config/auth');

let twilioClient = null;

// Initialize Twilio client if configured
if (SMS_PROVIDER === 'twilio' && TWILIO_ACCOUNT_SID) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (error) {
    logger.warn('Twilio not available', { error: error.message });
  }
}

/**
 * Send OTP via SMS
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} code - OTP code to send
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendSMSOTP(phoneNumber, code) {
  try {
    if (!twilioClient) {
      logger.warn('SMS service not configured');
      return false;
    }

    const message = await twilioClient.messages.create({
      body: `Your verification code is: ${code}. Valid for 10 minutes.`,
      from: TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    logger.info('SMS OTP sent', { phoneNumber, messageSid: message.sid });
    return true;
  } catch (error) {
    logger.error('SMS OTP send failed', { phoneNumber, error: error.message });
    return false;
  }
}

/**
 * Send OTP via WhatsApp
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} code - OTP code to send
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendWhatsAppOTP(phoneNumber, code) {
  try {
    if (!WHATSAPP_ENABLED || !twilioClient || !WHATSAPP_PHONE_NUMBER) {
      logger.warn('WhatsApp service not configured');
      return false;
    }

    const message = await twilioClient.messages.create({
      body: `Your verification code is: ${code}. Valid for 10 minutes.`,
      from: `whatsapp:${WHATSAPP_PHONE_NUMBER}`,
      to: `whatsapp:${phoneNumber}`,
    });

    logger.info('WhatsApp OTP sent', { phoneNumber, messageSid: message.sid });
    return true;
  } catch (error) {
    logger.error('WhatsApp OTP send failed', { phoneNumber, error: error.message });
    return false;
  }
}

/**
 * Send OTP via preferred method
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} code - OTP code to send
 * @param {string} method - 'sms' or 'whatsapp'
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendOTP(phoneNumber, code, method = 'sms') {
  if (method === 'whatsapp') {
    return await sendWhatsAppOTP(phoneNumber, code);
  }
  return await sendSMSOTP(phoneNumber, code);
}

module.exports = { sendSMSOTP, sendWhatsAppOTP, sendOTP };

