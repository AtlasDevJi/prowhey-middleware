# Sync API Documentation

This document defines the API endpoints for syncing data between the middleware and the React Native frontend app. The sync system uses Redis Streams to track changes and only returns updates when data has actually changed.

## Product Deletion Handling

### Automatic Deletion Detection

The middleware automatically detects when products are deleted or unpublished in ERPNext:

1. **Detection Method:** When fetching all products (e.g., via `GET /api/resource/Website Item`), the middleware compares products in Redis cache with products returned from ERPNext
2. **Deletion Process:**
   - Products that exist in Redis but not in ERPNext are marked as deleted
   - A deletion marker entry is added to the `product_changes` stream
   - The product is removed from Redis cache
   - Query caches are invalidated

### Deletion Marker Format

Deletion markers are included in sync responses with the following structure:

```json
{
  "entity_type": "product",
  "entity_id": "WEB-ITM-0001",
  "deleted": true,
  "updated_at": "1768469419660",
  "version": "2",
  "data_hash": "deletion_hash_here",
  "idempotency_key": "uuid-here"
}
```

**Key Fields:**
- `deleted: true` - **Required** - Indicates this is a deletion marker (not an update)
- `entity_id` - The product ID that was deleted
- `entity_type` - Always `"product"` for product deletions
- `data_hash` - Special hash indicating deletion (computed from `{deleted: true, erpnext_name: entity_id}`)
- `version` - Incremented version number
- `updated_at` - Timestamp when deletion was detected

**Note:** Deletion markers do **not** include a `data` field since the product no longer exists.

### Frontend Handling

When your app receives a deletion marker:

1. **Remove from local cache** - Delete the cached product data
2. **Remove from UI lists** - Remove the product from any displayed lists (home page, search results, favorites, etc.)
3. **Handle active views** - If the user is currently viewing the deleted product, show a "Product no longer available" message
4. **Update cached lists** - Remove the product ID from any cached product lists (top_sellers, new_arrivals, etc.)

See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md#handling-deletion-markers) for implementation examples.

### Preventing Duplicate Deletions

The middleware prevents duplicate deletion entries by:
- Checking recent stream entries before adding a new deletion marker
- Tracking processed deletions within the same request
- Only adding one deletion entry per product

---

## Data Sync Strategy

**Important Principle:** All entity data (stock availability, comments, ratings, etc.) should follow a **detail-page-driven caching strategy**:

1. **Fetch Only on Detail Page Access**: Only fetch entity data when a user opens a product detail page
2. **Respect Refresh Rate**: Implement a refresh rate (e.g., 1 hour) to prevent excessive API calls
   - Cache the data in the app with a timestamp
   - Only fetch from API if cache is older than the refresh rate
3. **Server-Side Caching**: Items accessed via detail pages are cached in Redis and served to all users
   - First user to open a detail page triggers the fetch and caches it
   - Subsequent users get the cached data until refresh rate expires
4. **No Background Updates**: Items not accessed in detail view should **not** be updated automatically
   - This prevents unnecessary API calls and server load
   - Only actively viewed products are kept fresh

**Example Flow:**
```
User opens Product Detail Page
  ↓
Check app cache (timestamp)
  ↓
Cache expired? (older than 1 hour)
  ↓ YES
Call sync endpoint or entity-specific endpoint
  ↓
Server checks Redis cache/streams
  ↓
Cache hit → Return cached data
Cache miss → Fetch from ERPNext → Cache → Return
  ↓
App caches response with timestamp
```

**Benefits:**
- Reduces server load by only updating viewed products
- Reduces API calls by respecting refresh rates
- Improves performance by serving cached data to multiple users
- Ensures data freshness for actively viewed products

This strategy applies to all entity types:
- Stock availability (`GET /api/stock/:itemCode`)
- Product comments (`GET /api/analytics/product/:name/comment`)
- Product ratings (included in product fetch)
- Any other entity data endpoints

