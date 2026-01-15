# Local Webhook Testing Guide

This guide provides examples for testing webhook endpoints locally using curl or Postman.

## Unified ERPNext Webhook

**Endpoint**: `POST /api/webhooks/erpnext`

### Product Webhook

```bash
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "product",
    "erpnextName": "WEB-ITM-0002"
  }'
```

**Expected Redis Keys/Streams**:
- Redis Hash: `product:WEB-ITM-0002` (with fields: `data`, `data_hash`, `updated_at`, `version`)
- Stream Entry: `product_changes` stream with entry containing `entity_type`, `entity_id`, `data_hash`, `version`, `idempotency_key`

### Price Webhook

```bash
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "price",
    "erpnextName": "WEB-ITM-0002",
    "sizeUnit": "5lb",
    "price": 29.99
  }'
```

**Expected Redis Keys/Streams**:
- Redis Hash: `price:WEB-ITM-0002:5lb` (with fields: `data`, `data_hash`, `updated_at`, `version`)
- Simple Key: `price:WEB-ITM-0002:5lb` (backward compatibility)
- Stream Entry: `price_changes` stream

### Stock Webhook

```bash
curl -X POST http://localhost:3001/api/webhooks/erpnext \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "stock",
    "itemCode": "ITEM-001",
    "availability": [0,0,1,0,1]
  }'
```

**Expected Redis Keys/Streams**:
- Redis Hash: `stock:ITEM-001` (with fields: `data`, `data_hash`, `updated_at`, `version`)
- Simple Key: `availability:ITEM-001` (backward compatibility)
- Stream Entry: `stock_changes` stream

## Legacy Price Update Webhook

**Endpoint**: `POST /api/webhooks/price-update`

```bash
curl -X POST http://localhost:3001/api/webhooks/price-update \
  -H "Content-Type: application/json" \
  -d '{
    "erpnextName": "WEB-ITM-0002",
    "sizeUnit": "5lb",
    "price": 29.99,
    "itemCode": "ITEM-001",
    "invalidateCache": false
  }'
```

**Expected Redis Keys/Streams**:
- Simple Key: `price:WEB-ITM-0002:5lb` (updated)
- If `invalidateCache: true`: `product:WEB-ITM-0002` cache deleted

## Verifying Webhook Results

### Check Redis Hash

```bash
redis-cli HGETALL product:WEB-ITM-0002
```

### Check Stream Entry

```bash
redis-cli XRANGE product_changes - + COUNT 10
```

### Check Simple Keys (Backward Compatibility)

```bash
redis-cli GET price:WEB-ITM-0002:5lb
redis-cli GET availability:ITEM-001
```

## Testing Hash-Based Change Detection

1. Send webhook with same data twice:
   ```bash
   # First call - should create stream entry
   curl -X POST http://localhost:3001/api/webhooks/erpnext \
     -H "Content-Type: application/json" \
     -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 29.99}'
   
   # Second call with same data - should NOT create stream entry (hash matches)
   curl -X POST http://localhost:3001/api/webhooks/erpnext \
     -H "Content-Type: application/json" \
     -d '{"entity_type": "price", "erpnextName": "WEB-ITM-0002", "sizeUnit": "5lb", "price": 29.99}'
   ```

2. Verify only one stream entry was created:
   ```bash
   redis-cli XLEN price_changes
   ```

## Postman Collection

Create a Postman collection with these requests:

1. **Product Webhook** - POST `/api/webhooks/erpnext` with product payload
2. **Price Webhook** - POST `/api/webhooks/erpnext` with price payload
3. **Stock Webhook** - POST `/api/webhooks/erpnext` with stock payload
4. **Legacy Price Update** - POST `/api/webhooks/price-update` with price payload
