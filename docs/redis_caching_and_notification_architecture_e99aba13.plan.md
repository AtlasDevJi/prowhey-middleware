---
name: Redis Caching and Notification Architecture
overview: Design a robust Redis-based caching and notification system using streams for incremental sync, webhook-driven updates, and multi-frequency polling to minimize ERPNext calls and data consumption for weak network environments.
todos:
  - id: design-stream-structure
    content: Design Redis stream structure with entity_type, entity_id, data_hash, version, and idempotency_key fields
    status: pending
  - id: implement-hash-computation
    content: Create hash computation utility (SHA-256) for data field only
    status: pending
  - id: implement-webhook-handler
    content: Create webhook handler that computes hash, compares with cache, and only updates/adds stream entry if data changed
    status: pending
    dependencies:
      - design-stream-structure
      - implement-hash-computation
  - id: implement-sync-endpoints
    content: Create multi-frequency sync endpoints (fast/medium/slow) with hash-based change detection
    status: pending
    dependencies:
      - design-stream-structure
  - id: implement-change-detection
    content: Implement hash-based change detection comparing cached data_hash with stream entry data_hash
    status: pending
    dependencies:
      - implement-sync-endpoints
      - implement-hash-computation
  - id: implement-idempotency
    content: Add idempotency_key generation and tracking to prevent duplicate processing
    status: pending
    dependencies:
      - design-stream-structure
  - id: implement-notification-filtering
    content: Create notification filtering logic for user/group/region targeting without target_type field
    status: pending
    dependencies:
      - design-stream-structure
  - id: implement-full-refresh
    content: Create weekly full refresh service that only adds stream entries if differences detected (hash comparison)
    status: pending
    dependencies:
      - implement-webhook-handler
      - implement-hash-computation
  - id: implement-stream-management
    content: Add stream trimming and monitoring to prevent unbounded growth
    status: pending
    dependencies:
      - design-stream-structure
  - id: implement-ttl-management
    content: Add TTL management for cache entries with auto-refresh on access
    status: pending
  - id: implement-compression
    content: Add gzip compression for sync responses to reduce bandwidth
    status: pending
    dependencies:
      - implement-sync-endpoints
  - id: implement-causal-ordering
    content: Ensure stream entries are processed in correct order using stream ID timestamps
    status: pending
    dependencies:
      - implement-sync-endpoints
  - id: implement-health-checks
    content: Create health check and sync status endpoints for monitoring
    status: pending
  - id: add-monitoring
    content: Add logging and monitoring for stream lengths, cache hit rates, sync latency, and hash performance
    status: pending
    dependencies:
      - implement-sync-endpoints
      - implement-webhook-handler
---

# Redis Caching and Notification Architecture

## Overview

Design a comprehensive Redis-based caching and notification system that enables efficient incremental synchronization between ERPNext backend and React Native app. The system uses Redis Streams for change notifications, webhook-driven cache updates, and multi-frequency polling to minimize data consumption while ensuring sync accuracy.

## Core Principles

1. **Webhook-Driven Updates**: ERPNext webhooks trigger Redis cache updates and stream notifications
2. **Incremental Sync**: App only fetches changed data since last sync timestamp
3. **Multi-Frequency Polling**: Different data types checked at appropriate frequencies
4. **Hash-Based Change Detection**: Stream entries include data_hash for efficient O(1) comparison
5. **Weekly Full Refresh**: Periodic full sync that only adds stream entries if differences detected
6. **Minimal ERPNext Calls**: Cache-first approach, ERPNext only for cache misses
7. **Idempotency**: All operations are idempotent to handle retries safely
8. **Causal Ordering**: Updates processed in correct order using stream ID timestamps

## Architecture Overview

```
ERPNext → Webhook → Middleware → Redis Cache (Hash) + Stream Entry
                                              ↓
                                    App Polls Stream
                                              ↓
                                    Compare Data Hashes
                                              ↓
                          ┌───────────────────┴───────────────────┐
                          │                                         │
                    In Sync (minimal)                  Out of Sync (full updates)
                          │                                         │
                          │                              Return Cached Data
```

## Data Type Classification

### High-Frequency Updates (Check every 5-15 minutes)

- **Item Views** - Updated frequently, low priority
- **Comments** - Real-time engagement data
- **User Profile** - Active user data changes

### Medium-Frequency Updates (Check hourly)

- **Stock Availability** - Warehouse stock levels (binary 0/1 array)

