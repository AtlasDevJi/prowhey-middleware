# Messaging System - Redis Storage Guide

This guide shows where to find message content in Redis.

## Redis Key Structure

Messages are stored in Redis using the following key patterns:

### 1. Message Data (Hash)

**Key Format:** `hash:message:{messageId}`

**Example:** `hash:message:msg_4dee44c1c481deee935d52a3`

**Structure:** Redis Hash with the following fields:
- `data` - JSON string containing the message object
- `data_hash` - SHA-256 hash for change detection
- `updated_at` - Timestamp of last update
- `version` - Version number

**Redis Commands:**

```bash
# Get all fields from a message hash
redis-cli HGETALL hash:message:msg_4dee44c1c481deee935d52a3

# Get just the message data (JSON string)
redis-cli HGET hash:message:msg_4dee44c1c481deee935d52a3 data

# Get message metadata
redis-cli HGET hash:message:msg_4dee44c1c481deee935d52a3 data_hash
redis-cli HGET hash:message:msg_4dee44c1c481deee935d52a3 updated_at
redis-cli HGET hash:message:msg_4dee44c1c481deee935d52a3 version
```

**Message Data Structure (JSON):**
```json
{
  "messageId": "msg_4dee44c1c481deee935d52a3",
  "userId": "0001",
  "sender": "company",
  "text": "Please enable geolocation to help us show you nearby stores.",
  "actionButtons": [
    {
      "label": "Enable Geolocation",
      "action": "enable_geolocation"
    },
    {
      "label": "View About Page",
      "action": "about"
    }
  ],
  "timestamp": "2025-01-20T10:30:00.000Z",
  "read": false,
  "deleted": false
}
```

### 2. User Message Index (Set)

**Key Format:** `user:{userId}:messages`

**Example:** `user:0001:messages`

**Structure:** Redis Set containing all message IDs for a specific user

**Redis Commands:**

```bash
# Get all message IDs for a user
redis-cli SMEMBERS user:0001:messages

# Check if a message belongs to a user
redis-cli SISMEMBER user:0001:messages msg_4dee44c1c481deee935d52a3

# Count messages for a user
redis-cli SCARD user:0001:messages
```

### 3. Message Changes Stream

**Key Format:** `message_changes`

**Structure:** Redis Stream for sync mechanism

**Redis Commands:**

```bash
# Read all entries from the stream
redis-cli XRANGE message_changes - +

# Read last 10 entries
redis-cli XREVRANGE message_changes + - COUNT 10

# Read entries after a specific ID
redis-cli XREAD STREAMS message_changes 1768550410815-0

# Get stream length
redis-cli XLEN message_changes
```

**Stream Entry Structure:**
```
Entry ID: 1768550410815-0
Fields:
  - entity_type: "message"
  - entity_id: "msg_4dee44c1c481deee935d52a3"
  - data_hash: "d00d97be341ab8c0dc06e2d2dbc68dc157271d4ae501b73bb8757ce8b7939b9e"
  - version: "1"
  - idempotency_key: "e220ff47-2918-480e-88d7-d6ccf26a93b1"
```

## Finding Messages

### Find All Messages for a User

```bash
# 1. Get user's message IDs
USER_ID="0001"
redis-cli SMEMBERS user:${USER_ID}:messages

# 2. For each message ID, get the message data
MESSAGE_ID="msg_4dee44c1c481deee935d52a3"
redis-cli HGET hash:message:${MESSAGE_ID} data | jq .
```

### Find All Messages in Redis

```bash
# Find all message hash keys
redis-cli KEYS "hash:message:*"

# Get all messages (with data)
redis-cli --scan --pattern "hash:message:*" | while read key; do
  echo "=== $key ==="
  redis-cli HGET "$key" data | jq .
  echo ""
done
```

### Find Messages by Sender

```bash
# Get all message keys and filter by sender
redis-cli --scan --pattern "hash:message:*" | while read key; do
  DATA=$(redis-cli HGET "$key" data)
  SENDER=$(echo "$DATA" | jq -r '.sender')
  if [ "$SENDER" = "company" ]; then
    echo "=== $key (Company Message) ==="
    echo "$DATA" | jq .
    echo ""
  fi
done
```

### Find Unread Messages for a User

```bash
USER_ID="0001"
redis-cli SMEMBERS user:${USER_ID}:messages | while read msg_id; do
  DATA=$(redis-cli HGET hash:message:${msg_id} data)
  READ=$(echo "$DATA" | jq -r '.read')
  if [ "$READ" = "false" ]; then
    echo "=== Unread: $msg_id ==="
    echo "$DATA" | jq .
    echo ""
  fi
done
```

## Node.js Examples

