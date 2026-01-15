# ERPNext Webhook Configuration Guide

This document provides instructions for configuring ERPNext to send webhooks to the Prowhey Middleware when product or stock data changes.

## Overview

The middleware provides a unified webhook endpoint that ERPNext can call to notify about changes to:
- **Products** (Website Items)
- **Stock Availability** (Item stock levels)
- **Prices** (Item prices - uses weekly snapshot, no webhook needed)
- **Hero Images** (File doctype with is_hero=1)
- **Bundle Images** (File doctype with is_bundle=1)
- **App Home** (App Home doctype)

When ERPNext sends a webhook, the middleware:
1. Fetches the latest data from ERPNext
2. Compares it with cached data (using hash comparison)
3. Updates the cache and sync streams only if data has changed
4. Returns a response indicating whether the data changed

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://your-domain.com` |
| Development | `http://localhost:3001` |

---

## Webhook Endpoint

**Endpoint:** `POST /api/webhooks/erpnext`

**Content-Type:** `application/json`

**Authentication:** None required (webhooks are public endpoints with rate limiting)

**Rate Limiting:** Webhooks are rate-limited to prevent abuse. Contact your middleware administrator if you encounter rate limit errors.

---

## 1. Product Update Webhook

Trigger this webhook when a **Website Item** is created, updated, or published/unpublished in ERPNext.

### When to Trigger

- Website Item is created
- Website Item fields are modified (name, description, images, variants, etc.)
- Website Item is published or unpublished
- Website Item is deleted (optional - middleware will handle gracefully)

**Note:** If a Website Item is unpublished or deleted in ERPNext, the middleware will automatically detect it when fetching all products (e.g., via the query endpoint). You don't need to send a webhook for deletions - the middleware handles them automatically. However, if you want immediate deletion detection, you can still send a webhook (the middleware will handle it gracefully if the product doesn't exist).

### Request Format

**Method:** `POST`

**URL:** `{BASE_URL}/api/webhooks/erpnext`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "entity_type": "product",
  "erpnextName": "WEB-ITM-0002"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes | Must be `"product"` |
| `erpnextName` | string | Yes | The ERPNext `name` field of the Website Item (e.g., `WEB-ITM-0002`) |

### Example: ERPNext Webhook Configuration

In ERPNext, configure a **Webhook** document:

**Webhook Name:** `Product Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "product",
  "erpnextName": "{{ doc.name }}"
}
```

**Webhook Conditions:**
- **DocType:** `Website Item`
- **Trigger:** `on_update` (or `after_insert`, `on_submit`, etc.)

### Response Format

**Success Response (Data Changed):**
```json
{
  "success": true,
  "message": "product webhook processed successfully",
  "changed": true,
  "version": "2",
  "streamId": "1768469419660-0",
  "entity_type": "product"
}
```

**Success Response (No Change Detected):**
```json
{
  "success": true,
  "message": "product webhook processed successfully",
  "changed": false,
  "version": "1",
  "streamId": null,
  "entity_type": "product"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Invalid payload for entity_type"
}
```

### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` if webhook was processed successfully |
| `message` | string | Human-readable status message |
| `changed` | boolean | `true` if data changed, `false` if no change detected |
| `version` | string | Current version number of the cached data |
| `streamId` | string \| null | Stream entry ID if data changed, `null` if no change |
| `entity_type` | string | The entity type that was processed |

### What Happens Behind the Scenes

1. Middleware receives webhook with `erpnextName`
2. Fetches latest product data from ERPNext API: `/api/resource/Website Item/{erpnextName}`
3. Transforms product data to standardized format
4. Computes SHA-256 hash of the data
5. Compares hash with cached data
6. If hash differs:
   - Updates Redis cache with new data
   - Increments version number
   - Adds entry to `product_changes` stream
   - Returns `changed: true` with `streamId`
7. If hash matches:
   - Skips update (no change)
   - Returns `changed: false` with `streamId: null`

---

## 2. Stock Availability Webhook

Trigger this webhook when stock levels change for an **Item** in ERPNext (e.g., stock entry, stock reconciliation, delivery, etc.).

### When to Trigger

- Stock Entry is submitted (purchase, receipt, transfer, etc.)
- Stock Reconciliation is submitted
- Delivery Note is submitted (reduces stock)
- Sales Invoice is submitted (reduces stock)
- Any other transaction that affects item stock levels

### Request Format

**Method:** `POST`

**URL:** `{BASE_URL}/api/webhooks/erpnext`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "entity_type": "stock",
  "itemCode": "OL-EN-92-rng-1kg"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes | Must be `"stock"` |