### Low-Frequency Updates (Check daily or on-demand)

- **Product Details** - Item information, descriptions
- **Item Prices** - Pricing changes (weekly updates)
- **Hero List** - Marketing hero images
- **Notifications** - User-specific notifications
- **Offer Announcements** - Promotional content

## Redis Data Structures

### 1. Entity Cache (Redis Hash)

**Key Format**: `{entityType}:{entityId}`

**Purpose**: Store current state of each entity

**Structure**:

```
product:ITEM-001
  ├── data: {JSON string of product object}
  ├── data_hash: "sha256_hash_of_data_field"  # SHA-256 hash of data field only
  ├── updated_at: "1734567890000"
  └── version: "5"  # Incremental version, only increments when data changes

stock:ITEM-001
  ├── availability: [0,0,0,1,0,0]  # Binary array (0=unavailable, 1=available)
  ├── data_hash: "sha256_hash"
  ├── updated_at: "1734567890000"
  └── version: "3"
```

**Note**: `data_hash` is computed from the `data` field only (not including metadata like `updated_at`, `version`). This ensures hash stability when only metadata changes.

### 2. Change Notification Streams

**Stream Names**: `{entityType}_changes`

**Purpose**: Append-only log of changes for incremental sync

**Stream Entry Structure**:

```
Stream ID: {timestamp}-{sequence}  # Timestamp is in stream ID, not as separate field
Fields:
  ├── entity_type: "product"           # Entity type to reference Redis hash
  ├── entity_id: "ITEM-001"            # Entity ID to reference Redis hash
  ├── data_hash: "sha256_hash"         # Hash of data field for O(1) comparison
  ├── version: "5"                     # Entity version (increments only when data changes)
  └── idempotency_key: "uuid-v4"       # Unique key to prevent duplicate processing
```

**Key Points**:

- No `timestamp` field (timestamp is in stream ID)
- No `action` field (can be deduced from presence in stream)
- `data_hash` enables efficient O(1) comparison vs O(n) field-by-field
- `idempotency_key` ensures safe retries

**Streams by Entity Type**:

- `product_changes` - Product details
- `price_changes` - Item prices
- `stock_changes` - Stock availability
- `view_changes` - Item views (aggregated)
- `comment_changes` - Comments
- `user_changes` - User profile data
- `hero_changes` - Hero list
- `announcement_changes` - Offer announcements
- `notification_changes` - User notifications

### 3. Notification Stream (Special Case)

**Stream Name**: `notification_changes`

**Stream Entry Structure** (includes full notification data):

```
Stream ID: {timestamp}-{sequence}
Fields:
  ├── entity_type: "notification"
  ├── entity_id: "NOTIF-001"
  ├── data_hash: "sha256_hash"
  ├── version: "1"
  ├── idempotency_key: "uuid-v4"
  ├── notification_id: "NOTIF-001"
  ├── title: "Flash Sale"
  ├── body: "50% off today"
  ├── target_groups: ["all", "gold_members", "premium"]  # "all" means everyone
  ├── target_regions: ["all", "US", "EU"]                # "all" means all regions
  ├── target_users: ["USER-001", "USER-002"]             # Empty or specific users
  └── ... (other notification fields: type, metadata, etc.)
```

**Targeting Logic**:

- If `target_groups` contains "all" → Include for all users
- If user's groups overlap with `target_groups` → Include
- If `target_regions` contains "all" → Include for all regions
- If user's region in `target_regions` → Include
- If `target_users` includes user's ID → Include
- No `target_type` field needed (can be deduced from array contents)

## Sync Endpoint Design

### Unified Sync Endpoint

**Endpoint**: `POST /api/sync/check`

**Request Body**:

```json
{
  "lastSync": {
    "product_changes": "1734567890000-0",
    "price_changes": "1734567890000-0",
    "stock_changes": "1734567890000-0",
    "notification_changes": "1734567890000-0"
  },
  "entityTypes": ["product", "price", "stock", "notification"], // Optional: filter
  "limit": 100, // Max entries per stream
  "userId": "USER-001", // For notification filtering
  "userGroups": ["gold_members"], // For notification filtering
  "userRegion": "US" // For notification filtering
}
```

**Response (In Sync)** - Minimal response:

```json
{
  "inSync": true
}
```

**Response (Out of Sync)** - Full updates array:

