# Prowhey Middleware API Documentation

## Table of Contents

- [Base URL & Authentication](#base-url--authentication)
- [Response Format](#response-format)
- [Authentication Endpoints](#authentication-endpoints)
- [Product Endpoints](#product-endpoints)
- [Analytics Endpoints](#analytics-endpoints)
- [Price Management](#price-management)
- [Stock Management](#stock-management)
- [Webhooks](#webhooks) - See [ERPNEXT_WEBHOOKS.md](./ERPNEXT_WEBHOOKS.md) for ERPNext webhook configuration guide
- [Sync API](#sync-api) - See [SYNC_API.md](./SYNC_API.md) for detailed sync endpoint documentation
- [Frontend Integration](#frontend-integration) - See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) for React Native integration guide
- [Error Handling](#error-handling)
- [Caching Strategy](#caching-strategy)
- [Examples](#examples)

---

## Base URL & Authentication

| Environment | Base URL |
|------------|----------|
| Production | `https://your-domain.com` |
| Development | `http://localhost:3001` |

**Authentication:** 
- **Public Endpoints**: Product, analytics, and webhook endpoints use server-side ERPNext credentials. No user authentication required.
- **Protected Endpoints**: User account endpoints require JWT Bearer token authentication. See [Authentication Endpoints](#authentication-endpoints) for details.

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

## Authentication Endpoints

All authentication endpoints are prefixed with `/api/auth`. Most endpoints require a `X-Device-ID` header for rate limiting purposes.

### Authentication Flow

1. **Signup** → User registers with email/phone and password
2. **Verify** → User verifies account with OTP code (SMS/WhatsApp)
3. **Login** → User authenticates and receives JWT tokens
4. **Use Tokens** → Include `Authorization: Bearer <accessToken>` header for protected endpoints

### JWT Tokens

- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (1 year safety net), used to get new access tokens
- **Token Rotation**: Each refresh returns a new refresh token, enabling indefinite login sessions
- **Token Format**: Include in `Authorization` header as `Bearer <token>`

**Indefinite Login:**
- Users stay logged in indefinitely as long as they use the app regularly
- Each token refresh issues a new refresh token, extending the session
- Users only need to log in again if they don't use the app for over 1 year, or if they explicitly log out

---

### POST /api/auth/signup

Register a new user account.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `username` | string | Yes | Username (3-32 chars, alphanumeric + underscore) |
| `email` | string | No* | Email address (required if phone not provided) |
| `password` | string | Yes | Password (minimum 6 characters) |
| `phone` | string | No* | Phone number in E.164 format (e.g., +1234567890) |
| `verificationMethod` | string | No | `sms` or `whatsapp` (defaults to `sms` if phone provided) |
| `deviceId` | string | Yes | Device identifier |
| `googleId` | string | No | Google OAuth ID (for Google signup) |

\* Either `email` or `phone` must be provided.

**Example Request:**

```http
POST /api/auth/signup
Content-Type: application/json
X-Device-ID: device-123

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepass123",
  "phone": "+1234567890",
  "verificationMethod": "sms",
  "deviceId": "device-123"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "john@example.com",
      "username": "johndoe",
      "isVerified": false
    },
    "needsVerification": true
  }
}
```

**Note:** If `needsVerification` is `true`, user must verify account with OTP before login. Google OAuth users are auto-verified.

---

### POST /api/auth/verify

Verify user account with OTP code received via SMS/WhatsApp.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `userId` | string | Yes | User ID from signup response |
| `code` | string | Yes | 6-digit OTP code |
| `method` | string | Yes | `sms` or `whatsapp` |

**Example Request:**

```http
POST /api/auth/verify
Content-Type: application/json
X-Device-ID: device-123

{
  "userId": "usr_abc123",
  "code": "123456",
  "method": "sms"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_abc123",
      "email": "john@example.com",
      "username": "johndoe",
      "isVerified": true
    }
  }
}
```

**Error Responses:**

- `400`: Invalid or expired code
- `404`: User not found

---

### POST /api/auth/login

Authenticate user and receive JWT tokens.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `email` | string | No* | Email address |
| `username` | string | No* | Username |
| `password` | string | Yes | Password |
| `phone` | string | No | Phone number (not yet supported) |
| `googleToken` | string | No | Google OAuth token |

\* Either `email` or `username` must be provided.

**Example Request:**

```http
POST /api/auth/login
Content-Type: application/json
X-Device-ID: device-123

{
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_abc123",
      "email": "john@example.com",
      "username": "johndoe",
      "isVerified": true
    }
  }
}
```

**Error Responses:**

- `401`: Invalid credentials or account not verified
- `400`: Missing required fields

---

### POST /api/auth/google-login

Authenticate with Google OAuth (app handles OAuth flow).

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `email` | string | Yes | Email from Google account |
| `name` | string | Yes | User's name from Google |
| `googleId` | string | Yes | Google user ID |
| `deviceId` | string | Yes | Device identifier |

**Example Request:**

```http
POST /api/auth/google-login
Content-Type: application/json
X-Device-ID: device-123

{
  "email": "john@gmail.com",
  "name": "John Doe",
  "googleId": "google_123456",
  "deviceId": "device-123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_abc123",
      "email": "john@gmail.com",
      "username": "john",
      "isVerified": true
    }
  }
}
```

---

### GET /api/auth/me

Get current authenticated user information.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <accessToken>` |
| `X-Device-ID` | string | Yes | Unique device identifier |

**Example Request:**

```http
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-ID: device-123
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "john@example.com",
      "username": "johndoe",
      "phone": "+1234567890",
      "erpnextCustomerId": "CUST-001",
      "approvedCustomer": true,
      "isVerified": true,
      "accountStatus": "active",
      "userStatus": "erpnext_customer",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "lastLogin": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Note:** `userStatus` tracks user progression: `unregistered` → `registered` → `erpnext_customer` → `verified`. `accountStatus` tracks account health: `active`, `pending_verification`, `disabled`, `suspended`.

**Error Responses:**

- `401`: Invalid or expired token

---

### PUT /api/auth/profile

Update user profile. Supports progressive updates for unregistered users (no password confirmation required for profile fields).

**Progressive Updates:**
- **Unregistered users** (`userStatus: 'unregistered'`): Can update profile fields (location, device info, personal details) without password confirmation. Cannot update email/username (must use signup endpoint).
- **Registered users** (`userStatus: 'registered'` or higher): Can update all fields. Password confirmation required for sensitive changes (email, username).

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <accessToken>` |
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `username` | string | No | New username (3-32 chars) - requires password confirmation for registered users |
| `email` | string | No | New email address - requires password confirmation for registered users |
| `phone` | string | No | New phone number (E.164 format) |
| `first_name` | string | No | First name |
| `surname` | string | No | Surname |
| `age` | number | No | Age (13-120) |
| `province` | string | No | Province name |
| `city` | string | No | City name |
| `erpnext_customer_id` | string | No | ERPNext customer ID (set from admin/Redis) |
| `approved_customer` | boolean | No | Whether customer is approved for orders |
| `userStatus` | string | No | Explicit status update: 'unregistered' \| 'registered' \| 'erpnext_customer' \| 'verified' (must be progression forward) |
| `passwordConfirmed` | boolean | No | Required only for registered users updating email/username |

**Note:** 
- If email is changed, user must verify new email with OTP.
- `userStatus` automatically transitions when conditions are met (signup → registered, erpnextCustomerId set → erpnext_customer, idVerified → verified).

**Example Request:**

```http
PUT /api/auth/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-ID: device-123

{
  "username": "newusername",
  "passwordConfirmed": true
}
```

**Response (200 OK) - No Email Change:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "john@example.com",
      "username": "newusername",
      "phone": "+1234567890",
      "erpnextCustomerId": "CUST-001",
      "approvedCustomer": true,
      "isVerified": true,
      "accountStatus": "active",
      "userStatus": "erpnext_customer"
    }
  }
}
```

**Example Request - Progressive Update (Unregistered User):**

```http
PUT /api/auth/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-ID: device-123

{
  "first_name": "John",
  "province": "Damascus",
  "city": "Damascus"
}
```

**Response (200 OK) - Progressive Update:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "userStatus": "unregistered",
      "accountStatus": "active",
      "firstName": "John",
      "province": "Damascus",
      "city": "Damascus"
    }
  }
}
```

**Response (200 OK) - Email Change (Requires Verification):**

```json
{
  "success": true,
  "data": {
    "needsEmailVerification": true,
    "message": "Email verification code sent",
    "code": "123456"
  }
}
```

**Note:** In development mode, verification code is returned in response. In production, code is sent via SMS/WhatsApp.

**Error Responses:**

- `400`: Validation error or password not confirmed
- `401`: Invalid or expired token
- `409`: Username or email already taken

---

### POST /api/auth/verify-email

Verify email change with OTP code.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <accessToken>` |
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `code` | string | Yes | 6-digit OTP code |

**Example Request:**

```http
POST /api/auth/verify-email
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-ID: device-123

{
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "newemail@example.com",
      "username": "johndoe",
      "phone": "+1234567890",
      "isVerified": true
    }
  }
}
```

**Error Responses:**

- `400`: Invalid or expired code
- `401`: Invalid or expired token

---

### PUT /api/auth/password

Change user password.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <accessToken>` |
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `currentPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password (minimum 6 characters) |

**Example Request:**

```http
PUT /api/auth/password
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-ID: device-123

{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**

- `400`: Validation error
- `401`: Invalid current password or expired token

---

### POST /api/auth/forgot-password

Request password reset. Sends reset code via SMS/WhatsApp.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `email` | string | No* | Email address |
| `phone` | string | No* | Phone number (E.164 format) |
| `verificationMethod` | string | No | `sms` or `whatsapp` |

\* Either `email` or `phone` must be provided.

**Example Request:**

```http
POST /api/auth/forgot-password
Content-Type: application/json
X-Device-ID: device-123

{
  "email": "john@example.com",
  "phone": "+1234567890",
  "verificationMethod": "sms"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "If the account exists, a reset code has been sent"
}
```

**Note:** Response is generic for security (doesn't reveal if email exists).

---

### POST /api/auth/reset-password

Reset password using reset token.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Device-ID` | string | Yes | Unique device identifier |
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `token` | string | Yes | Reset token (from forgot-password) |
| `newPassword` | string | Yes | New password (minimum 6 characters) |

**Example Request:**

```http
POST /api/auth/reset-password
Content-Type: application/json
X-Device-ID: device-123

{
  "token": "abc123def456...",
  "newPassword": "newsecurepass123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Responses:**

- `400`: Invalid or expired token

---

### POST /api/auth/refresh

Refresh access token and issue new refresh token (token rotation). This enables **indefinite login sessions** as long as the user uses the app regularly.

**How Token Rotation Works:**
- Each time you refresh, you receive a **new refresh token** along with a new access token
- As long as the user uses the app (and tokens are refreshed), they stay logged in indefinitely
- The refresh token has a 1-year expiry as a safety net, but it's renewed on each refresh
- **Important**: Always store the new refresh token returned in the response

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |

| Body Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `refreshToken` | string | Yes | Refresh token from login/verify or previous refresh |

**Example Request:**

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> **Important**: The response includes a **new refresh token**. You must store this new refresh token and use it for the next refresh request. The old refresh token becomes invalid after use.

**Error Responses:**

- `400`: Refresh token required
- `403`: Invalid or expired refresh token

---

### POST /api/auth/logout

Logout (client-side token removal). This endpoint always returns success. Client should remove tokens from storage.

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | Must be `application/json` |

**Example Request:**

```http
POST /api/auth/logout
Content-Type: application/json
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### DELETE /api/auth/account

Delete user account (soft delete - can be recovered within 30 days).

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | Yes | `Bearer <accessToken>` |
| `X-Device-ID` | string | Yes | Unique device identifier |

**Example Request:**

```http
DELETE /api/auth/account
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-ID: device-123
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Error Responses:**

- `401`: Invalid or expired token
- `500`: Failed to delete account

---

### GET /api/auth/check-username

Check if username is available.

| Query Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `username` | string | Yes | Username to check |

**Example Request:**

```http
GET /api/auth/check-username?username=johndoe
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "available": true
  }
}
```

**Error Responses:**

- `400`: Username parameter required

---

## Product Endpoints

**Note:** Follow the [detail-page-driven caching strategy](#data-sync-strategy) - only fetch product data when a user opens a product detail page, and respect your refresh rate (e.g., 1 hour).

### Get Single Product

**Endpoint:** `GET /api/resource/Website Item?filters=[["name", "=", "WEB-ITM-0002"]]`

Fetches a single product by its ERPNext name field. Returns product data from ERPNext (cached) plus analytics data from Redis.

**Usage:** Call this endpoint only when a user opens a product detail page, and only if the app's cached data is older than your refresh rate (e.g., 1 hour).

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

**Note:** Follow the [detail-page-driven caching strategy](#data-sync-strategy) - only fetch analytics data (comments, ratings) when a user opens a product detail page, and respect your refresh rate (e.g., 1 hour).

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

Adds a star rating (1-5) to a product. **Increments the specific star rating field in the breakdown** and updates the total review count.

**How It Works:**
- When a user votes (e.g., 2 stars), the API increments the `"2"` field in the `ratingBreakdown` object
- The `reviewCount` is also incremented by 1
- The response returns the updated breakdown with all star counts

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | Path | Yes | ERPNext name field (e.g., `WEB-ITM-0002`) |
| `starRating` | Body | Yes | Integer between 1 and 5 |

**Request Body:**
```json
{
  "starRating": 2
}
```

**Example Request:**
```bash
POST /api/analytics/product/WEB-ITM-0002/rating
Content-Type: application/json

{
  "starRating": 2
}
```

**Response:**
```json
{
  "success": true,
  "ratingBreakdown": {
    "1": 5,
    "2": 3,
    "3": 8,
    "4": 25,
    "5": 61
  },
  "reviewCount": 102
}
```

> **Note:** In the example above, if the previous `"2"` count was 2, it is now incremented to 3 after the user's vote.

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

**Frontend Integration Guide:**

1. **User Submits Rating:**
   - Capture the star rating (1-5) from your UI component
   - Send POST request with the selected rating

2. **Update UI After Response:**
   - Use the returned `ratingBreakdown` to update your star distribution display
   - Use `reviewCount` to update the total reviews count
   - Calculate average rating: `(1*count1 + 2*count2 + 3*count3 + 4*count4 + 5*count5) / reviewCount`

3. **Example Frontend Code (React/JavaScript):**
```javascript
// Submit rating
async function submitRating(productName, starRating) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/analytics/product/${productName}/rating`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ starRating }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to submit rating');
    }

    const data = await response.json();
    
    // Update your UI with the new breakdown
    updateRatingDisplay(data.ratingBreakdown, data.reviewCount);
    
    return data;
  } catch (error) {
    console.error('Error submitting rating:', error);
    throw error;
  }
}

// Calculate average rating from breakdown
function calculateAverageRating(ratingBreakdown, reviewCount) {
  if (reviewCount === 0) return 0;
  
  const total = 
    (1 * ratingBreakdown['1']) +
    (2 * ratingBreakdown['2']) +
    (3 * ratingBreakdown['3']) +
    (4 * ratingBreakdown['4']) +
    (5 * ratingBreakdown['5']);
  
  return total / reviewCount;
}

// Example usage
const productName = 'WEB-ITM-0002';
const userSelectedStars = 2; // User clicked 2 stars

submitRating(productName, userSelectedStars)
  .then((result) => {
    console.log('Rating submitted successfully');
    console.log('Updated breakdown:', result.ratingBreakdown);
    console.log('Total reviews:', result.reviewCount);
    console.log('Average rating:', calculateAverageRating(result.ratingBreakdown, result.reviewCount));
  })
  .catch((error) => {
    console.error('Failed to submit rating:', error);
  });
```

4. **Display Rating Breakdown:**
   - Use `ratingBreakdown["1"]` through `ratingBreakdown["5"]` to show how many users voted for each star level
   - Display as a bar chart or percentage distribution
   - Example: "5 stars: 61 votes (60.4%)"

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

### Data Sync Strategy

**Important:** Stock availability (and other entity data like comments, ratings) should follow a **detail-page-driven caching strategy**:

1. **Fetch Only on Detail Page Access**: Only fetch stock availability when a user opens a product detail page
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
Call GET /api/stock/:itemCode
  ↓
Server checks Redis cache
  ↓
Cache hit → Return cached data
Cache miss → Fetch from ERPNext → Cache → Return
  ↓
App caches response with timestamp
```

This strategy applies to:
- Stock availability
- Product comments
- Product ratings
- Any other entity data that benefits from on-demand caching

---

### Get Stock Availability for Specific Item

**Endpoint:** `GET /api/stock/:itemCode`

Get stock availability array for a specific item code. Returns only the availability array (warehouse reference should be fetched separately).

**Usage:** Call this endpoint only when a user opens a product detail page, and only if the app's cached data is older than your refresh rate (e.g., 1 hour).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `itemCode` | Path | Yes | Item code (e.g., `OL-EN-92-rng-1kg`) |

**Example Request:**
```bash
GET /api/stock/OL-EN-92-rng-1kg
```

**Response:**
```json
{
  "success": true,
  "itemCode": "OL-EN-92-rng-1kg",
  "availability": [0, 0, 1, 0, 1, 0, 0]
}
```

**Availability Array Interpretation:**
- Each index corresponds to a warehouse in the warehouse reference array
- `0` = No stock in that warehouse
- `1` = Stock available in that warehouse
- Array length matches the warehouse reference array length
- Example: `[0, 0, 1, 0, 1, 0, 0]` means stock is available at index 2 and index 4 (check warehouse reference to see which warehouses these are)

**Note:** The warehouse reference array should be fetched separately using `GET /api/stock/warehouses/reference` and cached in the app. Since warehouses rarely change, fetch this once a month.

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `404` | Not Found | Item code not found or no stock data cached |
| `500` | Internal Server Error | Failed to fetch stock availability |

---

### Get Warehouse Reference

**Endpoint:** `GET /api/stock/warehouses/reference`

Get the warehouse reference array. This defines the order of warehouses used in availability arrays. **Fetch this once a month** since warehouses are rarely added or removed.

**Example Request:**
```bash
GET /api/stock/warehouses/reference
```

**Response (200 OK) - New Format (with coordinates):**
```json
{
  "success": true,
  "warehouses": [
    {"name": "Idlib Store", "lat": 35.9333, "lng": 36.6333},
    {"name": "Aleppo Store", "lat": 36.2021, "lng": 37.1343},
    {"name": "Hama Store", "lat": 35.1318, "lng": 36.7578},
    {"name": "Homs Store", "lat": 34.7268, "lng": 36.7234},
    {"name": "Tartus Store", "lat": 34.8886, "lng": 35.8869},
    {"name": "Latakia Store", "lat": 35.5241, "lng": 35.7874},
    {"name": "Damascus Store", "lat": 33.5138, "lng": 36.2765}
  ],
  "count": 7
}
```

**Response (200 OK) - Legacy Format (names only):**
```json
{
  "success": true,
  "warehouses": [
    "Idlib Store",
    "Aleppo Store",
    "Hama Store",
    "Homs Store",
    "Tartus Store",
    "Latakia Store",
    "Damascus Store"
  ],
  "count": 7
}
```

**Usage:**
- Store this array in your app
- Use it to interpret availability arrays from stock endpoints
- Each index in the availability array corresponds to the warehouse at that index in this reference
- If warehouses have coordinates (`lat`, `lng`), you can use them to calculate distances and show warehouse locations on a map
- Fetch once a month or when you detect a change in availability array length
- The system supports both formats (objects with coordinates or strings) for backward compatibility

**Example:**
If availability array is `[0, 0, 1, 0, 1, 0, 0]` and warehouse reference is `[{"name":"Idlib Store","lat":35.9333,"lng":36.6333}, {"name":"Aleppo Store","lat":36.2021,"lng":37.1343}, {"name":"Hama Store","lat":35.1318,"lng":36.7578}, ...]` (or legacy format: `["Idlib Store", "Aleppo Store", "Hama Store", ...]`):
- Index 0 (Idlib Store): No stock (0)
- Index 1 (Aleppo Store): No stock (0)
- Index 2 (Hama Store): Stock available (1)
- Index 3 (Homs Store): No stock (0)
- Index 4 (Tartus Store): Stock available (1)
- Index 5 (Latakia Store): No stock (0)
- Index 6 (Damascus Store): No stock (0)

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `500` | Internal Server Error | Failed to fetch warehouse reference |

---

### Bulk Stock Snapshot (All Items)

**Endpoint:** `POST /api/stock/update-all`

Triggers a bulk stock snapshot for all published products. Fetches stock from ERPNext Bin API for all item codes found in product variants, compares with cached data, and updates cache and streams only if changes are detected.

**Key Features:**
- Processes **ALL flavors** (not just first) since each flavor has its own stock availability
- **Deduplicates item codes** - processes each unique item code only once, even if it appears multiple times in variants
- **Hash-based change detection** - only updates stream if data changed
- **Manual change detection** - detects if Redis values were manually changed and updates accordingly
- **Parallel processing** - processes items in batches of 10 for better performance
- Runs automatically weekly via scheduler (configurable)

**Example Request:**
```bash
POST /api/stock/update-all
```

**Response:**
```json
{
  "success": true,
  "totalProductsFetched": 6,
  "productsWithVariants": 6,
  "itemsProcessed": 15,
  "updated": 12,
  "unchanged": 3,
  "failed": 0,
  "errors": []
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `totalProductsFetched` | Total number of unique item codes found across all products |
| `productsWithVariants` | Same as `totalProductsFetched` (for compatibility) |
| `itemsProcessed` | Total number of unique item codes processed (deduplicated) |
| `updated` | Number of items updated (data changed or manual change detected) |
| `unchanged` | Number of items with no changes detected |
| `failed` | Number of items that failed to process |
| `errors` | Array of error objects with details (itemCode, erpnextName, error message) |

**How It Works:**

1. **Collection Phase:**
   - Fetches all published Website Items from ERPNext
   - Extracts all item codes from all variants (all sizes, all flavors)
   - Deduplicates item codes (same item code appears only once)

2. **Processing Phase:**
   - Processes items in parallel batches of 10
   - For each item code:
     - Fetches stock from ERPNext Bin API
     - Builds availability array using warehouse reference
     - Compares hash with cached hash
     - If hash matches, also compares actual Redis array (detects manual changes)
     - Updates cache and stream only if changes detected

3. **Result:**
   - Returns summary of what was processed
   - Stream entries created only for changed items
   - Cache updated with latest ERPNext data

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
| `availability:{itemCode}` | `availability:OL-EN-92-rng-1kg` | `[0,0,1,0,1,0,0]` (simple key for backward compatibility) |
| `hash:stock:{itemCode}` | `hash:stock:OL-EN-92-rng-1kg` | Redis Hash with `data`, `data_hash`, `updated_at`, `version` |
| `warehouses:reference` | `warehouses:reference` | `[{"name":"Idlib Store","lat":35.9333,"lng":36.6333},...]` or `["Idlib Store",...]` (legacy) |

**Availability Array Format:**

The availability array is a binary array where:
- `0` = No stock in that warehouse
- `1` = Stock available in that warehouse
- Array index corresponds to warehouse position in the reference array
- Array length always matches warehouse reference length

**Example:**

| Warehouse Reference | Availability Array | Meaning |
|-------------------|-------------------|---------|
| `[{"name":"Idlib Store","lat":35.9333,"lng":36.6333}, {"name":"Aleppo Store","lat":36.2021,"lng":37.1343}, {"name":"Hama Store","lat":35.1318,"lng":36.7578}, ...]` | `[0,0,1,0,1,0,0]` | Stock available in Hama Store (index 2) and Tartus Store (index 4) |

**Note:** The warehouse reference supports both formats:
- **New format**: Array of objects with `{name, lat, lng}` for geo coordinates
- **Legacy format**: Array of strings (warehouse names only) - backward compatible

**Stock Lookup:**
- Fetches from ERPNext `Bin` doctype
- Filter: `actual_qty > 0` (only warehouses with stock)
- Returns array of warehouse names where stock exists
- Builds binary array matching warehouse reference order
- Case-insensitive warehouse name matching

**Updating Warehouse Reference:**

The warehouse reference array is stored in Redis and can be updated directly. You can use either format:

**New Format (with coordinates):**
```bash
# Update with geo coordinates
redis-cli SET warehouses:reference '[{"name":"Idlib Store","lat":35.9333,"lng":36.6333},{"name":"Aleppo Store","lat":36.2021,"lng":37.1343},{"name":"Hama Store","lat":35.1318,"lng":36.7578}]'
```

**Legacy Format (names only - backward compatible):**
```bash
# Update with just names (no coordinates)
redis-cli SET warehouses:reference '["Idlib Store","Aleppo Store","Hama Store","Homs Store","Tartus Store","Latakia Store","Damascus Store"]'
```

**Get current reference:**
```bash
redis-cli GET warehouses:reference
```

**Important:** 
- After updating the warehouse reference, run the bulk stock snapshot (`POST /api/stock/update-all`) to regenerate all availability arrays with the correct length
- Warehouse names are matched case-insensitively when building availability arrays
- If a warehouse from ERPNext doesn't match any warehouse in the reference, it will be logged as a warning but won't cause an error

**Weekly Automatic Snapshot:**

The bulk stock snapshot runs automatically every week (default: Saturday at 6 AM) via the scheduled task. This ensures:
- All stock data stays in sync with ERPNext
- Manual Redis changes are detected and corrected
- Stream entries are created for any changes

**Configuration:**
- `SYNC_FULL_REFRESH_DAY` - Day of week (0-6, 0=Sunday, default: 6=Saturday)
- `SYNC_FULL_REFRESH_HOUR` - Hour (0-23, default: 6)
- `ENABLE_SCHEDULED_REFRESH` - Set to `false` to disable automatic snapshots

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `500` | Internal Server Error | Failed to update stock availability |

---

## Home Page Data

### Data Sync Strategy

**Important:** Home page data (hero images and App Home content) should follow a **detail-page-driven caching strategy**:

1. **Fetch Only on Home Page Access**: Only fetch home page data when a user opens the home page
2. **Respect Refresh Rate**: Implement a refresh rate (e.g., 1 hour) to prevent excessive API calls
   - Cache the data in the app with a timestamp
   - Only fetch from API if cache is older than the refresh rate
3. **Server-Side Caching**: Home page data accessed is cached in Redis and served to all users
   - First user to open the home page triggers the fetch and caches it
   - Subsequent users get the cached data until refresh rate expires
4. **No Background Updates**: Home page data should **not** be updated automatically unless accessed

---

### Get Hero Images

**Endpoint:** `GET /api/hero`

Get hero images for the home page. Returns array of base64-encoded image data URLs.

**Example Request:**
```bash
GET /api/hero
```

**Response:**
```json
{
  "success": true,
  "heroImages": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  ]
}
```

**Hero Images Format:**
- Each image is a base64-encoded data URL
- Format: `data:image/{type};base64,{base64data}`
- Images are downloaded from ERPNext and cached as base64 data
- Ready for direct display in the app (no additional download needed)

**Usage:** Call this endpoint only when a user opens the home page, and only if the app's cached data is older than your refresh rate (e.g., 1 hour).

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `404` | Not Found | No hero images found |
| `500` | Internal Server Error | Failed to fetch hero images |

---

### Get Bundle Images

**Endpoint:** `GET /api/bundle`

Fetches bundle images from ERPNext File doctype (where `is_bundle = 1`). Images are downloaded and converted to base64 data URLs for direct display in the app.

**Example Request:**
```bash
GET /api/bundle
```

**Response:**
```json
{
  "success": true,
  "bundleImages": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  ]
}
```

**Bundle Images Format:**
- Each image is a base64-encoded data URL
- Format: `data:image/{type};base64,{base64data}`
- Images are downloaded from ERPNext and cached as base64 data
- Ready for direct display in the app (no additional download needed)

**Usage:** Call this endpoint only when a user opens the home page, and only if the app's cached data is older than your refresh rate (e.g., 1 hour).

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `404` | Not Found | No bundle images found |
| `500` | Internal Server Error | Failed to fetch bundle images |

---

### Get App Home Data

**Endpoint:** `GET /api/home`

Get App Home data for the home page. Returns structured data with product lists and HTML content.

**Example Request:**
```bash
GET /api/home
```

**Response:**
```json
{
  "success": true,
  "top_sellers": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
  "new_arrivals": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
  "most_viewed": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
  "top_offers": ["OL-PC-91-vnl-1800g", "OL-PC-91-vnl-1800g"],
  "html1": "<h1> HTML 1</h1>",
  "html2": "<h1> HTML 2</h1>",
  "html3": "<h1> HTML 3</h1>",
  "modified": "2026-01-15 15:19:15.688817"
}
```

**Data Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `top_sellers` | Array<string> | Array of item codes for top-selling products |
| `new_arrivals` | Array<string> | Array of item codes for newly arrived products |
| `most_viewed` | Array<string> | Array of item codes for most viewed products |
| `top_offers` | Array<string> | Array of item codes for top offers |
| `html1` | string | HTML content for section 1 |
| `html2` | string | HTML content for section 2 |
| `html3` | string | HTML content for section 3 |
| `modified` | string | Timestamp of last modification |

**Usage:** Call this endpoint only when a user opens the home page, and only if the app's cached data is older than your refresh rate (e.g., 1 hour).

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| `404` | Not Found | App Home data not found |
| `500` | Internal Server Error | Failed to fetch App Home data |

---

### Adding Fields to App Home

To add new fields to App Home:

1. **Add field to App Home doctype in ERPNext**
   - Add the new field to the App Home doctype
   - If it's a JSON array (like `top_sellers`), store it as a JSON string
   - If it's HTML content (like `html1`), store it as a text field

2. **Update transformer** (`src/services/cache/transformer.js`)
   - Open `transformAppHome()` function
   - Add the new field to the output object
   - If it's a JSON string field, parse it: `parseJsonField(data.new_field)`
   - If it's a string field, include as-is: `new_field: data.new_field || ''`

3. **Update API documentation**
   - Add the new field to the response format documentation
   - Document the field type and description

4. **Automatic inclusion**
   - The new field will automatically be included in:
     - Hash computation (change detection)
     - Cache storage
     - Sync streams
     - API responses

**Example:**
```javascript
// In transformAppHome()
const transformed = {
  // ... existing fields ...
  new_product_list: parseJsonField(data.new_product_list), // JSON array
  new_html_content: data.new_html_content || '', // String field
};
```

---

## Webhooks

> **For ERPNext Administrators:** See **[ERPNEXT_WEBHOOKS.md](./ERPNEXT_WEBHOOKS.md)** for complete webhook configuration guide, including setup instructions, Jinja templates, and troubleshooting.

The middleware provides webhook endpoints for ERPNext to notify about data changes. Webhooks trigger the middleware to fetch the latest data from ERPNext and update the cache and sync streams.

### Unified ERPNext Webhook

**Endpoint:** `POST /api/webhooks/erpnext`

Unified endpoint supporting product, price, stock, hero, and home updates. See [ERPNEXT_WEBHOOKS.md](./ERPNEXT_WEBHOOKS.md) for detailed configuration.

**Product Update:**
```json
{
  "entity_type": "product",
  "erpnextName": "WEB-ITM-0002"
}
```

**Stock Update:**
```json
{
  "entity_type": "stock",
  "itemCode": "OL-EN-92-rng-1kg"
}
```

**Hero Images Update:**
```json
{
  "entity_type": "hero"
}
```

**App Home Update:**
```json
{
  "entity_type": "home"
}
```

### Legacy Price Update Webhook

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

## Sync API

For detailed documentation on sync endpoints and data structures, see **[SYNC_API.md](./SYNC_API.md)**.

The sync API provides endpoints for efficiently syncing data between the middleware and React Native frontend:

- **`POST /api/sync/check`** - Unified sync endpoint (all entity types)
- **`POST /api/sync/check-fast`** - Fast-frequency sync (views, comments, user profile)
- **`POST /api/sync/check-medium`** - Medium-frequency sync (stock, notifications)
- **`POST /api/sync/check-slow`** - Slow-frequency sync (products, prices, hero list, bundle list)

The sync system uses Redis Streams to track changes and only returns updates when data has actually changed, minimizing bandwidth and processing.

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

## Frontend Integration

For React Native developers integrating with this API, see **[FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)** for:
- Complete integration examples with React Native code
- Caching strategies and implementation patterns
- Error handling best practices
- Home page, product, and stock integration guides
- Sync API usage examples

---

## Support

For issues or questions:
- Check server logs: `logs/app.log` and `logs/error.log`
- All errors are logged with structured JSON format
- Analytics data is stored separately and can be inspected in Redis
- **Frontend developers**: See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) for React Native integration guide
- **ERPNext administrators**: See [ERPNEXT_WEBHOOKS.md](./ERPNEXT_WEBHOOKS.md) for webhook configuration