---

## Base URL

All endpoints are prefixed with `/api/sync`

## Authentication

All sync endpoints require authentication via JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Unified Sync Check

**Endpoint:** `POST /api/sync/check`

Checks for updates across all entity types (or filtered by `entityTypes`).

**Request Body:**
```json
{
  "lastSync": {
    "product": "1768469419660-0",
    "price": "1768469419661-0",
    "stock": "1768469419662-0"
  },
  "entityTypes": ["product", "price"],  // Optional: filter to specific types
  "limit": 100,                          // Optional: max entries per stream (default: 100)
  "userId": "user-123",                  // Optional: for notification filtering
  "userGroups": ["premium"],             // Optional: for notification filtering
  "userRegion": "US"                     // Optional: for notification filtering
}
```

**Response (Updates Available):**
```json
{
  "inSync": false,
  "updates": [
    {
      "entity_type": "product",
      "entity_id": "WEB-ITM-0002",
      "data": { /* Product object (see Product Data Structure below) */ },
      "updated_at": "1768469419659",
      "version": "1",
      "data_hash": "df8c01bca06b5f0ac48a5b35d8c6cc78b78eb4c03ae41f5915eff88ecd169e33",
      "idempotency_key": "742ba7b1-8665-4a93-8f7f-28bdd7465c41"
    },
    {
      "entity_type": "product",
      "entity_id": "WEB-ITM-0001",
      "deleted": true,
      "updated_at": "1768469419660",
      "version": "2",
      "data_hash": "deletion_hash_here",
      "idempotency_key": "another-uuid-here"
    }
  ],
  "lastIds": {
    "product": "1768469419660-0",
    "price": "1768469419661-0"
  }
}
```

**Response (No Updates):**
```json
{
  "inSync": true
}
```

### 2. Fast-Frequency Sync

**Endpoint:** `POST /api/sync/check-fast`

Checks for updates on high-frequency entities (views, comments, user profile). Poll every 5-15 minutes.

**Entity Types:** `view`, `comment`, `user`

**Request Body:**
```json
{
  "lastSync": {
    "view": "1768469419660-0",
    "comment": "1768469419661-0"
  },
  "limit": 100
}
```

**Response:** Same format as unified sync check.

### 3. Medium-Frequency Sync

**Endpoint:** `POST /api/sync/check-medium`

Checks for updates on medium-frequency entities (stock, notifications, announcements). Poll hourly.

**Entity Types:** `stock`, `notification`, `announcement`

**Request Body:**
```json
{
  "lastSync": {
    "stock": "1768469419660-0",
    "notification": "1768469419661-0"
  },
  "limit": 100,
  "userId": "user-123",      // Required for notification filtering
  "userGroups": ["premium"],  // Optional: filter notifications by groups
  "userRegion": "US"          // Optional: filter notifications by region
}
```

**Response:** Same format as unified sync check.

### 4. Slow-Frequency Sync

**Endpoint:** `POST /api/sync/check-slow`

Checks for updates on low-frequency entities (products, prices, hero list). Poll daily or on-demand.

**Entity Types:** `product`, `price`, `hero`

**Request Body:**
```json
{
  "lastSync": {
    "product": "1768469419660-0",
    "price": "1768469419661-0"
  },
  "limit": 100
}
```

**Response:** Same format as unified sync check.

---

## Entity Data Structures

### Product

**Entity Type:** `product`

**Entity ID Format:** ERPNext name field (e.g., `WEB-ITM-0002`)