```json
{
  "inSync": false,
  "updates": [
    {
      "entity_type": "product",
      "entity_id": "ITEM-001",
      "data": {
        /* full entity data from Redis hash */
      },
      "updated_at": "1734567890000",
      "version": "5",
      "data_hash": "abc123",
      "idempotency_key": "uuid-v4"
    },
    {
      "entity_type": "price",
      "entity_id": "ITEM-001",
      "data": {
        /* price data */
      },
      "updated_at": "1734567891000",
      "version": "3",
      "data_hash": "def456",
      "idempotency_key": "uuid-v4"
    }
  ],
  "lastIds": {
    "product_changes": "1734567890000-0",
    "price_changes": "1734567891000-0"
  }
}
```

### Type-Specific Sync Endpoints

**High-Frequency Endpoint**: `POST /api/sync/check-fast`

- Checks: views, comments, user profile
- Polled every 5-15 minutes

**Medium-Frequency Endpoint**: `POST /api/sync/check-medium`

- Checks: stock, notifications, announcements
- Polled hourly

**Low-Frequency Endpoint**: `POST /api/sync/check-slow`

- Checks: products, prices, hero list
- Polled daily or on-demand

## Webhook Processing Flow

### 1. Webhook Receives Update

**Endpoint**: `POST /webhook/erpnext`

**Process**:

1. Receive webhook from ERPNext
2. Identify entity type and entity ID
3. Fetch updated data from ERPNext (or use webhook payload if complete)
4. Compute `data_hash` from `data` field (SHA-256)
5. Compare `data_hash` with cached `data_hash`
6. **If different**:

   - Update Redis cache (Hash) with new data
   - Increment `version` (only if data changed)
   - Update `data_hash` and `updated_at`
   - Generate `idempotency_key` (UUID v4)
   - Add entry to relevant stream(s)

7. **If same**:

   - Skip update (no stream entry added)
   - This prevents unnecessary syncs

### 2. Cache Update Strategy

**For Single Entity Updates**:

```
Webhook → Fetch Entity → Compute Hash → Compare → Update Cache (if changed) → Add Stream Entry (if changed)
```

**For Bulk Updates** (e.g., price changes):

```
Webhook → Fetch All Affected → Batch Compare Hashes → Batch Update Cache → Batch Add Stream Entries
```

**For Aggregated Data** (e.g., views):

```
Webhook → Increment Counter → Update Aggregated View Cache → Compute Hash → Add Stream Entry (if threshold met)
```

## Change Detection Logic

### Hash-Based Comparison

