# Frontend API Data Types

This document lists all JSON data types returned to the frontend by the Prowhey Middleware API.

## Standard Response Wrapper

All API responses follow a standard format:

```typescript
{
  success: boolean,  // true for success, false for errors
  data?: object,     // Response data (if success)
  error?: string,    // Error type (if error)
  message?: string,  // Human-readable message (if error)
  // ... other fields specific to endpoint
}
```

---

## Authentication

### User Object
**Type:** `object`  
**Description:** User profile data (registered or anonymous user)

```typescript
{
  id: string,                      // Unique user ID (usr_...)
  email?: string,                  // Email address
  username?: string,               // Username
  phone?: string,                  // Phone number (E.164 format)
  firstName?: string,              // First name
  surname?: string,                // Surname
  age?: number,                    // Age (13-120)
  occupation?: string,             // Occupation
  fitnessLevel?: string,           // 'beginner' | 'intermediate' | 'advanced' | 'professional'
  gender?: string,                 // 'male' | 'female' | 'other' | 'prefer_not_to_say'
  fitnessGoal?: string,            // 'weight_loss' | 'muscle_gain' | 'endurance' | 'general_fitness' | 'athletic_performance' | 'rehabilitation'
  province?: string,               // Province name
  city?: string,                   // City name
  whatsappNumber?: string,         // WhatsApp number
  telegramUsername?: string,       // Telegram username (e.g., @username)
  avatar?: string,                 // Base64-encoded image data URL
  deviceModel?: string,            // Device model
  osModel?: string,                // OS version
  geolocation?: GeolocationObject, // Geolocation data (see below)
  locationConsent?: boolean,       // Whether user consented to location tracking
  customerType?: string,           // 'retail' (default)
  erpnextCustomerId?: string,      // ERPNext customer ID
  approvedCustomer?: boolean,      // Whether customer is approved for orders
  isVerified?: boolean,            // Whether account is verified
  idVerified?: boolean,            // Whether ID is verified
  phoneVerified?: boolean,         // Whether phone is verified
  accountStatus?: string,          // Account health: 'active' | 'pending_verification' | 'disabled' | 'suspended'
  userStatus?: string,             // User progression: 'unregistered' | 'registered' | 'erpnext_customer' | 'verified'
  trustScore?: number,             // Trust score (0-100)
  createdAt?: string,              // ISO timestamp
  lastLogin?: string,              // ISO timestamp
  isRegistered?: boolean,          // Whether user is registered (vs anonymous) - legacy field, use userStatus instead
}
```

### Geolocation Object
**Type:** `object`  
**Description:** User geolocation data (with consent)

```typescript
{
  lat: number,        // Latitude
  lng: number,        // Longitude
  province?: string,  // Province name (from reverse geocoding)
  city?: string,      // City name (from reverse geocoding)
}
```

### Auth Tokens
**Type:** `object`  
**Description:** JWT authentication tokens

```typescript
{
  accessToken: string,   // Short-lived access token (15 min)
  refreshToken: string,  // Long-lived refresh token (1 year)
}
```

---

## Products

### Product Object
**Type:** `object`  
**Description:** Product data with variants, prices, and metadata

```typescript
{
  name: string,                      // Product name (ERPNext web_item_name)
  erpnext_name: string,              // ERPNext name (e.g., WEB-ITM-0002)
  item_code: string,                 // Item code
  item_name: string,                 // Item name
  brand?: string,                    // Brand name
  item_group?: string,               // Item group/category
  category?: string,                 // Category (same as item_group)
  description?: string,              // Full description
  short_description?: string,        // Short description
  web_long_description?: string,     // Web long description
  website_image?: string,            // Website image URL
  variants: Variant[],               // Product variants (see below)
  prices: PriceMap,                  // Prices by size (see below)
  nutritionFacts?: object,           // Nutrition facts (label-value pairs)
  benefits?: string[],               // Array of benefit strings
}
```

### Variant Object
**Type:** `object`  
**Description:** Product variant (size with flavors)

```typescript
{
  size: string,         // Size value (e.g., "5")
  unit: string,         // Unit (e.g., "lb", "kg", "caps")
  flavors: Flavor[],    // Available flavors (see below)
}
```

### Flavor Object
**Type:** `object`  
**Description:** Product flavor variant

```typescript
{
  itemCode: string,     // Unique item code for this flavor
  flavor: string,       // Flavor name
}
```

### Price Map
**Type:** `object`  
**Description:** Prices mapped by size identifier (e.g., "5lb")

```typescript
{
  "5lb": PriceArray,    // Prices for "5lb" size
  "10lb": PriceArray,   // Prices for "10lb" size
  // ... other sizes
}
```

### Price Array
**Type:** `array<number>`  
**Description:** Price array [retail, wholesale]

```typescript
[number, number]  // [retailPrice, wholesalePrice]
```

---

## Stock & Warehouses

