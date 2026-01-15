# Sync Test Recipes

HTTP-first test recipes to simulate user flows before connecting the React Native app.

## Prerequisites

1. Start the middleware server: `npm run dev`
2. Ensure Redis is running
3. Configure ERPNext credentials in `.env.development`

## Recipe 1: Complete User Flow

### Step 1: Verify ERPNext Connectivity

```bash
curl http://localhost:3001/api/erpnext/ping
```

Expected: `{"ok": true, "latencyMs": <number>}`

### Step 2: User Authentication

```bash
# Signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "deviceId": "test-device-001"
  }'

# Verify (use code from logs/SMS)
curl -X POST http://localhost:3001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<userId_from_signup>",
    "code": "123456",
    "method": "sms"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the `accessToken` and `refreshToken` from login response.

### Step 3: Fetch Product (Populates Cache)

```bash
curl "http://localhost:3001/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"WEB-ITM-0002\"]]" \
  -H "Authorization: Bearer <accessToken>"
```

This will:
- Fetch product from ERPNext
- Transform data
- Cache in Redis (both simple key and Hash)

### Step 4: Trigger Webhook (Simulate ERPNext Change)

```bash
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "price",
    "erpnextName": "WEB-ITM-0002",
    "sizeUnit": "5lb",
    "price": 35.99
  }'
```

This will:
- Compute hash of new price
- Compare with cached hash
- Update cache if changed
- Add stream entry if changed

### Step 5: Check Sync (First Call - Should Return Updates)

```bash
curl -X POST http://localhost:3001/api/sync/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "lastSync": {},
    "limit": 100
  }'
```

Expected: `{"inSync": false, "updates": [...], "lastIds": {...}}`

Save the `lastIds` from response.

### Step 6: Check Sync Again (Should Return inSync)

```bash
curl -X POST http://localhost:3001/api/sync/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "lastSync": {
      "price_changes": "<lastId_from_step5>"
    },
    "limit": 100
  }'
```

Expected: `{"inSync": true}`

## Recipe 2: Multi-Entity Sync Test

### Step 1: Trigger Multiple Webhooks

```bash
# Product webhook
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "product", "erpnextName": "WEB-ITM-0002"}'

# Price webhook
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 29.99}'

# Stock webhook
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "stock", "itemCode": "ITEM-001", "availability": [1,0,1,0,1]}'
```

### Step 2: Sync Check with Multiple Entity Types

```bash
curl -X POST http://localhost:3001/api/sync/check \
  -H "Content-Type: application/json" \
  -d '{
    "lastSync": {},
    "entityTypes": ["product", "price", "stock"],
    "limit": 100
  }'
```

Expected: Updates for all three entity types.

## Recipe 3: Frequency-Specific Sync Tests

### Fast Sync (Views, Comments, User)

```bash
curl -X POST http://localhost:3001/api/sync/check-fast \
  -H "Content-Type: application/json" \
  -d '{
    "lastSync": {},
    "limit": 100
  }'
```

### Medium Sync (Stock, Notifications)

```bash
curl -X POST http://localhost:3001/api/sync/check-medium \
  -H "Content-Type: application/json" \
  -d '{
    "lastSync": {},
    "limit": 100,
    "userId": "USER-001",
    "userGroups": ["gold_members"],
    "userRegion": "US"
  }'
```

### Slow Sync (Products, Prices, Hero)

```bash
curl -X POST http://localhost:3001/api/sync/check-slow \
  -H "Content-Type: application/json" \
  -d '{
    "lastSync": {},
    "limit": 100
  }'
```

## Recipe 4: Hash-Based Change Detection Test

### Step 1: Send Same Webhook Twice

```bash
# First call
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 29.99}'

# Second call with same data
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 29.99}'
```

### Step 2: Verify Only One Stream Entry

```bash
redis-cli XLEN price_changes
```

Expected: Only 1 entry (second webhook should not create stream entry because hash matches).

### Step 3: Change Price and Verify Stream Entry Created

```bash
# Change price
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 35.99}'

# Verify stream length increased
redis-cli XLEN price_changes
```

Expected: Stream length increased by 1.

## Recipe 5: Sync Status Check

```bash
curl http://localhost:3001/health/sync-status
```

Expected: JSON with stream lengths and last IDs for all entity types.

## Verification Commands

### Check Redis Hash Structure

```bash
redis-cli HGETALL product:WEB-ITM-0002
redis-cli HGETALL price:WEB-ITM-0002:5lb
redis-cli HGETALL stock:ITEM-001
```

### Check Stream Entries

```bash
redis-cli XRANGE product_changes - + COUNT 10
redis-cli XRANGE price_changes - + COUNT 10
redis-cli XRANGE stock_changes - + COUNT 10
```

### Check Stream Lengths

```bash
redis-cli XLEN product_changes
redis-cli XLEN price_changes
redis-cli XLEN stock_changes
```

## Expected Behavior Summary

1. **Webhook with new data**: Creates stream entry, updates cache hash
2. **Webhook with same data**: Skips stream entry (hash matches)
3. **Sync check with empty lastSync**: Returns all updates
4. **Sync check with current lastSync**: Returns `{"inSync": true}`
5. **Sync check after webhook**: Returns updates only for changed entities