| `itemCode` | string | Yes | The Item Code (e.g., `OL-EN-92-rng-1kg`) |

**Important:** Do NOT send the `availability` array in the webhook payload. The middleware automatically fetches stock from ERPNext and builds the availability array based on the warehouse reference.

### Example: ERPNext Webhook Configuration

#### Option 1: Webhook on Stock Entry

**Webhook Name:** `Stock Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "stock",
  "itemCode": "{{ doc.item_code }}"
}
```

**Webhook Conditions:**
- **DocType:** `Stock Entry`
- **Trigger:** `on_submit`

#### Option 2: Webhook on Delivery Note

**Webhook Name:** `Stock Update on Delivery`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "stock",
  "itemCode": "{{ item.item_code }}"
}
```

**Webhook Conditions:**
- **DocType:** `Delivery Note`
- **Trigger:** `on_submit`
- **Note:** Use a loop if multiple items: `{% for item in doc.items %}`

#### Option 3: Webhook on Stock Reconciliation

**Webhook Name:** `Stock Reconciliation Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "stock",
  "itemCode": "{{ item.item_code }}"
}
```

**Webhook Conditions:**
- **DocType:** `Stock Reconciliation`
- **Trigger:** `on_submit`

### Response Format

**Success Response (Data Changed):**
```json
{
  "success": true,
  "message": "stock webhook processed successfully",
  "changed": true,
  "version": "3",
  "streamId": "1768469419662-0",
  "entity_type": "stock"
}
```

**Success Response (No Change Detected):**
```json
{
  "success": true,
  "message": "stock webhook processed successfully",
  "changed": false,
  "version": "2",
  "streamId": null,
  "entity_type": "stock"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Invalid payload for entity_type"
}
```

### Response Field Descriptions

Same as Product Update Webhook (see above).

### What Happens Behind the Scenes

1. Middleware receives webhook with `itemCode`
2. Fetches stock from ERPNext Bin API: `/api/resource/Bin?filters=[["item_code","=","{itemCode}"],["actual_qty",">",0]]`
3. Gets warehouse reference array from Redis
4. Builds availability array:
   - For each warehouse in reference array
   - Check if item has stock (`actual_qty > 0`) in that warehouse
   - Set array index to `1` if stock exists, `0` otherwise
5. Computes SHA-256 hash of `{itemCode, availability}`
6. Compares hash with cached data
7. If hash differs:
   - Updates Redis cache with new availability array
   - Updates simple key `availability:{itemCode}` for backward compatibility
   - Increments version number
   - Adds entry to `stock_changes` stream
   - Returns `changed: true` with `streamId`
8. If hash matches:
   - Skips update (no change)
   - Returns `changed: false` with `streamId: null`

### Important Notes

- **Warehouse Reference:** The availability array is built based on the warehouse reference array stored in Redis. If warehouses are added/removed, the warehouse reference must be updated first (see middleware API documentation).
- **Multiple Items:** If a transaction affects multiple items, send separate webhook calls for each item code (or use a loop in ERPNext webhook configuration).
- **Stock Lookup:** Only warehouses with `actual_qty > 0` are considered when building the availability array.

---

## 3. Price Updates (Weekly Snapshot)

**Important:** Prices use a **weekly snapshot approach** instead of webhooks. No webhook configuration is needed for prices.

### Why Weekly Snapshot?

Prices are refreshed automatically via a scheduled weekly full refresh that:
- Fetches all item prices from ERPNext for all published products
- Compares prices with cached data using hash comparison
- Only updates cache and sync streams if prices have changed
- Processes items in parallel batches for performance
- Detects manual Redis changes and updates accordingly

This approach is:
- **Cleaner:** No need to configure webhooks for every price change
- **Safer:** Avoids race conditions and ensures consistency
- **Efficient:** Batch processing is more efficient than individual webhooks
- **Reliable:** Weekly refresh ensures all prices are up-to-date

### How It Works

1. **Scheduled Refresh:** The middleware runs a full refresh weekly (configurable)
2. **Price Fetching:** For each unique item code from website item variants:
   - Fetches retail price from "Standard Selling" price list
   - Fetches wholesale price from "Wholesale Selling" price list
   - Stores as `[retail, wholesale]` array
3. **Change Detection:** Compares hash of price data with cached data
4. **Stream Updates:** Only adds stream entries if prices changed
5. **Manual Change Detection:** Detects if Redis values were manually changed

### Price Data Format

**Storage Format:**
- Hash key: `hash:price:{itemCode}` with structure:
  ```json
  {
    "data": { "itemCode": "OL-EN-92-rng-1kg", "prices": [29.99, 24.99] },
    "data_hash": "...",
    "updated_at": "...",
    "version": "1"
  }
  ```
- Simple key: `price:{itemCode}` with array: `[retail, wholesale]`

**Price Array:**
- `[0]`: Retail price (Standard Selling price list)
- `[1]`: Wholesale price (Wholesale Selling price list)
- If a price doesn't exist, it will be `0`

### Manual Refresh

If you need to refresh prices immediately (outside of the weekly schedule), you can trigger a manual refresh:

**Endpoint:** `POST /api/price/update-all`

**Response:**
```json
{
  "success": true,
  "total": 150,
  "updated": 5,
  "unchanged": 145,
  "errors": []
}
```

### Sync API

Price changes are automatically tracked in the `price_changes` stream. Frontend apps can use the sync API to get price updates:

- **Fast frequency:** Prices are included in slow-frequency sync checks
- **Stream entries:** Created only when prices actually change
- **Manual changes:** Detected and streamed to apps

See [SYNC_API.md](./SYNC_API.md) for details on consuming price updates via the sync API.

### Important Notes

- **No Webhook Needed:** Prices are automatically refreshed weekly
- **Change Detection:** Only changed prices create stream entries
- **Manual Refresh:** Use `/api/price/update-all` endpoint if immediate refresh is needed
- **Price Lists:** Uses "Standard Selling" for retail and "Wholesale Selling" for wholesale
- **Item Codes:** Processes all unique item codes from all website item variants

---

## 4. Hero Images Webhook

Trigger this webhook when a **File** with `is_hero = 1` is created, updated, or when the `is_hero` field changes in ERPNext.

### When to Trigger

- File is created with `is_hero = 1`
- File's `is_hero` field is changed (from 0 to 1, or 1 to 0)
- File with `is_hero = 1` is updated
- File with `is_hero = 1` is deleted (optional - middleware will handle gracefully)

### Request Format

**Method:** `POST`

**URL:** `{BASE_URL}/api/webhooks/erpnext`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "entity_type": "hero"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes | Must be `"hero"` |

**Note:** No additional fields are required. The webhook just triggers the middleware to fetch all hero images from ERPNext.

### Example: ERPNext Webhook Configuration

**Webhook Name:** `Hero Images Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "hero"
}
```

**Webhook Conditions:**
- **DocType:** `File`
- **Trigger:** `on_update` (or `after_insert`, `on_submit`, etc.)
- **Optional Condition:** `doc.is_hero == 1` (only trigger when is_hero is set)

### Response Format

**Success Response (Data Changed):**
```json
{
  "success": true,
  "message": "hero webhook processed successfully",
  "changed": true,
  "version": "2",
  "streamId": "1768469419663-0",
  "entity_type": "hero"
}
```

**Success Response (No Change Detected):**
```json
{
  "success": true,
  "message": "hero webhook processed successfully",
  "changed": false,
  "version": "1",
  "streamId": null,
  "entity_type": "hero"
}
```

### What Happens Behind the Scenes

1. Middleware receives webhook with `entity_type: "hero"`
2. Fetches all hero images from ERPNext File API: `/api/resource/File?filters=[["is_hero", "=", 1]]&limit=10`
3. Downloads each image from its URL
4. Converts images to base64 data URLs
5. Computes SHA-256 hash of the image data array
6. Compares hash with cached data
7. If hash differs:
   - Updates Redis cache with new image data
   - Increments version number
   - Adds entry to `hero_changes` stream
   - Returns `changed: true` with `streamId`
8. If hash matches:
   - Skips update (no change)
   - Returns `changed: false` with `streamId: null`

---

## 5. Bundle Images Webhook

Trigger this webhook when a **File** with `is_bundle = 1` is created, updated, or when the `is_bundle` field changes in ERPNext.

### When to Trigger

- File is created with `is_bundle = 1`
- File's `is_bundle` field is changed (from 0 to 1, or 1 to 0)
- File with `is_bundle = 1` is updated
- File with `is_bundle = 1` is deleted (optional - middleware will handle gracefully)

### Request Format

**Method:** `POST`

**URL:** `{BASE_URL}/api/webhooks/erpnext`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "entity_type": "bundle"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes | Must be `"bundle"` |

**Note:** No additional fields are required. The webhook just triggers the middleware to fetch all bundle images from ERPNext.

### Example: ERPNext Webhook Configuration

**Webhook Name:** `Bundle Images Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "bundle"
}
```

**Webhook Conditions:**
- **DocType:** `File`
- **Trigger:** `on_update` (or `after_insert`, `on_submit`, etc.)
- **Optional Condition:** `doc.is_bundle == 1` (only trigger when is_bundle is set)

### Response Format

**Success Response (Data Changed):**
```json
{
  "success": true,
  "message": "bundle webhook processed successfully",
  "changed": true,
  "version": "2",
  "streamId": "1768469419663-0",
  "entity_type": "bundle"
}
```

**Success Response (No Change Detected):**
```json
{
  "success": true,
  "message": "bundle webhook processed successfully",
  "changed": false,
  "version": "1",
  "streamId": null,
  "entity_type": "bundle"
}
```

### What Happens Behind the Scenes

1. Middleware receives webhook with `entity_type: "bundle"`
2. Fetches all bundle images from ERPNext File API: `/api/resource/File?filters=[["is_bundle", "=", 1]]&limit=10`
3. Downloads each image from its URL
4. Converts images to base64 data URLs
5. Computes SHA-256 hash of the image data array
6. Compares hash with cached data
7. If hash differs:
   - Updates Redis cache with new image data
   - Increments version number
   - Adds entry to `bundle_changes` stream
   - Returns `changed: true` with `streamId`
8. If hash matches:
   - Skips update (no change)
   - Returns `changed: false` with `streamId: null`

---

## 6. App Home Webhook

Trigger this webhook when an **App Home** record is created, updated, or submitted in ERPNext.

### When to Trigger

- App Home record is created
- App Home fields are modified (top_sellers, new_arrivals, most_viewed, top_offers, html1-3, etc.)
- App Home record is submitted
- App Home record is deleted (optional - middleware will handle gracefully)

### Request Format

**Method:** `POST`

**URL:** `{BASE_URL}/api/webhooks/erpnext`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "entity_type": "home"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes | Must be `"home"` |

**Note:** No additional fields are required. The webhook just triggers the middleware to fetch App Home data from ERPNext. If multiple App Home records exist, the middleware will automatically select the latest one (by `modified` timestamp).

### Example: ERPNext Webhook Configuration

**Webhook Name:** `App Home Update`

**Request URL:** `https://your-domain.com/api/webhooks/erpnext`

