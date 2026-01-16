# Analytics Extraction Guide

This document provides comprehensive Redis commands and Node.js code examples for extracting analytics insights from the Prowhey Middleware Redis database.

## Table of Contents

- [Overview](#overview)
- [User ID Unification](#user-id-unification)
- [Redis Key Patterns](#redis-key-patterns)
- [Product Analytics](#product-analytics)
- [User Analytics](#user-analytics)
- [Search Analytics](#search-analytics)
- [Session Analytics](#session-analytics)
- [Interaction Analytics](#interaction-analytics)
- [Wishlist Analytics](#wishlist-analytics)
- [Comments & Ratings Analytics](#comments--ratings-analytics)
- [Time-Based Analytics](#time-based-analytics)
- [Aggregated Insights](#aggregated-insights)
- [Performance Optimization](#performance-optimization)

---

## Overview

All analytics data is stored in Redis with consistent key patterns. User IDs are unified - both registered users (4-character base 36 IDs) and anonymous users use the same format, with anonymous users tracked via `deviceId` or `sessionId` when no userId is available.

### User ID Unification

**Yes, userId is unified across all analytics tracking:**

- **Registered Users**: Use `userId` from user account (4-character base 36: `0001`, `0002`, `000A`, `0010`, etc.)
- **Anonymous Users**: Tracked as `'anonymous'` string in analytics keys, or via `deviceId`/`sessionId` in event metadata
- **All Analytics Functions**: Accept `userId` parameter and handle both authenticated and anonymous users
- **Consistent Format**: All user tracking uses the same `userId` format (4-character base 36 for registered, `'anonymous'` for anonymous)
- **Event Metadata**: Events store both `userId` (if available) and `deviceId`/`sessionId` for anonymous tracking

**Key Pattern:**
- When `userId` is provided: Uses actual userId (e.g., `views:user:0001:WEB-ITM-0002`)
- When `userId` is null: Uses `'anonymous'` string (e.g., `session:active:anonymous:session-123`)
- Event logs always include `userId`, `deviceId`, and `sessionId` fields for complete tracking

---

## Redis Key Patterns

### Product Views
- `views:${productName}` - Total view count (integer)
- `views:user:${userId}:${productName}` - Per-user view history (JSON array)

### Search
- `search:term:${normalizedTerm}` - Search term statistics (JSON)
- `search:user:${userId}` - Per-user search history (JSON array)
- `events:search:${date}:${timestamp}` - Detailed search events (JSON, 30-day TTL)

### Sessions
- `session:active:${userId}:${sessionId}` - Active session data (JSON, TTL based)
- `session:user:${userId}:${date}` - Daily session summary (JSON)
- `events:session:${date}:${sessionId}` - Detailed session log (JSON, 30-day TTL)

### Interactions
- `interaction:${type}:${productName}` - Interaction count (integer)
- `interaction:user:${userId}:${productName}` - Per-user interactions (JSON array)
- `events:interaction:${date}:${timestamp}` - Detailed interaction events (JSON, 30-day TTL)

### Wishlists
- `wishlist:user:${userId}` - User wishlist (JSON array)

### Comments & Ratings
- `comments:${productName}` - Product comments (JSON array)
- `ratings:${productName}` - Product ratings (JSON array)

### Aggregates
- `search:aggregate:${date}:${term}` - Daily search aggregates (JSON)
- `interaction:aggregate:${date}:${type}` - Daily interaction aggregates (JSON)
- `session:aggregate:${date}` - Daily session aggregates (JSON)

---

## Product Analytics

### Get Product View Count

**Redis Command:**
```bash
GET views:WEB-ITM-0002
```

**Node.js:**
```javascript
const { getRedisClient } = require('./src/services/redis/client');

async function getProductViewCount(productName) {
  const redis = getRedisClient();
  const key = `views:${productName}`;
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

// Usage
const views = await getProductViewCount('WEB-ITM-0002');
console.log(`Total views: ${views}`);
```

### Get Top Viewed Products

**Redis Commands:**
```bash
# Get all view keys
KEYS views:*

# Get values for specific products
MGET views:WEB-ITM-0001 views:WEB-ITM-0002 views:WEB-ITM-0003
```

**Node.js:**
```javascript
async function getTopViewedProducts(limit = 10) {
  const redis = getRedisClient();
  
  // Get all view keys
  const keys = await redis.keys('views:*');
  
  // Filter out user-specific keys (views:user:*)
  const productKeys = keys.filter(key => !key.startsWith('views:user:'));
  
  // Get all view counts
  const products = await Promise.all(
    productKeys.map(async (key) => {
      const productName = key.replace('views:', '');
      const count = await redis.get(key);
      return {
        productName,
        views: count ? parseInt(count, 10) : 0,
      };
    })
  );
  
  // Sort by views descending
  products.sort((a, b) => b.views - a.views);
  
  return products.slice(0, limit);
}

// Usage
const topProducts = await getTopViewedProducts(20);
console.log('Top 20 viewed products:', topProducts);
```

### Get Product Views by User

**Redis Command:**
```bash
GET views:user:0001:WEB-ITM-0002
```

**Node.js:**
```javascript
async function getUserProductViews(userId, productName) {
  const redis = getRedisClient();
  const key = `views:user:${userId}:${productName}`;
  const data = await redis.get(key);
  
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse user views:', error);
    return [];
  }
}

// Usage
const userViews = await getUserProductViews('0001', 'WEB-ITM-0002');
console.log(`User viewed this product ${userViews.length} times`);
console.log('View history:', userViews);
```

### Get Products Viewed by User

**Redis Commands:**
```bash
# Get all products viewed by a user
KEYS views:user:0001:*
```

**Node.js:**
```javascript
async function getUserViewedProducts(userId) {
  const redis = getRedisClient();
  const pattern = `views:user:${userId}:*`;
  const keys = await redis.keys(pattern);
  
  const products = await Promise.all(
    keys.map(async (key) => {
      const productName = key.split(':').pop();
      const viewsData = await redis.get(key);
      let views = [];
      
      if (viewsData) {
        try {
          views = JSON.parse(viewsData);
        } catch (error) {
          console.error('Failed to parse views:', error);
        }
      }
      
      return {
        productName,
        viewCount: views.length,
        lastViewed: views[0]?.timestamp || null,
        views,
      };
    })
  );
  
  // Sort by last viewed (most recent first)
  products.sort((a, b) => {
    if (!a.lastViewed) return 1;
    if (!b.lastViewed) return -1;
    return new Date(b.lastViewed) - new Date(a.lastViewed);
  });
  
  return products;
}

// Usage
const userProducts = await getUserViewedProducts('0001');
console.log(`User viewed ${userProducts.length} different products`);
```

---

## User Analytics

### Get User Activity Summary

**Node.js:**
```javascript
async function getUserActivitySummary(userId) {
  const redis = getRedisClient();
  
  // Get user views
  const viewKeys = await redis.keys(`views:user:${userId}:*`);
  const totalViews = viewKeys.length;
  
  // Get user searches
  const searchKey = `search:user:${userId}`;
  const searchData = await redis.get(searchKey);
  let searches = [];
  if (searchData) {
    try {
      searches = JSON.parse(searchData);
    } catch (error) {
      console.error('Failed to parse searches:', error);
    }
  }
  
  // Get user wishlist
  const wishlistKey = `wishlist:user:${userId}`;
  const wishlistData = await redis.get(wishlistKey);
  let wishlist = [];
  if (wishlistData) {
    try {
      wishlist = JSON.parse(wishlistData);
    } catch (error) {
      console.error('Failed to parse wishlist:', error);
    }
  }
  
  // Get user interactions
  const interactionKeys = await redis.keys(`interaction:user:${userId}:*`);
  
  return {
    userId,
    totalProductViews: totalViews,
    totalSearches: searches.length,
    wishlistSize: wishlist.length,
    totalInteractions: interactionKeys.length,
    lastSearch: searches[0]?.timestamp || null,
    lastView: viewKeys.length > 0 ? await getLastViewTimestamp(userId, viewKeys) : null,
  };
}

async function getLastViewTimestamp(userId, viewKeys) {
  const redis = getRedisClient();
  let lastTimestamp = null;
  
  for (const key of viewKeys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const views = JSON.parse(data);
        if (views.length > 0 && views[0].timestamp) {
          const timestamp = new Date(views[0].timestamp);
          if (!lastTimestamp || timestamp > lastTimestamp) {
            lastTimestamp = timestamp;
          }
        }
      } catch (error) {
        // Skip invalid data
      }
    }
  }
  
  return lastTimestamp;
}

// Usage
const summary = await getUserActivitySummary('0001');
console.log('User Activity Summary:', summary);
```

### Get Most Active Users

**Node.js:**
```javascript
async function getMostActiveUsers(limit = 10) {
  const redis = getRedisClient();
  
  // Get all user view keys
  const allViewKeys = await redis.keys('views:user:*');
  
  // Extract unique user IDs
  const userIds = new Set();
  for (const key of allViewKeys) {
    const parts = key.split(':');
    if (parts.length >= 3) {
      userIds.add(parts[2]); // userId is at index 2
    }
  }
  
  // Calculate activity for each user
  const userActivities = await Promise.all(
    Array.from(userIds).map(async (userId) => {
      const summary = await getUserActivitySummary(userId);
      return {
        userId,
        ...summary,
        activityScore: summary.totalProductViews + summary.totalSearches + summary.totalInteractions,
      };
    })
  );
  
  // Sort by activity score
  userActivities.sort((a, b) => b.activityScore - a.activityScore);
  
  return userActivities.slice(0, limit);
}

// Usage
const activeUsers = await getMostActiveUsers(20);
console.log('Top 20 most active users:', activeUsers);
```

---

## Search Analytics

### Get Search Term Statistics

**Redis Command:**
```bash
GET search:term:whey protein
```

**Node.js:**
```javascript
async function getSearchTermStats(term) {
  const redis = getRedisClient();
  const normalizedTerm = term.toLowerCase().trim();
  const key = `search:term:${normalizedTerm}`;
  const data = await redis.get(key);
  
  if (!data) {
    return {
      term: normalizedTerm,
      count: 0,
      last_searched: null,
    };
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse search term stats:', error);
    return { term: normalizedTerm, count: 0, last_searched: null };
  }
}

// Usage
const stats = await getSearchTermStats('whey protein');
console.log(`"${stats.term}" searched ${stats.count} times`);
console.log(`Last searched: ${stats.last_searched}`);
```

### Get Top Search Terms

**Redis Commands:**
```bash
# Get all search term keys
KEYS search:term:*

# Get all search term data
MGET search:term:whey search:term:protein search:term:creatine
```

**Node.js:**
```javascript
async function getTopSearchTerms(limit = 20) {
  const redis = getRedisClient();
  const keys = await redis.keys('search:term:*');
  
  const terms = await Promise.all(
    keys.map(async (key) => {
      const term = key.replace('search:term:', '');
      const data = await redis.get(key);
      
      if (!data) {
        return { term, count: 0, last_searched: null };
      }
      
      try {
        const stats = JSON.parse(data);
        return {
          term,
          count: stats.count || 0,
          last_searched: stats.last_searched || null,
        };
      } catch (error) {
        return { term, count: 0, last_searched: null };
      }
    })
  );
  
  // Sort by count descending
  terms.sort((a, b) => b.count - a.count);
  
  return terms.slice(0, limit);
}

// Usage
const topTerms = await getTopSearchTerms(50);
console.log('Top 50 search terms:', topTerms);
```

### Get Search Events for Date Range

**Redis Commands:**
```bash
# Get all search events for a specific date
KEYS events:search:2025-01-15:*

# Get specific event
GET events:search:2025-01-15:1705324800000
```

**Node.js:**
```javascript
async function getSearchEventsForDate(date) {
  const redis = getRedisClient();
  const pattern = `events:search:${date}:*`;
  const keys = await redis.keys(pattern);
  
  const events = await Promise.all(
    keys.map(async (key) => {
      const data = await redis.get(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse search event:', error);
        return null;
      }
    })
  );
  
  return events.filter(event => event !== null);
}

async function getSearchEventsForDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const events = [];
  
  // Iterate through each date
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    const dayEvents = await getSearchEventsForDate(dateStr);
    events.push(...dayEvents);
  }
  
  return events;
}

// Usage
const todayEvents = await getSearchEventsForDate('2025-01-15');
console.log(`Found ${todayEvents.length} search events today`);

const weekEvents = await getSearchEventsForDateRange('2025-01-08', '2025-01-15');
console.log(`Found ${weekEvents.length} search events this week`);
```

### Get User Search History

**Redis Command:**
```bash
GET search:user:0001
```

**Node.js:**
```javascript
async function getUserSearchHistory(userId) {
  const redis = getRedisClient();
  const key = `search:user:${userId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse user search history:', error);
    return [];
  }
}

// Usage
const history = await getUserSearchHistory('0001');
console.log(`User has ${history.length} searches`);
console.log('Recent searches:', history.slice(0, 10));
```

### Analyze Search Performance

**Node.js:**
```javascript
async function analyzeSearchPerformance(date) {
  const redis = getRedisClient();
  const events = await getSearchEventsForDate(date);
  
  const analysis = {
    totalSearches: events.length,
    uniqueTerms: new Set(),
    averageResultsCount: 0,
    averageClicks: 0,
    zeroResultSearches: 0,
    highClickRateSearches: 0,
    searchesByHour: {},
  };
  
  let totalResults = 0;
  let totalClicks = 0;
  
  for (const event of events) {
    // Unique terms
    analysis.uniqueTerms.add(event.term);
    
    // Results and clicks
    const resultsCount = event.results_count || 0;
    const clicks = (event.clicked_results || []).length;
    totalResults += resultsCount;
    totalClicks += clicks;
    
    if (resultsCount === 0) {
      analysis.zeroResultSearches++;
    }
    
    if (clicks > 0 && resultsCount > 0) {
      const clickRate = clicks / resultsCount;
      if (clickRate > 0.5) {
        analysis.highClickRateSearches++;
      }
    }
    
    // Hourly distribution
    if (event.timestamp) {
      const hour = new Date(event.timestamp).getHours();
      analysis.searchesByHour[hour] = (analysis.searchesByHour[hour] || 0) + 1;
    }
  }
  
  analysis.uniqueTermsCount = analysis.uniqueTerms.size;
  analysis.averageResultsCount = events.length > 0 ? totalResults / events.length : 0;
  analysis.averageClicks = events.length > 0 ? totalClicks / events.length : 0;
  
  return analysis;
}

// Usage
const performance = await analyzeSearchPerformance('2025-01-15');
console.log('Search Performance Analysis:', performance);
```

---

## Session Analytics

### Get Active Sessions

**Redis Commands:**
```bash
# Get all active sessions
KEYS session:active:*

# Get specific active session
GET session:active:0001:session-123
```

**Node.js:**
```javascript
async function getActiveSessions() {
  const redis = getRedisClient();
  const keys = await redis.keys('session:active:*');
  
  const sessions = await Promise.all(
    keys.map(async (key) => {
      const data = await redis.get(key);
      if (!data) return null;
      
      try {
        const session = JSON.parse(data);
        // Extract userId and sessionId from key
        const parts = key.split(':');
        return {
          userId: parts[2] === 'anonymous' ? null : parts[2],
          sessionId: parts[3],
          ...session,
        };
      } catch (error) {
        console.error('Failed to parse session:', error);
        return null;
      }
    })
  );
  
  return sessions.filter(session => session !== null);
}

// Usage
const activeSessions = await getActiveSessions();
console.log(`Currently ${activeSessions.length} active sessions`);
```

### Get User Session History

**Redis Commands:**
```bash
# Get daily session summary
GET session:user:0001:2025-01-15

# Get detailed session log
GET events:session:2025-01-15:session-123
```

**Node.js:**
```javascript
async function getUserSessionHistory(userId, date) {
  const redis = getRedisClient();
  const key = `session:user:${userId}:${date}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse session history:', error);
    return null;
  }
}

async function getUserSessionsForDateRange(userId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const sessions = [];
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    const session = await getUserSessionHistory(userId, dateStr);
    if (session) {
      sessions.push({ date: dateStr, ...session });
    }
  }
  
  return sessions;
}

// Usage
const todaySession = await getUserSessionHistory('0001', '2025-01-15');
console.log('Today\'s session:', todaySession);

const weekSessions = await getUserSessionsForDateRange('0001', '2025-01-08', '2025-01-15');
console.log(`User had ${weekSessions.length} sessions this week`);
```

### Calculate Session Duration

**Node.js:**
```javascript
async function getSessionDuration(sessionId, date) {
  const redis = getRedisClient();
  const key = `events:session:${date}:${sessionId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  try {
    const session = JSON.parse(data);
    const events = session.events || [];
    
    if (events.length < 2) {
      return null; // Need at least open and close
    }
    
    const openEvent = events.find(e => e.type === 'app_open');
    const closeEvent = events.find(e => e.type === 'app_close');
    
    if (!openEvent || !closeEvent) {
      return null;
    }
    
    const startTime = new Date(openEvent.timestamp);
    const endTime = new Date(closeEvent.timestamp);
    const duration = endTime - startTime; // milliseconds
    
    return {
      sessionId,
      duration: duration,
      durationSeconds: Math.floor(duration / 1000),
      durationMinutes: Math.floor(duration / 60000),
      startTime: openEvent.timestamp,
      endTime: closeEvent.timestamp,
    };
  } catch (error) {
    console.error('Failed to calculate session duration:', error);
    return null;
  }
}

// Usage
const duration = await getSessionDuration('session-123', '2025-01-15');
if (duration) {
  console.log(`Session lasted ${duration.durationMinutes} minutes`);
}
```

### Get Daily Active Users (DAU)

**Node.js:**
```javascript
async function getDailyActiveUsers(date) {
  const redis = getRedisClient();
  
  // Get all session keys for the date
  const pattern = `session:user:*:${date}`;
  const keys = await redis.keys(pattern);
  
  const userIds = new Set();
  
  for (const key of keys) {
    const parts = key.split(':');
    if (parts.length >= 4) {
      const userId = parts[2];
      if (userId !== 'anonymous') {
        userIds.add(userId);
      }
    }
  }
  
  // Also check active sessions
  const activeSessionKeys = await redis.keys('session:active:*');
  for (const key of activeSessionKeys) {
    const parts = key.split(':');
    if (parts.length >= 4 && parts[2] !== 'anonymous') {
      userIds.add(parts[2]);
    }
  }
  
  return {
    date,
    dau: userIds.size,
    userIds: Array.from(userIds),
  };
}

// Usage
const dau = await getDailyActiveUsers('2025-01-15');
console.log(`Daily Active Users on ${dau.date}: ${dau.dau}`);
```

---

## Interaction Analytics

### Get Product Interaction Counts

**Redis Commands:**
```bash
# Get interaction count for a specific type and product
GET interaction:image_view:WEB-ITM-0002
GET interaction:variant_select:WEB-ITM-0002
GET interaction:share:WEB-ITM-0002
```

**Node.js:**
```javascript
async function getProductInteractionCounts(productName) {
  const redis = getRedisClient();
  const types = ['image_view', 'variant_select', 'share'];
  
  const counts = {};
  
  for (const type of types) {
    const key = `interaction:${type}:${productName}`;
    const count = await redis.get(key);
    counts[type] = count ? parseInt(count, 10) : 0;
  }
  
  counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  
  return {
    productName,
    ...counts,
  };
}

// Usage
const interactions = await getProductInteractionCounts('WEB-ITM-0002');
console.log('Product interactions:', interactions);
```

### Get Top Interacted Products

**Node.js:**
```javascript
async function getTopInteractedProducts(type = 'all', limit = 20) {
  const redis = getRedisClient();
  const types = type === 'all' 
    ? ['image_view', 'variant_select', 'share']
    : [type];
  
  const productCounts = {};
  
  for (const interactionType of types) {
    const keys = await redis.keys(`interaction:${interactionType}:*`);
    
    for (const key of keys) {
      const productName = key.split(':').pop();
      const count = await redis.get(key);
      const countValue = count ? parseInt(count, 10) : 0;
      
      if (!productCounts[productName]) {
        productCounts[productName] = {};
      }
      
      productCounts[productName][interactionType] = countValue;
      productCounts[productName].total = (productCounts[productName].total || 0) + countValue;
    }
  }
  
  // Convert to array and sort
  const products = Object.entries(productCounts).map(([productName, counts]) => ({
    productName,
    ...counts,
  }));
  
  products.sort((a, b) => b.total - a.total);
  
  return products.slice(0, limit);
}

// Usage
const topInteracted = await getTopInteractedProducts('all', 30);
console.log('Top 30 most interacted products:', topInteracted);

const topShared = await getTopInteractedProducts('share', 10);
console.log('Top 10 most shared products:', topShared);
```

### Get Interaction Events for Date Range

**Node.js:**
```javascript
async function getInteractionEventsForDate(date) {
  const redis = getRedisClient();
  const pattern = `events:interaction:${date}:*`;
  const keys = await redis.keys(pattern);
  
  const events = await Promise.all(
    keys.map(async (key) => {
      const data = await redis.get(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse interaction event:', error);
        return null;
      }
    })
  );
  
  return events.filter(event => event !== null);
}

async function analyzeInteractionTrends(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const trends = {
    image_views: 0,
    variant_selects: 0,
    shares: 0,
    byProduct: {},
    byUser: {},
  };
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    const events = await getInteractionEventsForDate(dateStr);
    
    for (const event of events) {
      // Count by type
      trends[event.type] = (trends[event.type] || 0) + 1;
      
      // Count by product
      if (!trends.byProduct[event.product_name]) {
        trends.byProduct[event.product_name] = {
          image_views: 0,
          variant_selects: 0,
          shares: 0,
        };
      }
      trends.byProduct[event.product_name][event.type] = 
        (trends.byProduct[event.product_name][event.type] || 0) + 1;
      
      // Count by user
      if (event.userId) {
        if (!trends.byUser[event.userId]) {
          trends.byUser[event.userId] = {
            image_views: 0,
            variant_selects: 0,
            shares: 0,
          };
        }
        trends.byUser[event.userId][event.type] = 
          (trends.byUser[event.userId][event.type] || 0) + 1;
      }
    }
  }
  
  return trends;
}

// Usage
const trends = await analyzeInteractionTrends('2025-01-08', '2025-01-15');
console.log('Interaction trends:', trends);
```

---

## Wishlist Analytics

### Get User Wishlist

**Redis Command:**
```bash
GET wishlist:user:0001
```

**Node.js:**
```javascript
async function getUserWishlist(userId) {
  const redis = getRedisClient();
  const key = `wishlist:user:${userId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse wishlist:', error);
    return [];
  }
}

// Usage
const wishlist = await getUserWishlist('0001');
console.log(`User has ${wishlist.length} items in wishlist`);
```

### Get Product Wishlist Count

**Node.js:**
```javascript
async function getProductWishlistCount(productName) {
  const redis = getRedisClient();
  const keys = await redis.keys('wishlist:user:*');
  
  let count = 0;
  
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const wishlist = JSON.parse(data);
        if (Array.isArray(wishlist)) {
          const hasProduct = wishlist.some(item => 
            item.productName === productName || item === productName
          );
          if (hasProduct) {
            count++;
          }
        }
      } catch (error) {
        // Skip invalid data
      }
    }
  }
  
  return count;
}

// Usage
const count = await getProductWishlistCount('WEB-ITM-0002');
console.log(`${count} users have this product in their wishlist`);
```

### Get Most Wishlisted Products

**Node.js:**
```javascript
async function getMostWishlistedProducts(limit = 20) {
  const redis = getRedisClient();
  const keys = await redis.keys('wishlist:user:*');
  
  const productCounts = {};
  
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const wishlist = JSON.parse(data);
        if (Array.isArray(wishlist)) {
          for (const item of wishlist) {
            const productName = typeof item === 'string' ? item : item.productName;
            if (productName) {
              productCounts[productName] = (productCounts[productName] || 0) + 1;
            }
          }
        }
      } catch (error) {
        // Skip invalid data
      }
    }
  }
  
  // Convert to array and sort
  const products = Object.entries(productCounts)
    .map(([productName, count]) => ({ productName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  
  return products;
}

// Usage
const topWishlisted = await getMostWishlistedProducts(30);
console.log('Top 30 most wishlisted products:', topWishlisted);
```

---

## Comments & Ratings Analytics

### Get Product Comments

**Redis Command:**
```bash
GET comments:WEB-ITM-0002
```

**Node.js:**
```javascript
async function getProductComments(productName) {
  const redis = getRedisClient();
  const key = `comments:${productName}`;
  const data = await redis.get(key);
  
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse comments:', error);
    return [];
  }
}

// Usage
const comments = await getProductComments('WEB-ITM-0002');
console.log(`Product has ${comments.length} comments`);
```

### Get Product Ratings

**Redis Command:**
```bash
GET ratings:WEB-ITM-0002
```

**Node.js:**
```javascript
async function getProductRatings(productName) {
  const redis = getRedisClient();
  const key = `ratings:${productName}`;
  const data = await redis.get(key);
  
  if (!data) {
    return {
      ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      reviewCount: 0,
      averageRating: 0,
    };
  }
  
  try {
    const ratings = JSON.parse(data);
    
    // Calculate average
    const total = ratings.reduce((sum, r) => sum + (r.starRating || 0), 0);
    const average = ratings.length > 0 ? total / ratings.length : 0;
    
    // Calculate breakdown
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const rating of ratings) {
      const stars = rating.starRating || 0;
      if (stars >= 1 && stars <= 5) {
        breakdown[stars] = (breakdown[stars] || 0) + 1;
      }
    }
    
    return {
      ratingBreakdown: breakdown,
      reviewCount: ratings.length,
      averageRating: Math.round(average * 10) / 10, // Round to 1 decimal
      ratings,
    };
  } catch (error) {
    console.error('Failed to parse ratings:', error);
    return {
      ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      reviewCount: 0,
      averageRating: 0,
    };
  }
}

// Usage
const ratings = await getProductRatings('WEB-ITM-0002');
console.log(`Average rating: ${ratings.averageRating} (${ratings.reviewCount} reviews)`);
console.log('Rating breakdown:', ratings.ratingBreakdown);
```

### Get Top Rated Products

**Node.js:**
```javascript
async function getTopRatedProducts(minReviews = 5, limit = 20) {
  const redis = getRedisClient();
  const keys = await redis.keys('ratings:*');
  
  const products = await Promise.all(
    keys.map(async (key) => {
      const productName = key.replace('ratings:', '');
      const ratings = await getProductRatings(productName);
      
      if (ratings.reviewCount >= minReviews) {
        return {
          productName,
          averageRating: ratings.averageRating,
          reviewCount: ratings.reviewCount,
        };
      }
      return null;
    })
  );
  
  // Filter nulls and sort by average rating
  const validProducts = products
    .filter(p => p !== null)
    .sort((a, b) => {
      // Sort by average rating, then by review count
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      return b.reviewCount - a.reviewCount;
    })
    .slice(0, limit);
  
  return validProducts;
}

// Usage
const topRated = await getTopRatedProducts(5, 30);
console.log('Top 30 rated products (min 5 reviews):', topRated);
```

---

## Time-Based Analytics

### Get Analytics for Date Range

**Node.js:**
```javascript
async function getAnalyticsForDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const analytics = {
    dateRange: { start: startDate, end: endDate },
    searches: [],
    interactions: [],
    sessions: [],
    dailyStats: {},
  };
  
  // Iterate through each date
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    
    // Get events for this date
    const searchEvents = await getSearchEventsForDate(dateStr);
    const interactionEvents = await getInteractionEventsForDate(dateStr);
    const dau = await getDailyActiveUsers(dateStr);
    
    analytics.dailyStats[dateStr] = {
      searches: searchEvents.length,
      interactions: interactionEvents.length,
      dau: dau.dau,
    };
    
    analytics.searches.push(...searchEvents);
    analytics.interactions.push(...interactionEvents);
  }
  
  return analytics;
}

// Usage
const weekAnalytics = await getAnalyticsForDateRange('2025-01-08', '2025-01-15');
console.log('Week analytics:', weekAnalytics);
```

### Get Hourly Activity Distribution

**Node.js:**
```javascript
async function getHourlyActivityDistribution(date) {
  const redis = getRedisClient();
  const distribution = {};
  
  // Initialize all hours to 0
  for (let hour = 0; hour < 24; hour++) {
    distribution[hour] = {
      searches: 0,
      interactions: 0,
      sessions: 0,
    };
  }
  
  // Get search events
  const searchEvents = await getSearchEventsForDate(date);
  for (const event of searchEvents) {
    if (event.timestamp) {
      const hour = new Date(event.timestamp).getHours();
      distribution[hour].searches++;
    }
  }
  
  // Get interaction events
  const interactionEvents = await getInteractionEventsForDate(date);
  for (const event of interactionEvents) {
    if (event.timestamp) {
      const hour = new Date(event.timestamp).getHours();
      distribution[hour].interactions++;
    }
  }
  
  return distribution;
}

// Usage
const hourly = await getHourlyActivityDistribution('2025-01-15');
console.log('Hourly activity distribution:', hourly);
```

---

## Aggregated Insights

### Get Comprehensive Dashboard Data

**Node.js:**
```javascript
async function getDashboardData(date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const dashboard = {
    date: targetDate,
    products: {
      topViewed: await getTopViewedProducts(10),
      topRated: await getTopRatedProducts(5, 10),
      topWishlisted: await getMostWishlistedProducts(10),
      topInteracted: await getTopInteractedProducts('all', 10),
    },
    users: {
      dau: (await getDailyActiveUsers(targetDate)).dau,
      mostActive: await getMostActiveUsers(10),
    },
    searches: {
      topTerms: await getTopSearchTerms(20),
      performance: await analyzeSearchPerformance(targetDate),
    },
    interactions: {
      total: await getInteractionEventsForDate(targetDate).then(events => events.length),
      byType: await getTopInteractedProducts('all', 10),
    },
    sessions: {
      active: (await getActiveSessions()).length,
    },
  };
  
  return dashboard;
}

// Usage
const dashboard = await getDashboardData();
console.log('Dashboard data:', JSON.stringify(dashboard, null, 2));
```

### Get User Journey Analysis

**Node.js:**
```javascript
async function getUserJourney(userId, date) {
  const redis = getRedisClient();
  
  // Get user's views
  const viewKeys = await redis.keys(`views:user:${userId}:*`);
  const viewedProducts = viewKeys.map(key => key.split(':').pop());
  
  // Get user's searches
  const searches = await getUserSearchHistory(userId);
  
  // Get user's wishlist
  const wishlist = await getUserWishlist(userId);
  const wishlistProducts = wishlist.map(item => 
    typeof item === 'string' ? item : item.productName
  );
  
  // Get user's interactions
  const interactionKeys = await redis.keys(`interaction:user:${userId}:*`);
  const interactedProducts = interactionKeys.map(key => key.split(':').pop());
  
  // Get user's session
  const session = await getUserSessionHistory(userId, date);
  
  return {
    userId,
    date,
    viewedProducts: viewedProducts.length,
    searchedTerms: searches.length,
    wishlistSize: wishlistProducts.length,
    interactedProducts: interactedProducts.length,
    sessionDuration: session ? await calculateSessionDuration(session) : null,
    journey: {
      searches: searches.slice(0, 10),
      viewed: viewedProducts.slice(0, 10),
      wishlisted: wishlistProducts.slice(0, 10),
      interacted: interactedProducts.slice(0, 10),
    },
  };
}

// Usage
const journey = await getUserJourney('0001', '2025-01-15');
console.log('User journey:', journey);
```

---

## Performance Optimization

### Batch Operations

**Node.js:**
```javascript
async function batchGetProductViews(productNames) {
  const redis = getRedisClient();
  const keys = productNames.map(name => `views:${name}`);
  const values = await redis.mget(keys);
  
  return productNames.map((name, index) => ({
    productName: name,
    views: values[index] ? parseInt(values[index], 10) : 0,
  }));
}

// Usage
const products = ['WEB-ITM-0001', 'WEB-ITM-0002', 'WEB-ITM-0003'];
const views = await batchGetProductViews(products);
console.log('Batch views:', views);
```

### Use SCAN Instead of KEYS

**Node.js:**
```javascript
async function scanKeys(pattern, limit = 1000) {
  const redis = getRedisClient();
  const keys = [];
  let cursor = '0';
  
  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', limit);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  
  return keys;
}

// Usage (more efficient for large datasets)
const viewKeys = await scanKeys('views:*', 100);
console.log(`Found ${viewKeys.length} view keys`);
```

### Pipeline Operations

**Node.js:**
```javascript
async function getMultipleProductStats(productNames) {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  
  for (const name of productNames) {
    pipeline.get(`views:${name}`);
    pipeline.get(`comments:${name}`);
    pipeline.get(`ratings:${name}`);
  }
  
  const results = await pipeline.exec();
  
  const stats = productNames.map((name, index) => {
    const viewIndex = index * 3;
    const commentIndex = viewIndex + 1;
    const ratingIndex = viewIndex + 2;
    
    return {
      productName: name,
      views: results[viewIndex][1] ? parseInt(results[viewIndex][1], 10) : 0,
      comments: results[commentIndex][1] ? JSON.parse(results[commentIndex][1]).length : 0,
      ratings: results[ratingIndex][1] ? JSON.parse(results[ratingIndex][1]).length : 0,
    };
  });
  
  return stats;
}

// Usage
const stats = await getMultipleProductStats(['WEB-ITM-0001', 'WEB-ITM-0002']);
console.log('Product stats:', stats);
```

---

## Complete Analytics Extraction Service

**Node.js:**
```javascript
// src/services/analytics/extractor.js
const { getRedisClient } = require('../redis/client');

class AnalyticsExtractor {
  constructor() {
    this.redis = getRedisClient();
  }
  
  // Include all the functions above as methods
  // ... (all functions from above)
  
  async getCompleteAnalyticsReport(startDate, endDate) {
    const report = {
      period: { start: startDate, end: endDate },
      summary: {},
      products: {},
      users: {},
      searches: {},
      interactions: {},
      sessions: {},
    };
    
    // Get all analytics data
    const analytics = await getAnalyticsForDateRange(startDate, endDate);
    
    // Summary
    report.summary = {
      totalSearches: analytics.searches.length,
      totalInteractions: analytics.interactions.length,
      totalSessions: analytics.sessions.length,
      averageDAU: Object.values(analytics.dailyStats).reduce((sum, day) => sum + day.dau, 0) / Object.keys(analytics.dailyStats).length,
    };
    
    // Products
    report.products = {
      topViewed: await getTopViewedProducts(20),
      topRated: await getTopRatedProducts(5, 20),
      topWishlisted: await getMostWishlistedProducts(20),
      topInteracted: await getTopInteractedProducts('all', 20),
    };
    
    // Users
    report.users = {
      mostActive: await getMostActiveUsers(20),
    };
    
    // Searches
    report.searches = {
      topTerms: await getTopSearchTerms(50),
      performance: await analyzeSearchPerformance(startDate),
    };
    
    // Interactions
    report.interactions = {
      trends: await analyzeInteractionTrends(startDate, endDate),
    };
    
    return report;
  }
}

module.exports = new AnalyticsExtractor();
```

---

## Notes

1. **User ID Unification**: All analytics use unified userId format (4-character base 36 for registered, `'anonymous'` for anonymous users)
2. **TTL**: Event logs have 30-day TTL, aggregates are permanent
3. **Performance**: Use SCAN instead of KEYS for production, use pipelines for batch operations
4. **Data Structure**: Most data is stored as JSON strings, parse before use
5. **Error Handling**: Always wrap JSON.parse in try-catch blocks

---

**Last Updated:** 2025-01-20  
**Version:** 1.0
