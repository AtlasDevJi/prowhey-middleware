---
name: Item Price Fetching Implementation
overview: Implement item price fetching from ERPNext (retail and wholesale) using the same pattern as stock availability, with hash-based storage, weekly snapshot, and API endpoints.
todos: []
---

# Item Price Fetching Implementation

## Overview

Implement item price fetching from ERPNext similar to stock availability. Fetch retail and wholesale prices for all items in website item variants, store as hash-based cache with [retail_price, wholesale_price] array format, and include in weekly snapshot refresh.

## Implementation Plan

### 1. ERPNext Client Functions (`src/services/erpnext/client.js`)

**Add `fetchItemPrices()` function:**

- Fetch both retail and wholesale prices in a single function
- Retail: `/api/resource/Item Price?fields=["price_list_rate"]&filters=[["item_code", "=", itemCode], ["price_list", "=", "Standard Selling"]]`
- Wholesale: `/api/resource/Item Price?fields=["price_list_rate"]&filters=[["item_code", "=", itemCode], ["price_list", "=", "Wholesale Selling"]]`
- Returns object: `{ retail: number|null, wholesale: number|null }`
- Handle cases where price doesn't exist (return null)
- Use parallel Promise.allSettled for both API calls

**Note:** Keep existing `fetchItemPrice()` function for backward compatibility if needed, or update it to support both price lists.

### 2. Price Service (`src/services/price/price.js`)

**Add new functions following stock pattern:**

**`updateItemPrice(itemCode)`:**

- Fetch prices from ERPNext using `fetchItemPrices()`
- Build price array: `[retail_price, wholesale_price]` (use 0 or null if price not found)
- Prepare price data object: `{ itemCode, prices: [retail, wholesale] }`
- Compute hash of price data
- Compare with cached hash
- Update cache hash if changed
- Add stream entry if changed
- Return price array or null

**`updateAllPrices()` - Refactor existing function:**

- Follow same pattern as `refreshAllStock()` in full-refresh.js
- Extract all unique item codes from website item variants (deduplicate)
- Process in parallel batches of 10
- Use hash-based change detection
- Include manual change detection (compare actual Redis values)
- Return summary with total, updated, unchanged, errors

**Storage:**

- Use hash-based cache: `hash:price:{itemCode}` with data structure `{ itemCode, prices: [retail, wholesale] }`
- Also store simple key: `price:{itemCode}` as JSON string `[retail, wholesale]` for backward compatibility
- Both should be persistent (TTL: 0)

### 3. Redis Cache Functions (`src/services/redis/cache.js`)

**Add price storage functions (similar to stock):**

**`getItemPrice(itemCode)`:**

- Get from simple key: `price:{itemCode}`
- Return array `[retail, wholesale]` or null

**`setItemPrice(itemCode, priceArray)`:**

- Store as JSON string: `price:{itemCode}`
- No TTL (persistent)
- Format: `[retail_price, wholesale_price]`

**Note:** These are for backward compatibility. Primary storage is hash-based.

### 4. Full Refresh (`src/services/sync/full-refresh.js`)

**Refactor `refreshAllPrices()` function:**

- Follow exact same pattern as `refreshAllStock()`
- Extract all unique item codes from website item variants
- Deduplicate item codes
- Process in parallel batches of 10
- For each item:
  - Fetch prices from ERPNext
  - Build price array `[retail, wholesale]`
  - Compute hash
  - Compare with cached hash
  - Check for manual Redis changes (compare actual values)
  - Update cache and stream if changed
- Return summary object

**Update `performFullRefresh()`:**

- Already includes `refreshAllPrices()`, no changes needed

### 5. Price Routes (`src/routes/price.js`)

**Add new endpoint:**

**`GET /api/price/:itemCode`:**

- Get price for a specific item code
- Returns: `{ itemCode, prices: [retail, wholesale] }`
- Check hash cache first
- Fetch from ERPNext on cache miss
- Cache the result
- Similar pattern to `GET /api/stock/:itemCode`