**Request Method:** `POST`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body (Jinja Template):**
```json
{
  "entity_type": "home"
}
```

**Webhook Conditions:**
- **DocType:** `App Home`
- **Trigger:** `on_submit` or `on_update`

### Response Format

**Success Response (Data Changed):**
```json
{
  "success": true,
  "message": "home webhook processed successfully",
  "changed": true,
  "version": "2",
  "streamId": "1768469419664-0",
  "entity_type": "home"
}
```

**Success Response (No Change Detected):**
```json
{
  "success": true,
  "message": "home webhook processed successfully",
  "changed": false,
  "version": "1",
  "streamId": null,
  "entity_type": "home"
}
```

### What Happens Behind the Scenes

1. Middleware receives webhook with `entity_type: "home"`
2. Fetches App Home data from ERPNext API: `/api/resource/App Home?fields=["*"]`
3. If multiple App Home records exist, selects the latest one by `modified` timestamp
4. Parses JSON string fields: `top_sellers`, `new_arrivals`, `most_viewed`, `top_offers`
5. Includes HTML fields: `html1`, `html2`, `html3`
6. Computes SHA-256 hash of the transformed data
7. Compares hash with cached data
8. If hash differs:
   - Updates Redis cache with new data
   - Increments version number
   - Adds entry to `home_changes` stream
   - Returns `changed: true` with `streamId`