### Stock Availability
**Type:** `object`  
**Description:** Stock availability for an item

```typescript
{
  success: boolean,
  itemCode: string,
  availability: number[],  // Binary array [0,0,1,0,1] (1=stock available at warehouse index)
}
```

### Warehouse Reference
**Type:** `object`  
**Description:** Warehouse reference with coordinates

```typescript
{
  success: boolean,
  warehouses: (WarehouseObject | string)[],  // Array of warehouses (objects with coords or strings)
  count: number,                             // Number of warehouses
}
```

### Warehouse Object
**Type:** `object`  
**Description:** Warehouse with geographic coordinates

```typescript
{
  name: string,   // Warehouse name
  lat?: number,   // Latitude (optional)
  lng?: number,   // Longitude (optional)
}
```

---

## Home & Hero

### Home Data
**Type:** `object`  
**Description:** App home page data

```typescript
{
  success: boolean,
  top_sellers: string[],      // Array of product names (ERPNext names)
  new_arrivals: string[],     // Array of product names
  most_viewed: string[],      // Array of product names
  top_offers: string[],       // Array of product names
  html1?: string,             // HTML content block 1
  html2?: string,             // HTML content block 2
  html3?: string,             // HTML content block 3
  modified?: string,          // ISO timestamp
}
```

### Hero Images
**Type:** `object`  
**Description:** Hero images for home page

```typescript
{
  success: boolean,
  heroImages: string[],  // Array of base64-encoded image data URLs
}
```

### Bundle Images
**Type:** `object`  
**Description:** Bundle offer images

```typescript
{
  success: boolean,
  bundleImages: string[],  // Array of base64-encoded image data URLs
}
```

---

## Analytics (Public Read)

### Product Views
**Type:** `object`  
**Description:** Product view count

```typescript
{
  success: boolean,
  views: number,  // Total view count
}
```

### Product Comments
**Type:** `object`  
**Description:** Product comments array

```typescript
{
  success: boolean,
  comments: Comment[],  // Array of comment objects (see below)
}
```

### Comment Object
**Type:** `object`  
**Description:** Individual product comment

```typescript
{
  id: string,            // Unique comment ID
  text: string,          // Comment text
  author: string,        // Author name
  timestamp: string,     // ISO timestamp
  // ... other custom fields
}
```

### Product Ratings
**Type:** `object`  
**Description:** Product rating breakdown and review count

```typescript
{
  success: boolean,
  ratingBreakdown: {
    "1": number,  // Count of 1-star ratings
    "2": number,  // Count of 2-star ratings
    "3": number,  // Count of 3-star ratings
    "4": number,  // Count of 4-star ratings
    "5": number,  // Count of 5-star ratings
  },
  reviewCount: number,  // Total number of reviews
}
```

### Wishlist
**Type:** `object`  
**Description:** User's wishlist (authenticated only)

```typescript
{
  success: boolean,
  wishlist: string[],  // Array of product names (ERPNext names)
}
```

---

## Analytics (Write Responses)

### Batch Events Response
**Type:** `object`  
**Description:** Batch analytics events processing result

```typescript
{
  success: boolean,
  processed: number,        // Number of events processed
  failed: number,           // Number of events that failed
  errors?: string[],        // Error messages (if any)
}
```

### Session Response
**Type:** `object`  
**Description:** App session tracking response

```typescript
{
  success: boolean,
  sessionId?: string,       // Session ID
  startTime?: string,       // ISO timestamp (for app_open)
  endTime?: string,         // ISO timestamp (for app_close)
  lastSeen?: string,        // ISO timestamp (for heartbeat)
}
```

---

## Sync API

### Sync Response
**Type:** `object`  
**Description:** Sync check response with updates or inSync status

```typescript
{
  inSync: boolean,           // true if no updates, false if updates available
  updates?: UpdateObject[],  // Array of update objects (if inSync: false)
  lastIds?: {               // Last stream IDs (if inSync: false)
    [entityType: string]: string,  // Entity type -> last stream ID
  },
}
```

### Update Object
**Type:** `object`  
**Description:** Individual entity update from sync

```typescript
{
  entity_type: string,       // 'product' | 'price' | 'stock' | 'notification' | etc.
  entity_id: string,         // Entity ID (e.g., product name, item code)
  data?: object,             // Entity data (product object, price array, etc.)
  updated_at: string,        // ISO timestamp
  version: string,           // Version number
  data_hash: string,         // SHA-256 hash of data
  idempotency_key?: string,  // Optional idempotency key
  deleted?: boolean,         // true if entity was deleted
}
```

---

## Health & Status

### Health Check
**Type:** `object`  
**Description:** System health status

```typescript
{
  status: string,              // 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string,           // ISO timestamp
  uptime: number,              // Process uptime in seconds
  components: {
    redis?: ComponentStatus,
    erpnext?: ComponentStatus,
  },
}
```

### Component Status
**Type:** `object`  
**Description:** Individual component health status

