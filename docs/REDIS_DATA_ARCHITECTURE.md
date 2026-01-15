# Redis Data Architecture Explanation

## Overview

This document explains the Redis data architecture used in Prowhey Middleware, specifically addressing the question: **"Why are there separate keys instead of a single JSON object?"**

## The Answer: We Use BOTH!

### User Data Storage: Single JSON Object ✅

**User data IS stored as a single JSON object** in Redis:

```
Key: user:usr_abc123
Value: {
  "id": "usr_abc123",
  "email": "user@example.com",
  "username": "johndoe",
  "firstName": "John",
  "surname": "Doe",
  "age": 28,
  "occupation": "Software Engineer",
  "fitnessLevel": "intermediate",
  "gender": "male",
  "fitnessGoal": "muscle_gain",
  "province": "Riyadh",
  "city": "Riyadh",
  "deviceId": "device-123",
  "geolocation": {...},
  "accountStatus": "active",
  "trustScore": 100,
  // ... all other fields
}
```

**This is the primary storage** - all user data is in one place.

### Index Keys: For Fast Lookups ⚡

The separate keys you see (like `email:user@example.com`, `device:device-123`) are **indexes**, not separate storage. They're used for fast lookups.

## Why This Architecture?

### Advantages of Single JSON Object + Indexes

#### 1. **Atomic Updates**
- Update entire user object in one operation
- No risk of partial updates
- Consistent data state

#### 2. **Fast Primary Lookups**
- Get user by ID: `GET user:usr_abc123` (O(1))
- All data retrieved in one operation
- No need to fetch multiple keys

#### 3. **Efficient Indexes for Secondary Lookups**
- Find user by email: `GET email:user@example.com` → returns userId → then `GET user:usr_abc123`
- Find user by device: `GET device:device-123` → returns userId → then `GET user:usr_abc123`
- Much faster than scanning all user objects

#### 4. **Memory Efficiency**
- User data stored once (in `user:${userId}`)
- Indexes only store userId references (small strings)
- No data duplication

#### 5. **Flexible Queries**
- Can query by any indexed field (email, username, device, phone, province, city)
- Can maintain sets for filtering (e.g., `province:Riyadh:users`)

#### 6. **Easy Updates**
- Update user object once
- Update indexes only when indexed fields change
- No need to update multiple places

### Comparison: Single Object vs. Separate Keys

#### ❌ If We Used Separate Keys for Each Field:

```
user:usr_abc123:email = "user@example.com"
user:usr_abc123:firstName = "John"
user:usr_abc123:surname = "Doe"
user:usr_abc123:age = 28
user:usr_abc123:occupation = "Software Engineer"
// ... 50+ more keys per user
```

**Problems:**
- Need to fetch 50+ keys to get complete user data
- No atomic updates (could update email but not firstName)
- More network round trips
- Harder to maintain consistency
- More memory overhead (key names take space)

#### ✅ Current Architecture (Single Object + Indexes):

```
user:usr_abc123 = {complete JSON object}  ← Primary storage
email:user@example.com = "usr_abc123"     ← Index (lookup only)
device:device-123 = "usr_abc123"          ← Index (lookup only)
phone:+966501234567 = "usr_abc123"        ← Index (lookup only)
```

**Benefits:**
- One key fetch for complete user data
- Atomic updates
- Fast lookups via indexes
- Minimal memory overhead
- Easy to maintain

## Data Structure Breakdown

### Primary Storage

```
user:${userId} → Complete user JSON object
```

**Contains:**
- All profile fields (name, email, age, etc.)
- Authentication data (passwordHash, tokens)
- Device information
- Geolocation
- Security fields (trustScore, fraudFlags)
- Metadata (createdAt, lastLogin)

### Index Keys (Lookup Only)

```
email:${email} → userId
username:${username} → userId
device:${deviceId} → userId
phone:${phone} → userId
google:${googleId} → userId
```

**Purpose:** Fast reverse lookups (find userId by email, device, etc.)

### Set Indexes (Filtering)

```
province:${province}:users → Set of userIds
city:${city}:users → Set of userIds
non_registered:users → Set of userIds
```

**Purpose:** Efficient filtering and bulk operations

## Example: How It Works

### Scenario: Find User by Email

**Step 1:** Lookup index
```bash
GET email:user@example.com
# Returns: "usr_abc123"
```

**Step 2:** Get user data
```bash
GET user:usr_abc123
# Returns: Complete user JSON object
```

**Total:** 2 Redis operations (both O(1))

### Scenario: Update User Profile

**Step 1:** Get current user
```bash
GET user:usr_abc123
```

**Step 2:** Update user object (if email changed, update index too)
```bash
SET user:usr_abc123 {updated JSON}
DEL email:old@example.com  # If email changed
SET email:new@example.com "usr_abc123"  # If email changed
```

**Result:** User data updated atomically, indexes stay in sync

## Analytics Data: Different Pattern

**Note:** Analytics data uses a different pattern because it has different requirements:

- **High-frequency writes** (views, interactions)
- **Time-series data** (events with timestamps)
- **Aggregations** (counts, statistics)
- **Per-user tracking** (user-specific analytics)

That's why you see patterns like:
- `views:${productName}` - Counter
- `views:user:${userId}:${productName}` - Per-user view history
- `events:search:${date}:${timestamp}` - Time-series events

This is appropriate for analytics but different from user profile storage.

## Best Practices

### ✅ DO:
- Store complete objects in primary keys (`user:${userId}`)
- Use indexes for fast lookups
- Update indexes when indexed fields change
- Use sets for filtering/grouping

### ❌ DON'T:
- Store user fields in separate keys
- Duplicate user data in indexes
- Forget to update indexes when fields change
- Use KEYS command in production (use SCAN instead)

## Summary

**User data is stored as a single JSON object** (`user:${userId}`). The separate keys you see are **indexes for fast lookups**, not separate storage. This architecture provides:

1. ✅ Atomic updates
2. ✅ Fast primary lookups (by userId)
3. ✅ Fast secondary lookups (by email, device, etc.)
4. ✅ Memory efficiency
5. ✅ Easy maintenance
6. ✅ Flexible querying

This is a standard and recommended pattern for Redis-based user storage systems.

---

**Last Updated:** 2025-01-20  
**Version:** 1.0