**Data Structure:**
```typescript
{
  // Basic Information
  name: string;                    // Display name (e.g., "MUSCLETECH Nitro Tech Whey Protein")
  web_item_name: string;           // Website item name (same as name)
  item_code: string;               // Item code (e.g., "MT-PR-02")
  item_name: string;               // Item name (same as name)
  erpnext_name: string;            // ERPNext name field (e.g., "WEB-ITM-0002") - used for analytics key
  
  // Categorization
  brand: string;                   // Brand name (e.g., "MuscleTech")
  item_group: string;              // Item group (e.g., "Protein")
  category: string;                // Category (same as item_group)
  
  // Descriptions
  description: string;            // Short description
  short_description: string;       // Short website description
  web_long_description: string;    // Long HTML description (may contain HTML)
  
  // Media
  website_image?: string;          // URL to product image (optional)
  
  // Variants (Sizes, Units, Flavors, Prices)
  variants: Array<{
    size: number;                  // Size value (e.g., 120, 240, 500, 1000)
    unit: string;                  // Unit (e.g., "caps", "lb", "kg")
    price: number;                 // Base price for this size/unit
    flavors: Array<{
      flavor: string;              // Flavor name (e.g., "Chocolate", "Vanilla")
      itemCode: string;            // Item code for this flavor variant
    }>;
  }>;
  
  // Pricing (computed on-demand, keyed by size/unit)
  prices: {
    [sizeUnit: string]: number;    // e.g., "5lb": 49.99, "10lb": 89.99
  };
  
  // Custom Fields (optional)
  nutritionFacts?: {               // Nutrition facts object (label -> value)
    [label: string]: string | number;
  };
  benefits?: string;                // Benefits text
}
```

**Example Product Update:**
```json
{
  "entity_type": "product",
  "entity_id": "WEB-ITM-0002",
  "data": {
    "name": "MUSCLETECH Nitro Tech Whey Protein",
    "web_item_name": "MUSCLETECH Nitro Tech Whey Protein",
    "item_code": "MT-PR-02",
    "item_name": "MUSCLETECH Nitro Tech Whey Protein",
    "erpnext_name": "WEB-ITM-0002",
    "brand": "MuscleTech",
    "item_group": "Protein",
    "category": "Protein",
    "description": "MUSCLETECH Nitro Tech Whey Protein 10lb 4.54Kg",
    "short_description": "short website description",
    "web_long_description": "<div class=\"ql-editor read-mode\"><p>website description</p></div>",
    "website_image": "https://vikingstore.ch/10391-large_default/kevin-levrone-anabolic-mass-3000g.jpg",
    "variants": [
      {
        "size": 120,
        "unit": "caps",
        "price": 12.5,
        "flavors": [
          {
            "flavor": "Chocolate",
            "itemCode": "OL-PC-91-vnl-1800g"
          },
          {
            "flavor": "Vanilla",
            "itemCode": "OL-PC-91-vnl-1800g"
          }
        ]
      },
      {
        "size": 240,
        "unit": "caps",
        "price": 22,
        "flavors": [
          {
            "flavor": "Chocolate",
            "itemCode": "OL-EN-92-rng-1kg"
          },
          {
            "flavor": "Vanilla",
            "itemCode": "OL-PC-91-vnl-1800g"
          },
          {
            "flavor": "Strawberry",
            "itemCode": "OL-EN-92-rng-1kg"
          }
        ]
      }
    ],
    "prices": {}
  },
  "updated_at": "1768469419659",
  "version": "1",
  "data_hash": "df8c01bca06b5f0ac48a5b35d8c6cc78b78eb4c03ae41f5915eff88ecd169e33",
  "idempotency_key": "742ba7b1-8665-4a93-8f7f-28bdd7465c41"
}
```

**Notes:**
- `erpnext_name` is the key used for analytics (views, ratings, comments) - fetch separately via analytics endpoints
- `variants` array contains all size/unit combinations with their flavors and base prices
- `prices` object is computed on-demand and may be empty if prices haven't been fetched yet
- `nutritionFacts` and `benefits` are optional custom fields that may not be present on all products
- `web_long_description` may contain HTML - render safely in your app

---

### Stock

**Entity Type:** `stock`

**Entity ID Format:** Item code (e.g., `OL-EN-92-rng-1kg`)

