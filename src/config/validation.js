const { z } = require('zod');

/**
 * Common reusable schemas
 */

// ERPNext name format: e.g., WEB-ITM-0002
const erpnextNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Z0-9-]+$/, 'ERPNext name must contain only uppercase letters, numbers, and hyphens');

// Item code format: alphanumeric with hyphens
const itemCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/, 'Item code must contain only alphanumeric characters and hyphens');

// Size unit identifier: e.g., "5lb", "120caps"
const sizeUnitSchema = z.string().min(1).max(50).trim();

/**
 * Analytics schemas
 */

// Path parameter: product name (ERPNext name field)
const analyticsProductNameSchema = z.object({
  name: erpnextNameSchema,
});

// Rating request body
const analyticsRatingSchema = z.object({
  starRating: z.number().int().min(1).max(5),
});

// Comment request body
const analyticsCommentSchema = z.object({
  text: z.string().min(1).max(5000).trim(),
  author: z.string().max(100).trim().optional(),
  timestamp: z.string().datetime().optional(),
  // Allow additional fields to pass through
}).passthrough();

// Search request body
const analyticsSearchSchema = z.object({
  term: z.string().min(1).max(200).trim(),
  filters: z.record(z.any()).optional(),
  results_count: z.number().int().min(0).optional(),
  clicked_results: z.array(z.string()).optional(),
});

// Wishlist request body
const analyticsWishlistSchema = z.object({
  product_name: erpnextNameSchema,
});

// Session request body
const analyticsSessionSchema = z.object({
  session_id: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
});

// Interaction request body
const analyticsInteractionSchema = z.object({
  type: z.enum(['image_view', 'variant_select', 'share']),
  product_name: erpnextNameSchema,
  metadata: z.record(z.any()).optional(),
});

// Batch event schema
const analyticsBatchEventSchema = z.object({
  type: z.enum([
    'view',
    'search',
    'wishlist_add',
    'wishlist_remove',
    'interaction',
    'session_open',
    'session_close',
    'session_heartbeat',
  ]),
  entity_id: z.string().optional(),
  product_name: z.string().optional(),
  term: z.string().optional(),
  filters: z.record(z.any()).optional(),
  results_count: z.number().int().min(0).optional(),
  clicked_results: z.array(z.string()).optional(),
  interaction_type: z.enum(['image_view', 'variant_select', 'share']).optional(),
  metadata: z.record(z.any()).optional(),
  session_id: z.string().uuid().optional(),
});

// Batch request body
const analyticsBatchSchema = z.object({
  events: z.array(analyticsBatchEventSchema).min(1).max(100),
  session_id: z.string().uuid().optional(),
  device_id: z.string().min(1).max(200).optional(),
});

/**
 * Webhook schemas
 */

// Price update webhook body
const webhookPriceUpdateSchema = z.object({
  erpnextName: erpnextNameSchema,
  sizeUnit: sizeUnitSchema,
  price: z
    .number()
    .positive('Price must be positive')
    .max(999999.99, 'Price exceeds maximum value')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0 || num > 999999.99) {
        throw new Error('Invalid price value');
      }
      return num;
    })),
  itemCode: itemCodeSchema.optional(),
  invalidateCache: z.boolean().optional().default(false),
});

// Unified ERPNext webhook body (supports stock and bundle)
// Note: Friday-only entities (product, price, hero, home) are updated automatically on Friday evenings - no webhooks needed
const webhookErpnextSchema = z
  .object({
    entity_type: z.enum(['stock', 'bundle']),
    // Stock fields
    itemCode: itemCodeSchema.optional(),
  })
  .refine(
    (data) => {
      // Stock requires itemCode only (availability fetched from ERPNext)
      if (data.entity_type === 'stock') {
        return !!data.itemCode;
      }
      // Bundle requires no fields (webhook just triggers fetch)
      if (data.entity_type === 'bundle') {
        return true;
      }
      return true;
    },
    {
      message: 'Invalid payload for entity_type',
    }
  );

/**
 * Combined schemas for middleware
 * These combine params, query, and body validation
 */

// Analytics view endpoint: only path param (works for both GET and POST)
const analyticsViewRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: z.object({}).passthrough(), // Empty body allowed
  query: z.object({}).passthrough(), // Empty query allowed
});

// Analytics rating endpoint: path param + body (for POST)
const analyticsRatingRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: analyticsRatingSchema,
  query: z.object({}).passthrough(),
});

// Analytics rating endpoint: only path param (for GET)
const analyticsRatingGetRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: z.object({}).optional().default({}), // Empty body for GET
  query: z.object({}).passthrough(),
});

// Analytics comment endpoint: path param + body (for POST)
const analyticsCommentRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: analyticsCommentSchema,
  query: z.object({}).passthrough(),
});

