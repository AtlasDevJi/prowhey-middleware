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
  body: z.object({}).passthrough(), // Empty body for GET
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
  body: z.object({}).passthrough(), // Empty body for GET
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

// Signup schema
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

// Update profile schema (with passwordConfirmed flag)
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
};

