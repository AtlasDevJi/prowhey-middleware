# ERPNext Webhook Configuration Guide

This document provides instructions for configuring ERPNext to send webhooks to the Prowhey Middleware when product or stock data changes.

## Overview

The middleware provides a unified webhook endpoint that ERPNext can call to notify about changes to:
- **Products** (Website Items)
- **Stock Availability** (Item stock levels)

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
- [ ] Set appropriate DocType (Website Item, Stock Entry, etc.)
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
- [API Documentation](./API.md) - Complete API reference
- [Local Webhook Testing](./LOCAL_WEBHOOK_TESTING.md) - Testing webhooks locally