**Data Structure:**
```typescript
{
  itemCode: string;           // Item code identifier (e.g., "OL-EN-92-rng-1kg")
  availability: Array<number>; // Binary array [0,0,1,0,1] matching warehouse reference order
}
```

**Warehouse Reference:**
- The `availability` array is a binary array where each index corresponds to a warehouse in the warehouse reference array
- `0` = No stock available in that warehouse
- `1` = Stock available in that warehouse
- The warehouse reference array is stored in Redis key `warehouses:reference` as a JSON array of warehouse names
- The availability array length always matches the warehouse reference array length

**Example Stock Update:**
```json
{
  "entity_type": "stock",
  "entity_id": "OL-EN-92-rng-1kg",
  "data": {
    "itemCode": "OL-EN-92-rng-1kg",
    "availability": [0, 0, 1, 0, 1]
  },
  "updated_at": "1768469419659",
  "version": "1",
  "data_hash": "a1b2c3d4e5f6...",
  "idempotency_key": "uuid-123-456"
}
```

**Warehouse Reference Example:**
If the warehouse reference array is:
```json
["Idlib Store - P", "Allepo Store - P", "Homs Store - P", "Hama Store - P", "Latakia Store - P"]
```

Then an availability array of `[0, 0, 1, 0, 1]` means:
- Index 0 (Idlib Store - P): No stock (0)
- Index 1 (Allepo Store - P): No stock (0)
- Index 2 (Homs Store - P): Stock available (1)
- Index 3 (Hama Store - P): No stock (0)
- Index 4 (Latakia Store - P): Stock available (1)

**Warehouse Reference Management:**

The warehouse reference array is stored in Redis and can be updated directly:

**Get Current Reference:**
```bash
redis-cli GET warehouses:reference
```

**Update Reference:**
```bash
redis-cli SET warehouses:reference '["Warehouse 1","Warehouse 2","Warehouse 3"]'
```

**Important Notes:**
- After updating the warehouse reference array, you must regenerate all availability arrays to match the new reference length
- The weekly full refresh (`refreshAllStock()`) will automatically use the updated warehouse reference
- You can also trigger a manual bulk stock update via `POST /api/stock/update-all` to regenerate all availability arrays
- Warehouse names are matched case-insensitively when building availability arrays
- If a warehouse from ERPNext doesn't match any warehouse in the reference, it will be logged as a warning but won't cause an error

**Notes:**
- Stock availability is fetched from ERPNext Bin API (only warehouses with `actual_qty > 0`)
- Each item code has its own stock availability (different flavors of the same product have different item codes)
- The availability array is computed on-demand when webhooks are triggered or during full refresh
- Stock updates are included in medium-frequency sync (`/api/sync/check-medium`)

---

### Hero

**Entity Type:** `hero`

**Entity ID:** `hero` (single entity, no ID needed)

**Data Structure:**
```typescript
{
  heroImages: Array<string>; // Array of base64-encoded data URLs
}
```

**Hero Images Format:**
- Each image is a base64-encoded data URL
- Format: `data:image/{type};base64,{base64data}`
- Images are downloaded from ERPNext File doctype (where `is_hero = 1`)
- Images are cached as base64 data, not URLs
- Ready for direct display in the app (no additional download needed)

**Example Hero Update:**
```json
{
  "entity_type": "hero",
  "entity_id": "hero",
  "data": {
    "heroImages": [
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    ]
  },
  "updated_at": "1768469419659",
  "version": "1",
  "data_hash": "a1b2c3d4e5f6...",
  "idempotency_key": "uuid-123-456"
}
```

**Notes:**
- Hero images are fetched from ERPNext File doctype with filter `is_hero = 1`
- Images are downloaded and converted to base64 during transformation
- Hero updates are included in slow-frequency sync (`/api/sync/check-slow`)
- Follow detail-page-driven caching strategy (fetch only when home page opens)

---

### Home

**Entity Type:** `home`

**Entity ID:** `home` (single entity, no ID needed)