9. If hash matches:
   - Skips update (no change)
   - Returns `changed: false` with `streamId: null`

### Important Notes

- **Multiple Records:** If multiple App Home records exist, the middleware automatically selects the latest one (by `modified` timestamp). You don't need to worry about which record to update.
- **JSON Parsing:** Fields like `top_sellers`, `new_arrivals`, etc. are stored as JSON strings in ERPNext but are automatically parsed into arrays by the middleware.
- **Adding Fields:** To add new fields to App Home, see [HOME_DATA_STRUCTURE.md](./HOME_DATA_STRUCTURE.md) for instructions.

---

## Error Handling

### Common Error Responses

| Status Code | Error | Description | Solution |
|-------------|-------|-------------|----------|
| `400` | Bad Request | Invalid payload format or missing required fields | Check request body matches schema |
| `422` | Validation Error | Field validation failed (e.g., invalid `erpnextName` format) | Verify field formats match requirements |
| `429` | Too Many Requests | Rate limit exceeded | Reduce webhook frequency or contact administrator |
| `500` | Internal Server Error | Server-side error (e.g., ERPNext API failure) | Check middleware logs, verify ERPNext connectivity |

### Error Response Format

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

### Retry Strategy

ERPNext webhooks have built-in retry mechanisms. If a webhook fails:

1. ERPNext will automatically retry failed webhooks
2. Check ERPNext webhook logs for retry attempts
3. Verify middleware is accessible and responding
4. Check middleware logs for detailed error information

---

## Best Practices

### 1. Webhook Timing

- **Product Updates:** Trigger on `on_submit` or `on_update` to ensure data is finalized
- **Stock Updates:** Trigger on `on_submit` to ensure stock transactions are committed
- **Price Updates:** Uses weekly snapshot (no webhook needed) - prices are refreshed automatically via scheduled full refresh
- **Hero Images:** Trigger on `on_update` when `is_hero` field changes
- **Bundle Images:** Trigger on `on_update` when `is_bundle` field changes
- **App Home:** Trigger on `on_submit` or `on_update` to ensure data is finalized

**Note:** Prices use a weekly snapshot approach instead of webhooks for cleaner and safer operation. The middleware automatically fetches all prices during the weekly full refresh, comparing with cached data and only updating if changes are detected.

### 2. Avoiding Duplicate Webhooks

- Use ERPNext's webhook conditions to prevent duplicate triggers
- Example: Only trigger on `on_submit`, not on `on_update` and `on_submit`

### 3. Batch Operations

- For bulk updates (e.g., importing products), consider batching webhooks or using the bulk refresh endpoint instead
- Contact middleware administrator for bulk operation recommendations

### 4. Testing

- Test webhooks in development environment first
- Use ERPNext's "Test" button in Webhook document to verify payload format
- Check middleware logs to confirm webhooks are being received and processed

### 5. Monitoring

- Monitor ERPNext webhook logs for failures
- Set up alerts for repeated webhook failures
- Check middleware sync status endpoint: `GET /api/health/sync-status`

---

## ERPNext Webhook Setup Checklist

- [ ] Create Webhook document in ERPNext
- [ ] Set correct Request URL (production or development)
- [ ] Set Request Method to `POST`
- [ ] Add `Content-Type: application/json` header
- [ ] Configure Request Body with correct Jinja template
- [ ] Set appropriate DocType (Website Item, Stock Entry, File, App Home, etc.)
- [ ] Set appropriate Trigger (on_submit, on_update, etc.)
- [ ] Test webhook using ERPNext's "Test" button
- [ ] Verify webhook appears in ERPNext webhook logs
- [ ] Check middleware logs to confirm webhook is received
- [ ] Verify data is updated in middleware cache (check sync status endpoint)

---

## Troubleshooting

### Webhook Not Received

1. **Check ERPNext Webhook Logs:**
   - Go to ERPNext → Webhook → View Logs
   - Check for errors or failed attempts

2. **Verify Webhook Configuration:**
   - Ensure Request URL is correct
   - Ensure Request Method is `POST`
   - Ensure Content-Type header is set

3. **Check Middleware Logs:**
   - Look for incoming webhook requests
   - Check for validation errors

### Webhook Received But Data Not Updated

1. **Check Response:**
   - If `changed: false`, data hash matched (no actual change)
   - This is expected behavior - webhook was successful but no update needed

2. **Verify ERPNext API Access:**
   - Middleware must be able to fetch data from ERPNext
   - Check ERPNext API credentials in middleware configuration
   - Test ERPNext connectivity: `GET /api/erpnext/ping`

3. **Check Middleware Logs:**
   - Look for errors during data fetching or processing
   - Check for hash comparison logs

### Rate Limit Errors

- Reduce webhook frequency
- Contact middleware administrator to adjust rate limits
- Consider batching updates or using scheduled refresh instead

---

## Support

For issues or questions:
1. Check middleware logs: `/logs/error.log`
2. Check ERPNext webhook logs
3. Contact middleware administrator
4. Provide webhook payload and response for debugging

---

## Related Documentation

- [Sync API Documentation](./SYNC_API.md) - How frontend apps consume sync updates
- [Frontend Integration Guide](./FRONTEND_INTEGRATION.md) - React Native integration guide for frontend developers
- [API Documentation](./API.md) - Complete API reference
- [Home Data Structure](./HOME_DATA_STRUCTURE.md) - App Home data structure and extensibility guide
- [Local Webhook Testing](../LOCAL_WEBHOOK_TESTING.md) - Testing webhooks locally