**Keep existing `POST /api/price/update-all`:**

- This should call the refactored `updateAllPrices()` function
- Returns summary of bulk update

### 6. Sync Handler (`src/services/sync/sync-handler.js`)

**No changes needed** - price is already in slow frequency array

### 7. Cache Configuration (`src/config/cache.js`)

**No changes needed** - price TTL is already set to 0 (persistent)

### 8. Test Script (`scripts/test-sync.sh`)

**Add price test case:**

- Add `elif [ "${ENTITY_TYPE}" = "price" ];` block
- Follow same pattern as stock test:

  1. ERPNext ping
  2. Fetch a product to get item codes
  3. Fetch price for specific item code
  4. Trigger bulk price update
  5. Sync check (first call)
  6. Sync check (second call)

- Update error message to include price

### 9. Documentation Updates

**Update `docs/api/API.md`:**

- Update Price Management section
- Document `GET /api/price/:itemCode` endpoint
- Update `POST /api/price/update-all` documentation
- Document price array format: `[retail, wholesale]`
- Note that prices are persistent (no TTL)

**Update `docs/api/SYNC_API.md`:**

- Update Price entity section
- Document price data structure: `{ itemCode, prices: [retail, wholesale] }`
- Add example price update response
- Note weekly snapshot behavior

**Update `docs/api/FRONTEND_INTEGRATION.md`:**

- Add "Fetching Item Prices" section
- Document price array format
- Include React Native code example
- Document caching strategy

**Update `docs/api/ERPNEXT_WEBHOOKS.md`:**

- Note that prices use weekly snapshot (no webhook needed)
- Optionally document webhook approach if user wants it later

## Data Structure

**Price Data Format:**

```typescript
{
  itemCode: string;
  prices: [number, number]; // [retail_price, wholesale_price]
}
```

**Redis Storage:**

- Hash key: `hash:price:{itemCode}` with fields: `data`, `data_hash`, `updated_at`, `version`
- Simple key: `price:{itemCode}` as JSON string `[retail, wholesale]` (backward compatibility)
- Both persistent (TTL: 0)

**Example:**

```json
{
  "itemCode": "OL-EN-92-rng-1kg",
  "prices": [29.99, 24.99]
}
```

## Weekly Snapshot Behavior

- Runs automatically via scheduled full refresh (weekly)
- Processes all unique item codes from website item variants
- Only updates cache and stream if prices changed (hash comparison)
- Detects manual Redis changes and updates accordingly
- Processes items in parallel batches for performance

## Files to Modify

1. `src/services/erpnext/client.js` - Add `fetchItemPrices()` function
2. `src/services/price/price.js` - Refactor to use hash-based storage, add `updateItemPrice()`, refactor `updateAllPrices()`
3. `src/services/redis/cache.js` - Add `getItemPrice()` and `setItemPrice()` functions
4. `src/services/sync/full-refresh.js` - Refactor `refreshAllPrices()` to match stock pattern
5. `src/routes/price.js` - Add `GET /api/price/:itemCode` endpoint
6. `scripts/test-sync.sh` - Add price test case
7. `docs/api/API.md` - Update price documentation
8. `docs/api/SYNC_API.md` - Update price entity documentation
9. `docs/api/FRONTEND_INTEGRATION.md` - Add price fetching section
10. `docs/api/ERPNEXT_WEBHOOKS.md` - Note weekly snapshot approach

## Notes

- Prices are stored as `[retail, wholesale]` array (two numbers)
- If a price doesn't exist in ERPNext, use `0` or `null` (decide on approach)
- Weekly snapshot is preferred over webhooks (cleaner and safer)
- Follow exact same pattern as stock availability for consistency
- Use hash-based change detection to minimize unnecessary updates
- Include manual change detection to catch direct Redis modifications