**Data Structure:**
```typescript
{
  top_sellers: Array<string>;    // Array of item codes
  new_arrivals: Array<string>;   // Array of item codes
  most_viewed: Array<string>;    // Array of item codes
  top_offers: Array<string>;       // Array of item codes
  html1: string;                  // HTML content for section 1
  html2: string;                  // HTML content for section 2
  html3: string;                  // HTML content for section 3
  modified: string;               // Timestamp of last modification
}
```

**Example Home Update:**
```json
{
  "entity_type": "home",
  "entity_id": "home",
  "data": {
    "top_sellers": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
    "new_arrivals": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
    "most_viewed": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
    "top_offers": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
    "html1": "<h1> HTML 1</h1>",
    "html2": "<h1> HTML 2</h1>",
    "html3": "<h1> HTML 3</h1>",
    "modified": "2026-01-15 15:19:15.688817"
  },
  "updated_at": "1768469419659",
  "version": "1",
  "data_hash": "a1b2c3d4e5f6...",
  "idempotency_key": "uuid-123-456"
}
```

**Notes:**
- App Home data is fetched from ERPNext App Home doctype
- If multiple App Home records exist, the latest one (by `modified` timestamp) is selected
- JSON string fields (`top_sellers`, `new_arrivals`, etc.) are parsed into arrays
- HTML fields (`html1`, `html2`, `html3`) are included as strings
- Home updates are included in slow-frequency sync (`/api/sync/check-slow`)
- Follow detail-page-driven caching strategy (fetch only when home page opens)
- See [HOME_DATA_STRUCTURE.md](./HOME_DATA_STRUCTURE.md) for details on adding new fields

---

### Price

**Entity Type:** `price`

**Status:** ⏳ To be documented when price sync is implemented

---

## Response Metadata Fields

All update objects include these metadata fields:

- **`entity_type`** (string): The type of entity (`product`, `price`, `stock`, etc.)
- **`entity_id`** (string): Unique identifier for this entity instance
- **`data`** (object): The actual entity data (structure varies by entity type)
- **`updated_at`** (string): Timestamp when the entity was last updated (Unix timestamp in milliseconds as string)
- **`version`** (string): Version number of the entity (increments on each change)
- **`data_hash`** (string): SHA-256 hash of the data field (for change detection)
- **`idempotency_key`** (string): UUID for idempotency (can be used to deduplicate updates)

## Sync Flow

### Initial Sync (First Time)

1. Call sync endpoint with empty `lastSync`:
   ```json
   {
     "lastSync": {},
     "entityTypes": ["product"]
   }
   ```
2. Server reads from beginning of stream (`'0-0'`) and returns all updates
3. Store `lastIds` from response for subsequent syncs

### Subsequent Syncs

1. Call sync endpoint with `lastIds` from previous response:
   ```json
   {
     "lastSync": {
       "product": "1768469419660-0"
     },
     "entityTypes": ["product"]
   }
   ```
2. Server reads only new entries since that stream ID
3. If `inSync: true`, no updates needed
4. If `inSync: false`, process updates and store new `lastIds`

### Recommended Polling Frequencies

- **Fast-frequency** (`/api/sync/check-fast`): Every 5-15 minutes
- **Medium-frequency** (`/api/sync/check-medium`): Every hour
- **Slow-frequency** (`/api/sync/check-slow`): Daily or on-demand (e.g., on app launch)

## Error Handling

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "path": "/api/sync/check",
  "method": "POST",
  "timestamp": "2026-01-15T09:24:36.631Z"
}
```

Common error codes:
- `VALIDATION_ERROR`: Invalid request body format
- `UNAUTHORIZED`: Missing or invalid authentication token
- `INTERNAL_SERVER_ERROR`: Server-side error

## Rate Limiting

Sync endpoints are rate-limited. Check response headers for rate limit information:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

**Last Updated:** 2026-01-15  
**Version:** 1.0.0