// Analytics comment endpoint: only path param (for GET)
const analyticsCommentGetRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: z.object({}).optional().default({}), // Empty body for GET
  query: z.object({}).passthrough(),
});

// Analytics search endpoint: only body
const analyticsSearchRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: analyticsSearchSchema,
  query: z.object({}).passthrough(),
});

// Analytics wishlist endpoint: only body
const analyticsWishlistRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: analyticsWishlistSchema,
  query: z.object({}).passthrough(),
});

// Analytics session endpoint: only body
const analyticsSessionRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: analyticsSessionSchema,
  query: z.object({}).passthrough(),
});

// Analytics interaction endpoint: only body
const analyticsInteractionRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: analyticsInteractionSchema,
  query: z.object({}).passthrough(),
});

// Analytics batch endpoint: only body
const analyticsBatchRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: analyticsBatchSchema,
  query: z.object({}).passthrough(),
});

// Webhook price update: only body
const webhookPriceUpdateRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: webhookPriceUpdateSchema,
  query: z.object({}).passthrough(),
});

// Unified ERPNext webhook: only body
const webhookErpnextRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: webhookErpnextSchema,
  query: z.object({}).passthrough(),
});

/**
 * Authentication schemas
 */

// Phone number regex (E.164 format)
const phoneRegex = /^\+[1-9]\d{1,14}$/;

// WhatsApp number regex (E.164 format, same as phone)
const whatsappRegex = /^\+[1-9]\d{1,14}$/;

// Telegram username regex (starts with @, alphanumeric and underscores)
const telegramUsernameRegex = /^@[a-zA-Z0-9_]{5,32}$/;

// Geolocation schema
const geolocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  province: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  street: z.string().max(200).optional(),
}).optional().nullable();

// Avatar schema (base64 data URL)
const avatarSchema = z.string()
  .regex(/^data:image\/(jpeg|jpg|png);base64,/, 'Avatar must be a base64-encoded JPEG or PNG image')
  .refine((val) => {
    // Check size (approximately 100KB limit)
    // Base64 is ~33% larger than binary, so 100KB binary ≈ 133KB base64
    const base64Data = val.split(',')[1];
    if (!base64Data) return false;
    const sizeInBytes = (base64Data.length * 3) / 4;
    return sizeInBytes <= 100 * 1024; // 100KB
  }, 'Avatar size must be less than 100KB')
  .optional();

// Signup schema (enhanced with new fields)
const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
  email: z.string().email('Invalid email').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  verificationMethod: z.enum(['sms', 'whatsapp']).optional(),
  deviceId: z.string().min(1, 'Device ID required'),
  googleId: z.string().optional(), // For Google OAuth signup
  // New profile fields
  first_name: z.string().max(50).optional(),
  surname: z.string().max(50).optional(),
  age: z.number().int().min(13).max(120).optional(), // Age range validation
  occupation: z.string().max(100).optional(),
  fitness_level: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  fitness_goal: z.enum(['weight_loss', 'muscle_gain', 'endurance', 'general_fitness', 'athletic_performance', 'rehabilitation']).optional(),
  province: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  whatsapp_number: z.string().regex(whatsappRegex, 'Invalid WhatsApp number format').optional(),
  telegram_username: z.string().regex(telegramUsernameRegex, 'Invalid Telegram username format (must start with @)').optional(),
  avatar: avatarSchema,
  geolocation: geolocationSchema,
  location_consent: z.boolean().optional(),
  customer_type: z.enum(['retail']).optional().default('retail'),
  device_model: z.string().max(100).optional(),
  os_model: z.string().max(100).optional(),
  erpnext_customer_id: z.string().max(100).optional(), // ERPNext customer ID (set from Redis/admin)
  approved_customer: z.boolean().optional().default(false), // Whether customer is approved for orders
});

// Login schema
const loginSchema = z.object({
  email: z.string().email('Invalid email').optional(),
  username: z.string().min(1, 'Username required').optional(),
  password: z.string().min(1, 'Password required'),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  googleToken: z.string().optional(),
});

// Verify schema
const verifySchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  code: z.string().length(6, 'Code must be 6 digits'),
  method: z.enum(['sms', 'whatsapp']),
});

// Forgot password schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  verificationMethod: z.enum(['sms', 'whatsapp']).optional(),
});

// Reset password schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// Google login schema
const googleLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name required'),
  googleId: z.string().min(1, 'Google ID required'),
  deviceId: z.string().min(1, 'Device ID required'),
});

