# Prowhey Middleware API Documentation

## Table of Contents

- [Base URL & Authentication](#base-url--authentication)
- [Response Format](#response-format)
- [Product Endpoints](#product-endpoints)
- [Analytics Endpoints](#analytics-endpoints)
- [Price Management](#price-management)
- [Stock Management](#stock-management)
- [Webhooks](#webhooks)
- [Error Handling](#error-handling)
- [Caching Strategy](#caching-strategy)
- [Examples](#examples)

---

## Base URL & Authentication

| Environment | Base URL |
|------------|----------|
| Production | `https://your-domain.com` |
| Development | `http://localhost:3001` |

**Authentication:** All API calls use server-side ERPNext credentials. No user authentication is required. The middleware acts as a proxy between your mobile app and ERPNext.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

---

## Product Endpoints

### Get Single Product

**Endpoint:** `GET /api/resource/Website Item?filters=[["name", "=", "WEB-ITM-0002"]]`

Fetches a single product by its ERPNext name field. Returns product data from ERPNext (cached) plus analytics data from Redis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filters` | JSON String | Yes | Filter array: `[["name", "=", "WEB-ITM-0002"]]` |
| `fields` | JSON String | No | Array of fields to return |

**Example Request:**
```bash
GET /api/resource/Website%20Item?filters=[["name","=","WEB-ITM-0002"]]
```

**Response Structure:**

| Field | Source | Description |
|-------|--------|-------------|
| `product` | ERPNext (cached) | Product data from ERPNext |
| `views` | Redis | View count from analytics system |
| `ratingBreakdown` | Redis | Rating distribution (1-5 stars) |
| `reviewCount` | Redis | Total number of ratings |
| `comments` | Redis | Array of user comments |

**Example Response:**
```json
{
  "product": {
    "name": "Premium Protein Powder",
    "web_item_name": "premium-protein-powder",
    "item_code": "PROT-001",
    "item_name": "Premium Protein Powder",
    "erpnext_name": "WEB-ITM-0002",
    "brand": "Prowhey",
    "item_group": "Supplements",
    "category": "Supplements",
    "description": "High-quality protein powder",
    "short_description": "Premium protein",
    "web_long_description": "Full description...",
    "website_image": "https://example.com/image.jpg",
    "variants": [
      {
        "size": 5,
        "unit": "lb",
        "flavors": [
          {
            "name": "Vanilla",
            "itemCode": "OL-PC-91-vnl-5lb"
          },
          {
            "name": "Chocolate",
            "itemCode": "OL-PC-91-choc-5lb"
          }
        ]
      }
    ],
    "nutritionFacts": {
      "Calories": 120,
      "Protein": 25,
      "Carbs": 3
    },
    "benefits": "Supports muscle recovery and growth"
  },
  "views": 1250,
  "ratingBreakdown": {
    "1": 5,
    "2": 2,
    "3": 8,
    "4": 25,
    "5": 60
  },
  "reviewCount": 100,
  "comments": [
    {
      "id": "uuid-123",
      "text": "Great product!",
      "author": "John Doe",
      "timestamp": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Important Notes:**

- **Product Data**: Fetched from ERPNext and cached in Redis for 1 hour
- **Analytics Data**: Fetched separately from Redis (views, ratings, comments are stored separately)
- **Cache Strategy**: Product data uses cache-first strategy (checks Redis, then ERPNext)
- **Analytics Fallback**: If analytics fetch fails, returns product with default analytics (0 views, empty ratings, empty comments)

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `404` | Not found | Product not found in ERPNext |
| `500` | Internal Server Error | Failed to fetch product or analytics |

---

### Query Products

**Endpoint:** `GET /api/resource/Website Item?filters=[...]&fields=[...]`

Query multiple products with filters. Returns only product data (no analytics).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filters` | JSON String | Yes | Array of filter arrays |
| `fields` | JSON String | No | Array of fields to return |
| `limit_page_length` | Number | No | Results per page |
| `limit_start` | Number | No | Pagination offset |

**Example Request:**
```bash
GET /api/resource/Website%20Item?filters=[["published","=",1]]&fields=["name","web_item_name","brand"]
```

**Response:**
```json
{
  "data": [
    {
      "name": "Premium Protein Powder",
      "web_item_name": "premium-protein-powder",
      "brand": "Prowhey"
    },
    {
      "name": "Whey Isolate",
      "web_item_name": "whey-isolate",
      "brand": "Prowhey"
    }
  ]
}
```

---

## Analytics Endpoints

All analytics endpoints use the **ERPNext `name` field** (e.g., `WEB-ITM-0002`) as the product identifier. Analytics data is stored in Redis, not ERPNext.

### Increment Product Views

**Endpoint:** `POST /api/analytics/product/:name/view`

Increments the view count for a product. Uses atomic Redis INCR operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | Path | Yes | ERPNext name field (e.g., `WEB-ITM-0002`) |

**Example Request:**
```bash
POST /api/analytics/product/WEB-ITM-0002/view
```

**Response:**
```json
{
  "success": true,
  "views": 1251
}
```

**Storage:** Views are stored in Redis with key format: `views:{erpnextName}`

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Bad Request | Missing or invalid name parameter |
| `500` | Internal Server Error | Failed to increment views |

---

### Add Product Rating

**Endpoint:** `POST /api/analytics/product/:name/rating`

Adds a star rating (1-5) to a product. Updates the rating breakdown and review count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | Path | Yes | ERPNext name field (e.g., `WEB-ITM-0002`) |
| `starRating` | Body | Yes | Integer between 1 and 5 |

**Request Body:**
```json
{
  "starRating": 5
}
```

**Example Request:**
```bash
POST /api/analytics/product/WEB-ITM-0002/rating
Content-Type: application/json

{
  "starRating": 5
}
```

**Response:**
```json
{
  "success": true,
  "ratingBreakdown": {
    "1": 5,
    "2": 2,
    "3": 8,
    "4": 25,
    "5": 61
  },
  "reviewCount": 101
}
```

**Storage:** Ratings are stored in Redis with key format: `rating:{erpnextName}`

**Data Structure:**
```json
{
  "ratingBreakdown": {
    "1": 5,
    "2": 2,
    "3": 8,
    "4": 25,
    "5": 61
  },
  "reviewCount": 101
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Bad Request | Missing name or invalid starRating (must be 1-5) |
| `500` | Internal Server Error | Failed to add rating |

---

### Add Product Comment

**Endpoint:** `POST /api/analytics/product/:name/comment`

Adds a comment/review to a product. Comments are stored in reverse chronological order (newest first).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | Path | Yes | ERPNext name field (e.g., `WEB-ITM-0002`) |
| `text` | Body | Yes | Comment text |
| `author` | Body | No | Author name (defaults to "anonymous") |
| `timestamp` | Body | No | ISO timestamp (defaults to current time) |

**Request Body:**
```json
{
  "text": "Great product! Highly recommend.",
  "author": "John Doe",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

**Example Request:**
```bash
POST /api/analytics/product/WEB-ITM-0002/comment
Content-Type: application/json

{
  "text": "Great product! Highly recommend.",
  "author": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "comments": [
    {
      "id": "uuid-456",
      "text": "Great product! Highly recommend.",
      "author": "John Doe",
      "timestamp": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "uuid-123",
      "text": "Great product!",
      "author": "Jane Smith",
      "timestamp": "2024-01-14T09:00:00.000Z"
    }
  ]
}
```

**Storage:** Comments are stored in Redis with key format: `comments:{erpnextName}`

**Note:** Comments are returned in reverse chronological order (newest first). Additional fields in the request body are preserved in the comment object.

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Bad Request | Missing name or text |
| `500` | Internal Server Error | Failed to add comment |

---

## Price Management

### Bulk Price Update

**Endpoint:** `POST /api/price/update-all`

Triggers a bulk price update for all published products. Fetches prices from ERPNext and caches them in Redis.

**Important:** Only processes the **first flavor per size** since all flavors of the same size have the same price.

**Example Request:**
```bash
POST /api/price/update-all
```

**Response:**
```json
{
  "success": true,
  "totalProductsFetched": 6,
  "productsWithVariants": 3,
  "updated": 3,
  "failed": 0,
  "skipped": 3,
  "errors": []
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `totalProductsFetched` | Total number of published products fetched from ERPNext |
| `productsWithVariants` | Number of products that have variants |
| `updated` | Number of price entries successfully updated |
| `failed` | Number of price updates that failed |
| `skipped` | Number of products skipped (no variants) |
| `errors` | Array of error objects with details |

**Price Storage:**

| Key Format | Example | Value |
|------------|---------|-------|
| `price:{erpnextName}:{sizeUnit}` | `price:WEB-ITM-0002:5lb` | `29.99` |

**Price Lookup:**
- Uses the first flavor's `itemCode` for price lookup
- Fetches from ERPNext `Item Price` doctype
- Default price list: `Standard Selling`
- No TTL - prices persist until updated

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `500` | Internal Server Error | Failed to update prices |

---

## Stock Management

### Bulk Stock Update

**Endpoint:** `POST /api/stock/update-all`

Triggers a bulk stock availability update for all published products. Fetches stock from ERPNext Bin API and caches availability arrays in Redis.

**Important:** Processes **ALL flavors** (not just first) since each flavor has its own stock availability.

**Example Request:**
```bash
POST /api/stock/update-all
```

**Response:**
```json
{
  "success": true,
  "totalProductsFetched": 6,
  "productsWithVariants": 3,
  "itemsProcessed": 12,
  "updated": 10,
  "failed": 2,
  "skipped": 3,
  "errors": [
    {
      "product": "WEB-ITM-0003",
      "itemCode": "OL-EN-92-rng-1kg",
      "error": "Failed to update availability"
    }
  ]
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `totalProductsFetched` | Total number of published products fetched from ERPNext |
| `productsWithVariants` | Number of products that have variants |
| `itemsProcessed` | Total number of item codes processed (all flavors) |
| `updated` | Number of availability arrays successfully updated |
| `failed` | Number of updates that failed |
| `skipped` | Number of products skipped (no variants) |
| `errors` | Array of error objects with details |

**Stock Availability Storage:**

| Key Format | Example | Value |
|------------|---------|-------|
| `availability:{itemCode}` | `availability:OL-EN-92-rng-1kg` | `[0,0,1,0,1]` |
| `warehouses:reference` | `warehouses:reference` | `["Idlib Store - P","Allepo Store - P",...]` |

**Availability Array Format:**

The availability array is a binary array where:
- `0` = No stock in that warehouse
- `1` = Stock available in that warehouse
- Array index corresponds to warehouse position in the reference array

**Example:**

| Warehouse Reference | Availability Array | Meaning |
|-------------------|-------------------|---------|
| `["Idlib Store - P", "Allepo Store - P", "Homs Store - P", "Hama Store - P", "Latakia Store - P"]` | `[0,0,1,0,1]` | Stock available in Homs and Latakia stores |

**Stock Lookup:**
- Fetches from ERPNext `Bin` doctype
- Filter: `actual_qty > 0` (only warehouses with stock)
- Returns array of warehouse names where stock exists
- Builds binary array matching warehouse reference order

**Updating Warehouse Reference:**

The warehouse reference array is stored in Redis and can be updated directly:

```bash
redis-cli SET warehouses:reference '["Idlib Store - P","Allepo Store - P","Homs Store - P","Hama Store - P","Latakia Store - P"]'
```

**Important:** After updating the warehouse reference, run the bulk stock update again to regenerate all availability arrays with the correct length.

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `500` | Internal Server Error | Failed to update stock availability |

---

## Webhooks

### Price Update Webhook

**Endpoint:** `POST /api/webhooks/price-update`

Webhook endpoint for ERPNext to notify price changes. Updates the cached price in Redis.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `erpnextName` | String | Yes | ERPNext name field (e.g., `WEB-ITM-0002`) |
| `sizeUnit` | String | Yes | Size identifier (e.g., `5lb`, `120caps`) |
| `price` | Number | Yes | New price value |
| `itemCode` | String | No | Item code for logging |
| `invalidateCache` | Boolean | No | If `true`, invalidates the product cache |

**Example Request:**
```bash
POST /api/webhooks/price-update
Content-Type: application/json

{
  "erpnextName": "WEB-ITM-0002",
  "sizeUnit": "5lb",
  "price": 29.99,
  "invalidateCache": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Price updated successfully",
  "erpnextName": "WEB-ITM-0002",
  "sizeUnit": "5lb",
  "price": 29.99
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Bad Request | Missing required fields or invalid price |
| `500` | Internal Server Error | Failed to update price |

---

## Error Handling

### Standard Error Responses

All endpoints return consistent error responses:

| Status Code | Error Type | Description |
|------------|------------|-------------|
| `400` | Bad Request | Missing or invalid parameters |
| `404` | Not Found | Resource not found |
| `500` | Internal Server Error | Server error processing request |

**Error Response Format:**
```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

---

## Caching Strategy

### Cache TTLs

| Data Type | TTL | Storage |
|-----------|-----|---------|
| Product Data | 1 hour (3600s) | Redis |
| Query Results | 5 minutes (300s) | Redis |
| Prices | No TTL (persistent) | Redis |
| Stock Availability | No TTL (persistent) | Redis |
| Analytics (Views) | No TTL (persistent) | Redis |
| Analytics (Ratings) | No TTL (persistent) | Redis |
| Analytics (Comments) | No TTL (persistent) | Redis |
| Warehouse Reference | No TTL (persistent) | Redis |

### Cache Keys

| Data Type | Key Format | Example |
|-----------|------------|---------|
| Products | `product:{itemCode}` | `product:WEB-ITM-0002` |
| Queries | `product:query:{queryHash}` | `product:query:abc123...` |
| Prices | `price:{erpnextName}:{sizeUnit}` | `price:WEB-ITM-0002:5lb` |
| Stock | `availability:{itemCode}` | `availability:OL-EN-92-rng-1kg` |
| Warehouse Reference | `warehouses:reference` | `warehouses:reference` |
| Views | `views:{erpnextName}` | `views:WEB-ITM-0002` |
| Ratings | `rating:{erpnextName}` | `rating:WEB-ITM-0002` |
| Comments | `comments:{erpnextName}` | `comments:WEB-ITM-0002` |

### Cache Strategy

**Product Data:**
1. Check Redis cache
2. If cache hit → Return cached data + fetch analytics from Redis
3. If cache miss → Fetch from ERPNext → Transform → Cache → Return + fetch analytics from Redis

**Analytics Data:**
- Always fetched from Redis (never from ERPNext)
- Stored separately from product data
- Updated incrementally via analytics endpoints

---

## Examples

### Complete Product Fetch Flow

```bash
# 1. Fetch product (returns product + analytics)
GET /api/resource/Website%20Item?filters=[["name","=","WEB-ITM-0002"]]

# 2. Increment view count (updates Redis)
POST /api/analytics/product/WEB-ITM-0002/view

# 3. Add rating (updates Redis)
POST /api/analytics/product/WEB-ITM-0002/rating
{
  "starRating": 5
}

# 4. Add comment (updates Redis)
POST /api/analytics/product/WEB-ITM-0002/comment
{
  "text": "Great product!",
  "author": "John Doe"
}
```

### Bulk Updates

```bash
# Update all prices (fetches from ERPNext, stores in Redis)
POST /api/price/update-all

# Update all stock availability (fetches from ERPNext, stores in Redis)
POST /api/stock/update-all
```

### Webhook Integration

```bash
# ERPNext webhook notifies price change
POST /api/webhooks/price-update
{
  "erpnextName": "WEB-ITM-0002",
  "sizeUnit": "5lb",
  "price": 29.99,
  "invalidateCache": true
}
```

---

## Important Notes

### Data Sources

| Data Type | Source | Storage |
|-----------|--------|---------|
| Product Information | ERPNext | Redis (cached) |
| Product Variants | ERPNext | Redis (cached) |
| Product Images | ERPNext | Redis (cached) |
| Prices | ERPNext | Redis (persistent) |
| Stock Availability | ERPNext | Redis (persistent) |
| Views | Mobile App | Redis (persistent) |
| Ratings | Mobile App | Redis (persistent) |
| Comments | Mobile App | Redis (persistent) |

### Identifiers

- **ERPNext Name Field**: Used as primary identifier for analytics (e.g., `WEB-ITM-0002`)
- **Item Code**: Used for price/stock lookups (e.g., `OL-PC-91-vnl-5lb`)
- **Web Item Name**: URL-friendly identifier (e.g., `premium-protein-powder`)

### Product Variants

- Products can have multiple sizes
- Each size can have multiple flavors
- **Prices**: Same for all flavors of a size (only first flavor used for lookup)
- **Stock**: Different for each flavor (all flavors tracked separately)

### Warehouse Reference

- Stored in Redis as `warehouses:reference`
- Can be updated directly in Redis
- All availability arrays must match this reference length
- After updating, run bulk stock update to regenerate arrays

---

## Support

For issues or questions:
- Check server logs: `logs/app.log` and `logs/error.log`
- All errors are logged with structured JSON format
- Analytics data is stored separately and can be inspected in Redis