1. **App sends last sync stream IDs** for each stream
2. **Backend reads stream entries** since last ID
3. **For each stream entry**:

   - Extract `entity_type` and `entity_id`
   - Fetch entity from Redis cache using `{entity_type}:{entity_id}`
   - Compare cached `data_hash` with stream entry `data_hash`
   - **If different**: Include in updates array
   - **If same**: Skip (entity hasn't actually changed)

4. **If updates exist**:

   - Return full updates array with entity data

5. **If no updates**:

   - Return minimal response: `{ "inSync": true }`

### Version Management

- `version` increments **only when data actually changes** (data_hash differs)
- During weekly refresh, if data hasn't changed, **keep existing version**
- Version enables conflict detection for optimistic updates

### Idempotency Handling

- App tracks processed `idempotency_key`s locally
- If same `idempotency_key` appears in sync response, app skips processing
- Prevents duplicate updates from retries or network issues

## Weekly Full Refresh

### Scheduled Full Sync

**Schedule**: Weekly (configurable day/time, default: Saturday morning)

**Process**:

1. For each entity type, fetch all entities from ERPNext
2. For each entity:

   - Compute `data_hash` from fetched data
   - Fetch cached entity from Redis
   - Compare `data_hash` values
   - **If different**:
     - Update Redis cache with new data
     - Increment `version` (only if data changed)
     - Update `data_hash` and `updated_at`
     - Generate `idempotency_key`
     - **Add entry to stream** (only if difference detected)
   - **If same**:
     - Skip update (no stream entry added)

3. Trim old stream entries (keep last 7 days)

**Key Point**: Stream entries are **only added if differences are detected**. This prevents all users from syncing simultaneously at the start of the week.

**Endpoint**: `POST /api/sync/full-refresh` (admin/manual trigger)

**Purpose**:

- Ensure data consistency
- Catch any missed webhooks
- Rebuild cache if corrupted
- **Silent background check** - doesn't trigger unnecessary app syncs

## Notification Targeting

### Filtered Stream Approach

**Stream**: `notification_changes` (single stream)

**Stream Entry Includes**:

```
Fields:
  ├── notification_id: "NOTIF-001"
  ├── target_groups: ["all", "gold_members", "premium"]  # "all" means everyone
  ├── target_regions: ["all", "US", "EU"]                # "all" means all regions
  ├── target_users: ["USER-001", "USER-002"]              # Empty or specific users
  └── ... (full notification data: title, body, type, metadata, etc.)
```

**App Request** (included in sync request):

```json
{
  "userId": "USER-001",
  "userGroups": ["gold_members"],
  "userRegion": "US",
  "lastSync": {
    "notification_changes": "1734567890000-0"
  }
}
```

**Backend Filtering**:

1. Read `notification_changes` stream since last ID
2. For each entry, filter based on:

   - If `target_groups` contains "all" → Include
   - If any of user's `userGroups` in `target_groups` → Include
   - If `target_regions` contains "all" → Include
   - If `userRegion` in `target_regions` → Include
   - If `userId` in `target_users` → Include

3. Return filtered notifications in updates array

**User Info Structure** (stored in app):

```json
{
  "userId": "USER-001",
  "groups": ["gold_members", "premium"],
  "region": "US"
}
```

## Data Consumption Optimization

### 1. Delta Updates Only

- Only return changed entities, not full lists
- Use stream entries to identify what changed
- Hash comparison ensures only actual changes are synced

### 2. Batch Updates

- Group multiple changes in single response
- Reduce number of API calls

### 3. Compression

- Compress response payloads with gzip
- App automatically decompresses
- Reduces bandwidth consumption for weak networks
- 60-80% size reduction for JSON responses

### 4. Selective Sync

- App can request specific entity types only
- Reduces payload size

### 5. Incremental Versioning

- Track entity versions
- Skip unchanged entities even if in stream (via hash comparison)

## TTL Management

### Cache Entry TTL

- Set TTL on cache entries (default: 30 days)
- Auto-refresh TTL on access (extend on read)
- Cleanup old entries during weekly refresh
- Prevents unbounded cache growth

### Implementation

- Use Redis `EXPIRE` command when setting cache
- Use `TTL` command to check remaining time
- Refresh TTL on cache hits
- Remove expired entries during weekly refresh

## Causal Ordering

### Stream Processing Order

- Stream IDs are timestamp-based (already ordered)
- Process stream entries in order (stream ID order)
- Handle out-of-order webhooks by comparing timestamps
- Ensure updates are applied in correct sequence

### Implementation

- Always read streams from oldest to newest (stream ID order)
- Process entries sequentially
- If webhook arrives out of order, compare timestamps before processing
- Use stream ID as source of truth for ordering

## Health Check Endpoints

### System Health

**Endpoint**: `GET /api/health`

**Response**:

```json
{
  "status": "healthy",
  "redis": {
    "connected": true,
    "latency": "2ms"
  },
  "erpnext": {
    "reachable": true,
    "latency": "150ms"
  },
  "timestamp": "1734567890000"
}
```

### Sync Status

**Endpoint**: `GET /api/sync/status`

**Response**:

```json
{
  "streams": {
    "product_changes": {
      "length": 1250,
      "lastEntry": "1734567890000-0",
      "oldestEntry": "1734500000000-0"
    },
    "price_changes": {
      "length": 45,
      "lastEntry": "1734567890000-0",
      "oldestEntry": "1734500000000-0"
    }
  },
  "cache": {
    "hitRate": 0.95,
    "size": "125MB",
    "entries": 5000
  },
  "lastWebhook": "1734567890000",
  "lastFullRefresh": "1734500000000"
}
```

## Schema Validation (Future Task)

**Note**: Schema validation should be implemented in a future iteration to ensure data integrity.

**Planned Implementation**:

- Define JSON schemas for each entity type
- Validate webhook payloads before processing
- Validate cached data before returning to app
- Reject invalid data and log errors
- Use library like `ajv` for JSON schema validation

**Benefits**:

- Prevents data corruption
- Early error detection
- Better debugging
- Type safety

## Implementation Structure

### File Organization

```
scripts/
├── sync/
│   ├── sync-handler.js          # Main sync endpoint handler
│   ├── change-detector.js       # Hash comparison logic
│   ├── data-fetcher.js          # Fetch data from Redis cache
│   └── full-refresh.js          # Weekly full refresh service
├── webhooks/
│   ├── webhook-handler.js       # Process ERPNext webhooks
│   ├── cache-updater.js         # Update Redis cache from webhook
│   ├── hash-computer.js          # Compute data_hash (SHA-256)
│   └── stream-notifier.js       # Add entries to streams
├── notifications/
│   ├── notification-filter.js   # Filter notifications by user context
│   └── targeting-utils.js       # Handle targeting logic
├── scheduled/
│   ├── full-refresh-scheduler.js # Weekly full refresh cron
│   └── stream-trimmer.js        # Clean old stream entries
└── health/
    ├── health-check.js          # Health check endpoint
    └── sync-status.js           # Sync status endpoint
```

## Stream Management

### Stream Trimming

**Purpose**: Prevent unbounded growth

**Strategy**:

- Keep last 7 days of entries per stream
- Trim older entries weekly
- Use `XTRIM` command with `MAXLEN`
- Monitor stream lengths

### Stream Monitoring

- Track stream length
- Alert if stream grows too large
- Monitor for stuck streams (no updates)
- Log stream statistics

## Error Handling

### Webhook Failures

- Retry webhook processing with exponential backoff
- Log failures for manual review
- Don't block webhook endpoint
- Use idempotency keys to prevent duplicate processing

### Cache Misses

- If entity not in cache, fetch from ERPNext
- Update cache after fetch
- Return data to app
- Log cache miss for monitoring

### Stream Read Failures

- Fallback to full entity fetch if stream unavailable
- Log errors for monitoring
- Return error response to app

### Hash Computation Failures

- If hash computation fails, fallback to field-by-field comparison
- Log error for investigation
- Continue processing other entities

## Configuration

### Environment Variables

```env
# Sync Configuration
SYNC_STREAM_RETENTION_DAYS=7
SYNC_BATCH_SIZE=100
SYNC_FULL_REFRESH_DAY=6  # Saturday (0-6)
SYNC_FULL_REFRESH_HOUR=6  # 6 AM

# Stream Configuration
STREAM_MAX_LENGTH=10000
STREAM_TRIM_INTERVAL_HOURS=24

# Cache Configuration
CACHE_TTL_DAYS=30
CACHE_REFRESH_THRESHOLD=0.8  # Refresh if 80% expired

# Compression Configuration
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=6  # Balance between speed and size

# Health Check Configuration
HEALTH_CHECK_INTERVAL_SECONDS=60
```

## Testing Strategy

1. **Webhook Testing**: Simulate ERPNext webhooks, verify cache and stream updates
2. **Hash Comparison Testing**: Test hash computation and comparison logic
3. **Sync Testing**: Test hash-based change detection, empty responses, full updates
4. **Notification Filtering**: Test targeting logic with various user contexts
5. **Full Refresh**: Test weekly refresh process, verify stream entries only added on differences
6. **Network Simulation**: Test with weak network conditions, timeouts, compression
7. **Concurrent Updates**: Test multiple webhooks updating same entity
8. **Idempotency Testing**: Test duplicate processing prevention
9. **TTL Testing**: Test cache expiration and refresh
10. **Health Check Testing**: Test health and status endpoints

## Performance Considerations

1. **Stream Reads**: Use `XREAD` with COUNT limit to prevent large reads
2. **Cache Lookups**: Batch Redis operations where possible
3. **Webhook Processing**: Process webhooks asynchronously, don't block
4. **Database Queries**: Minimize ERPNext API calls, use cache-first
5. **Memory Management**: Monitor Redis memory usage, trim streams regularly
6. **Hash Computation**: Cache computed hashes to avoid recomputation
7. **Compression**: Balance compression level vs CPU usage

## Monitoring and Observability

1. **Stream Lengths**: Monitor each stream's length
2. **Cache Hit Rates**: Track cache hits vs misses
3. **Sync Latency**: Measure time from webhook to app sync
4. **Webhook Processing Time**: Track webhook processing duration
5. **Error Rates**: Monitor webhook failures, sync errors
6. **Hash Comparison Performance**: Track hash computation time
7. **Compression Ratios**: Monitor compression effectiveness
8. **TTL Effectiveness**: Track cache expiration patterns

## Next Steps

1. Implement webhook handler with hash computation and comparison
2. Implement sync endpoints with hash-based change detection
3. Implement notification filtering logic
4. Set up scheduled full refresh (only add stream entries on differences)
5. Add health check endpoints
6. Implement compression for responses
7. Implement TTL management for cache entries
8. Add monitoring and logging
9. Test with various update frequencies and network conditions
10. Implement schema validation (future task)