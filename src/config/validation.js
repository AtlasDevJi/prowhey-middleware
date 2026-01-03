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

/**
 * Combined schemas for middleware
 * These combine params, query, and body validation
 */

// Analytics view endpoint: only path param
const analyticsViewRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: z.object({}).passthrough(), // Empty body allowed
  query: z.object({}).passthrough(), // Empty query allowed
});

// Analytics rating endpoint: path param + body
const analyticsRatingRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: analyticsRatingSchema,
  query: z.object({}).passthrough(),
});

// Analytics comment endpoint: path param + body
const analyticsCommentRequestSchema = z.object({
  params: analyticsProductNameSchema,
  body: analyticsCommentSchema,
  query: z.object({}).passthrough(),
});

// Webhook price update: only body
const webhookPriceUpdateRequestSchema = z.object({
  params: z.object({}).passthrough(),
  body: webhookPriceUpdateSchema,
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

  // Webhook schemas
  webhookPriceUpdateSchema,

  // Combined request schemas for middleware
  analyticsViewRequestSchema,
  analyticsRatingRequestSchema,
  analyticsCommentRequestSchema,
  webhookPriceUpdateRequestSchema,
};