// Update profile schema (enhanced with new fields)
const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed')
    .optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  passwordConfirmed: z.boolean().refine((val) => val === true, {
    message: 'Password confirmation required',
  }),
  // New profile fields
  first_name: z.string().max(50).optional(),
  surname: z.string().max(50).optional(),
  age: z.number().int().min(13).max(120).optional(),
  occupation: z.string().max(100).optional(),
  fitness_level: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  fitness_goal: z.enum(['weight_loss', 'muscle_gain', 'endurance', 'general_fitness', 'athletic_performance', 'rehabilitation']).optional(),
  province: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  whatsapp_number: z.string().regex(whatsappRegex, 'Invalid WhatsApp number format').optional(),
  telegram_username: z.string().regex(telegramUsernameRegex, 'Invalid Telegram username format (must start with @)').optional(),
  avatar: avatarSchema,
  geolocation: geolocationSchema,
  location_consent: z.boolean().optional(),
  customer_type: z.enum(['retail']).optional(),
  device_model: z.string().max(100).optional(),
  os_model: z.string().max(100).optional(),
  erpnext_customer_id: z.string().max(100).optional(), // ERPNext customer ID (set from Redis/admin)
  approved_customer: z.boolean().optional(), // Whether customer is approved for orders
});

// Anonymous user creation schema
const anonymousUserSchema = z.object({
  device_id: z.string().min(1, 'Device ID required'),
  device_model: z.string().max(100).optional(),
  os_model: z.string().max(100).optional(),
  geolocation: geolocationSchema.optional(),
  location_consent: z.boolean().optional().default(false),
});

// Device info update schema
const deviceInfoSchema = z.object({
  device_model: z.string().max(100).optional(),
  os_model: z.string().max(100).optional(),
});

// Geolocation update schema
const geolocationUpdateSchema = z.object({
  geolocation: geolocationSchema.nullable(), // Allow null to revoke consent
  location_consent: z.boolean(),
});

// Change password schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// Verify email schema (for email changes)
const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

// Anonymous user request schema
const anonymousUserRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: anonymousUserSchema,
  query: z.object({}).passthrough(),
});

// Device info request schema
const deviceInfoRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: deviceInfoSchema,
  query: z.object({}).passthrough(),
});

// Geolocation update request schema
const geolocationUpdateRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: geolocationUpdateSchema,
  query: z.object({}).passthrough(),
});

// Combined request schemas for middleware
const signupRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: signupSchema,
  query: z.object({}).passthrough(),
});

const loginRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: loginSchema,
  query: z.object({}).passthrough(),
});

const verifyRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: verifySchema,
  query: z.object({}).passthrough(),
});

const forgotPasswordRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: forgotPasswordSchema,
  query: z.object({}).passthrough(),
});

const resetPasswordRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: resetPasswordSchema,
  query: z.object({}).passthrough(),
});

const googleLoginRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: googleLoginSchema,
  query: z.object({}).passthrough(),
});

const updateProfileRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: updateProfileSchema,
  query: z.object({}).passthrough(),
});

const changePasswordRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: changePasswordSchema,
  query: z.object({}).passthrough(),
});

const verifyEmailRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: verifyEmailSchema,
  query: z.object({}).passthrough(),
});

module.exports = {
  // Common schemas
  erpnextNameSchema,
  itemCodeSchema,
  sizeUnitSchema,

  // Analytics schemas
  analyticsProductNameSchema,
  analyticsRatingSchema,
  analyticsCommentSchema,
  analyticsSearchSchema,
  analyticsWishlistSchema,
  analyticsSessionSchema,
  analyticsInteractionSchema,
  analyticsBatchEventSchema,
  analyticsBatchSchema,
  
  // User profile schemas
  geolocationSchema,
  avatarSchema,
  anonymousUserSchema,
  deviceInfoSchema,
  geolocationUpdateSchema,

  // Webhook schemas
  webhookPriceUpdateSchema,
  webhookErpnextSchema,

  // Auth schemas
  signupSchema,
  loginSchema,
  verifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleLoginSchema,
  updateProfileSchema,
  changePasswordSchema,
  verifyEmailSchema,

  // Combined request schemas for middleware
  analyticsViewRequestSchema,
  analyticsRatingRequestSchema,
  analyticsRatingGetRequestSchema,
  analyticsCommentRequestSchema,
  analyticsCommentGetRequestSchema,
  analyticsSearchRequestSchema,
  analyticsWishlistRequestSchema,
  analyticsSessionRequestSchema,
  analyticsInteractionRequestSchema,
  analyticsBatchRequestSchema,
  webhookPriceUpdateRequestSchema,
  webhookErpnextRequestSchema,
  signupRequestSchema,
  loginRequestSchema,
  verifyRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  googleLoginRequestSchema,
  updateProfileRequestSchema,
  changePasswordRequestSchema,
  verifyEmailRequestSchema,
  anonymousUserRequestSchema,
  deviceInfoRequestSchema,
  geolocationUpdateRequestSchema,
};