### Get Message from Redis (Node.js)

```javascript
const { getRedisClient } = require('./src/services/redis/client');
const { getCacheHash } = require('./src/services/redis/cache');

async function getMessageFromRedis(messageId) {
  const cached = await getCacheHash('message', messageId);
  if (cached) {
    return cached.data; // Message object
  }
  return null;
}

// Usage
const message = await getMessageFromRedis('msg_4dee44c1c481deee935d52a3');
console.log(message);
```

### Get All Messages for a User (Node.js)

```javascript
const { getRedisClient } = require('./src/services/redis/client');
const { getCacheHash } = require('./src/services/redis/cache');

async function getUserMessagesFromRedis(userId) {
  const redis = getRedisClient();
  
  // Get message IDs
  const messageIds = await redis.smembers(`user:${userId}:messages`);
  
  // Get message data
  const messages = [];
  for (const messageId of messageIds) {
    const cached = await getCacheHash('message', messageId);
    if (cached && !cached.data.deleted) {
      messages.push(cached.data);
    }
  }
  
  // Sort by timestamp (newest first)
  messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return messages;
}

// Usage
const messages = await getUserMessagesFromRedis('0001');
console.log(messages);
```

### Read Message Stream (Node.js)

```javascript
const { getRedisClient } = require('./src/services/redis/client');

async function readMessageStream(lastId = '0-0', limit = 100) {
  const redis = getRedisClient();
  
  const results = await redis.xread('COUNT', limit, 'STREAMS', 'message_changes', lastId);
  
  if (!results || results.length === 0) {
    return [];
  }
  
  const entries = [];
  for (const [streamName, streamEntries] of results) {
    for (const [id, fields] of streamEntries) {
      // Convert fields array to object
      const entryFields = {};
      for (let i = 0; i < fields.length; i += 2) {
        entryFields[fields[i]] = fields[i + 1];
      }
      
      entries.push({
        id,
        fields: entryFields,
      });
    }
  }
  
  return entries;
}

// Usage
const entries = await readMessageStream();
console.log(entries);
```

## Quick Reference

| What | Redis Key Pattern | Command |
|------|------------------|---------|
| Message data | `hash:message:{messageId}` | `HGETALL hash:message:msg_xxx` |
| User's message IDs | `user:{userId}:messages` | `SMEMBERS user:0001:messages` |
| Message stream | `message_changes` | `XRANGE message_changes - +` |
| Find all messages | `hash:message:*` | `KEYS hash:message:*` |

## Finding User Messages vs Company Messages

Both user and company messages are stored in the **same location** (`hash:message:{messageId}`). The only difference is the `sender` field in the message data:

- **Company messages:** `sender: "company"`
- **User messages:** `sender: "user"`

### Find User Messages

```bash
# Get all messages and filter by sender
redis-cli --scan --pattern "hash:message:*" | while read key; do
  DATA=$(redis-cli HGET "$key" data)
  SENDER=$(echo "$DATA" | jq -r '.sender')
  if [ "$SENDER" = "user" ]; then
    echo "=== User Message: $key ==="
    echo "$DATA" | jq .
    echo ""
  fi
done
```

### Find All Messages for a User (Both Sent and Received)

```bash
USER_ID="0001"

# Get all message IDs for this user
redis-cli SMEMBERS user:${USER_ID}:messages | while read msg_id; do
  echo "=== Message: $msg_id ==="
  redis-cli HGET hash:message:${msg_id} data | jq .
  echo ""
done
```

This will show **all messages** for the user:
- Messages **sent by** the user (`sender: "user"`)
- Messages **sent to** the user (`sender: "company"`)

### Find Only User's Replies

```bash
USER_ID="0001"

# Get all message IDs for this user
redis-cli SMEMBERS user:${USER_ID}:messages | while read msg_id; do
  DATA=$(redis-cli HGET hash:message:${msg_id} data)
  SENDER=$(echo "$DATA" | jq -r '.sender')
  if [ "$SENDER" = "user" ]; then
    echo "=== User Reply: $msg_id ==="
    echo "$DATA" | jq .
    echo ""
  fi
done
```

## Notes

- **Message IDs** follow the pattern: `msg_{hex}` (e.g., `msg_4dee44c1c481deee935d52a3`)
- **User IDs** follow the pattern: 4-character base 36 (e.g., `0001`, `0002`, `000A`, `0010`)
- Messages are **soft-deleted** (deleted flag set to `true`, not removed from Redis)
- The **message_changes stream** is used for sync mechanism (app checks hourly)
- **No TTL** - Messages persist indefinitely (no expiration)
- **User messages** and **company messages** are stored in the same location, distinguished by the `sender` field