```typescript
{
  status: string,    // 'healthy' | 'degraded' | 'unhealthy'
  latency?: number,  // Latency in milliseconds (if applicable)
  message?: string,  // Status message
}
```

### Sync Status
**Type:** `object`  
**Description:** Stream sync status information

```typescript
{
  timestamp: string,
  streams: {
    [streamName: string]: {  // e.g., "product_changes"
      length: number,         // Number of entries in stream
      firstId: string | null, // First entry ID
      lastId: string | null,  // Last entry ID
    },
  },
}
```

---

## Users (Anonymous)

### Anonymous User Response
**Type:** `object`  
**Description:** Anonymous user creation/update response

```typescript
{
  success: boolean,
  data: {
    userId: string,           // Unique user ID
    isRegistered: boolean,    // false for anonymous users
  },
}
```

### Device Info Response
**Type:** `object`  
**Description:** Device information update response

```typescript
{
  success: boolean,
  message: string,
  data: {
    userId: string,
    isRegistered: boolean,
  },
}
```

### Geolocation Response
**Type:** `object`  
**Description:** Geolocation update response

```typescript
{
  success: boolean,
  message: string,
  data: {
    userId: string,
    geolocation: GeolocationObject | null,  // null if consent revoked
    locationConsent: boolean,
  },
}
```

---

## Webhooks

### Webhook Response
**Type:** `object`  
**Description:** Webhook processing result

```typescript
{
  success: boolean,
  message: string,           // e.g., "stock webhook processed successfully"
  changed: boolean,          // Whether data actually changed
  version?: string,          // Entity version
  streamId?: string | null,  // Stream entry ID (null if no change)
  entity_type: string,       // Entity type processed
}
```

---

## Bulk Operations

### Bulk Update Summary
**Type:** `object`  
**Description:** Bulk update operation summary (stock, prices, etc.)

```typescript
{
  success: boolean,
  total?: number,            // Total items processed
  updated?: number,          // Number of items updated
  unchanged?: number,        // Number of items unchanged
  failed?: number,           // Number of items that failed
  errors?: Array<{           // Error details (if any)
    itemCode?: string,
    erpnextName?: string,
    error: string,
  }>,
}
```

---

## Error Responses

### Error Object
**Type:** `object`  
**Description:** Standard error response

```typescript
{
  success: false,
  error: string,            // Error type (e.g., "ValidationError", "UnauthorizedError")
  code?: string,            // Error code (e.g., "VALIDATION_ERROR")
  message: string,          // Human-readable error message
}
```

---

## Data Type Summary

| Data Type | Type | Description |
|-----------|------|-------------|
| **User** | `object` | Complete user profile data |
| **Geolocation** | `object` | Latitude, longitude, province, city |
| **Product** | `object` | Product with variants, prices, metadata |
| **Variant** | `object` | Size with unit and flavors |
| **Flavor** | `object` | Flavor with item code |
| **Price Array** | `number[]` | [retail, wholesale] |
| **Stock Availability** | `number[]` | Binary array [0,0,1,0,1] |
| **Warehouse** | `object\|string` | Warehouse name with optional coordinates |
| **Home Data** | `object` | Top sellers, new arrivals, HTML blocks |
| **Hero Images** | `string[]` | Base64 image data URLs |
| **Comment** | `object` | Comment with id, text, author, timestamp |
| **Rating Breakdown** | `object` | Star rating counts (1-5) |
| **Sync Response** | `object` | Updates array or inSync flag |
| **Update Object** | `object` | Entity update with data and metadata |
| **Health Status** | `object` | System and component health |
| **Auth Tokens** | `object` | JWT access and refresh tokens |

---

## User Status Progression

The `userStatus` field tracks progressive user stages:

- **`unregistered`**: User has ID but hasn't completed registration (no email/password). Can update profile fields like location, device info, and personal details without authentication credentials.

- **`registered`**: User completed registration (has email/username + password). Can update all profile fields, but sensitive changes (email, username) require password confirmation.

- **`erpnext_customer`**: User has ERPNext customer account (`erpnextCustomerId` is set). Can place orders and access payment history (if `approvedCustomer: true`).

- **`verified`**: User has verified ID (`idVerified: true`). Highest trust level, eligible for credit/advanced features.

**Status Transitions:**
- Status automatically progresses forward: `unregistered` → `registered` → `erpnext_customer` → `verified`
- Transitions occur automatically when:
  - Signup completion → `registered`
  - `erpnextCustomerId` set → `erpnext_customer`
  - `idVerified` becomes true → `verified`
- Status cannot be downgraded (only forward progression allowed)

**Note:** `accountStatus` is separate and tracks account health (active/disabled/suspended), while `userStatus` tracks progression through the user journey.

---

**Last Updated:** 2025-01-20  
**Note:** All timestamps are ISO 8601 format strings. All numeric IDs are strings. Arrays are empty arrays `[]` if no data exists.
