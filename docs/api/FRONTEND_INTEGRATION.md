# Frontend Integration Guide

This guide provides comprehensive instructions for integrating the Prowhey Middleware API into your React Native mobile application.

## Table of Contents

- [Overview](#overview)
- [Base URL & Authentication](#base-url--authentication)
- [Data Sync Strategy](#data-sync-strategy)
- [Home Page Integration](#home-page-integration)
- [Product Integration](#product-integration)
- [Stock Availability Integration](#stock-availability-integration)
- [Analytics Integration](#analytics-integration)
- [User Profile & Anonymous Users](#user-profile--anonymous-users)
- [Sync API Integration](#sync-api-integration)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Complete Examples](#complete-examples)

---

## Overview

The Prowhey Middleware provides a RESTful API for your React Native app to:
- Fetch home page data (hero images, product lists)
- Fetch product details
- Check stock availability
- Sync data efficiently using incremental sync endpoints
- Submit analytics (views, ratings, comments)

All endpoints follow a **detail-page-driven caching strategy** to minimize API calls and server load.

---

## Base URL & Authentication

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://your-domain.com` |
| Development | `http://localhost:3001` |

### Authentication

**Public Endpoints** (No authentication required):
- Home page endpoints (`/api/home`, `/api/hero`)
- Product endpoints (`/api/resource/Website Item`)
- Stock endpoints (`/api/stock/:itemCode`)
- Warehouse reference (`/api/stock/warehouses/reference`)
- Analytics read endpoints (`GET /api/analytics/product/:name/view`, `GET /api/analytics/product/:name/comment`, `GET /api/analytics/product/:name/rating`)

**Protected Endpoints** (Require JWT token):
- Sync endpoints (`/api/sync/*`)
- Analytics write endpoints (optional auth - works with or without token)
- Wishlist endpoints (`GET /api/analytics/wishlist`, `POST /api/analytics/wishlist/add`, `POST /api/analytics/wishlist/remove`)
- User profile endpoints (`/api/auth/*`)

**Authentication Header:**
```javascript
headers: {
  'Authorization': `Bearer ${accessToken}`
}
```

For authentication setup, see [AUTH_QUICK_START.md](./AUTH_QUICK_START.md).

---

## Data Sync Strategy

### Detail-Page-Driven Caching

**Critical Principle:** Only fetch data when users actually view it.

1. **Home Page**: Fetch only when home screen opens
2. **Product Details**: Fetch only when product detail page opens
3. **Stock Availability**: Fetch only when product detail page opens
4. **Respect Refresh Rate**: Cache data with timestamp, only refresh if older than threshold (e.g., 1 hour)

### Implementation Pattern

```javascript
// Pseudo-code pattern for all endpoints
async function fetchEntityData(entityType, entityId, refreshRate = 3600000) {
  // 1. Check local cache
  const cached = await getCachedData(entityType, entityId);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < refreshRate) {
    return cached.data; // Use cached data
  }
  
  // 2. Fetch from API
  const response = await fetch(`${BASE_URL}/api/${endpoint}`);
  const data = await response.json();
  
  // 3. Cache with timestamp
  await cacheData(entityType, entityId, {
    data: data,
    timestamp: now
  });
  
  return data;
}
```

---

## Home Page Integration

### Fetching Hero Images

**Endpoint:** `GET /api/hero`

**When to Call:** Only when home screen opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const HERO_CACHE_KEY = 'hero_images';
const REFRESH_RATE = 3600000; // 1 hour

async function getHeroImages() {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(HERO_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/hero`);
    const result = await response.json();
    
    if (result.success && result.heroImages) {
      // Cache the data
      await AsyncStorage.setItem(HERO_CACHE_KEY, JSON.stringify({
        data: result.heroImages,
        timestamp: Date.now()
      }));
      
      return result.heroImages;
    }
    
    throw new Error('Failed to fetch hero images');
  } catch (error) {
    console.error('Error fetching hero images:', error);
    // Return cached data if available, even if expired
    const cached = await AsyncStorage.getItem(HERO_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return [];
  }
}

// Usage in React component
function HomeScreen() {
  const [heroImages, setHeroImages] = useState([]);
  
  useEffect(() => {
    getHeroImages().then(setHeroImages);
  }, []);
  
  return (
    <ScrollView>
      {heroImages.map((imageDataUrl, index) => (
        <Image
          key={index}
          source={{ uri: imageDataUrl }} // Base64 data URL works directly
          style={{ width: '100%', height: 200 }}
        />
      ))}
    </ScrollView>
  );
}
```

**Response Format:**
```json
{
  "success": true,
  "heroImages": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  ]
}
```

**Notes:**
- Images are base64-encoded data URLs, ready for direct display
- No additional download needed
- Cache with timestamp to respect refresh rate

---

### Fetching Bundle Images

**Endpoint:** `GET /api/bundle`

**When to Call:** Only when home screen opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const BUNDLE_CACHE_KEY = 'bundle_images';
const REFRESH_RATE = 3600000; // 1 hour

async function getBundleImages() {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(BUNDLE_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/bundle`);
    const result = await response.json();
    
    if (result.success && result.bundleImages) {
      // Cache the data
      await AsyncStorage.setItem(BUNDLE_CACHE_KEY, JSON.stringify({
        data: result.bundleImages,
        timestamp: Date.now()
      }));
      
      return result.bundleImages;
    }
    
    throw new Error('Failed to fetch bundle images');
  } catch (error) {
    console.error('Error fetching bundle images:', error);
    // Return cached data if available, even if expired
    const cached = await AsyncStorage.getItem(BUNDLE_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return [];
  }
}

// Usage in React component
function HomeScreen() {
  const [bundleImages, setBundleImages] = useState([]);
  
  useEffect(() => {
    getBundleImages().then(setBundleImages);
  }, []);
  
  return (
    <ScrollView>
      {bundleImages.map((imageDataUrl, index) => (
        <Image
          key={index}
          source={{ uri: imageDataUrl }} // Base64 data URL works directly
          style={{ width: '100%', height: 200 }}
        />
      ))}
    </ScrollView>
  );
}
```

**Response Format:**
```json
{
  "success": true,
  "bundleImages": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  ]
}
```

**Notes:**
- Images are base64-encoded data URLs, ready for direct display
- No additional download needed
- Cache with timestamp to respect refresh rate

---

### Fetching App Home Data

**Endpoint:** `GET /api/home`

**When to Call:** Only when home screen opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
const HOME_CACHE_KEY = 'app_home';
const REFRESH_RATE = 3600000; // 1 hour

async function getAppHome() {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(HOME_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/home`);
    const result = await response.json();
    
    if (result.success) {
      const homeData = {
        top_sellers: result.top_sellers || [],
        new_arrivals: result.new_arrivals || [],
        most_viewed: result.most_viewed || [],
        top_offers: result.top_offers || [],
        html1: result.html1 || '',
        html2: result.html2 || '',
        html3: result.html3 || '',
      };
      
      // Cache the data
      await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
        data: homeData,
        timestamp: Date.now()
      }));
      
      return homeData;
    }
    
    throw new Error('Failed to fetch app home data');
  } catch (error) {
    console.error('Error fetching app home:', error);
    // Return cached data if available
    const cached = await AsyncStorage.getItem(HOME_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return {
      top_sellers: [],
      new_arrivals: [],
      most_viewed: [],
      top_offers: [],
      html1: '',
      html2: '',
      html3: '',
    };
  }
}

// Usage in React component
function HomeScreen() {
  const [homeData, setHomeData] = useState(null);
  
  useEffect(() => {
    getAppHome().then(setHomeData);
  }, []);
  
  if (!homeData) {
    return <LoadingScreen />;
  }
  
  return (
    <ScrollView>
      {/* Top Sellers Section */}
      <ProductList
        title="Top Sellers"
        itemCodes={homeData.top_sellers}
      />
      
      {/* New Arrivals Section */}
      <ProductList
        title="New Arrivals"
        itemCodes={homeData.new_arrivals}
      />
      
      {/* HTML Content Sections */}
      <WebView
        source={{ html: homeData.html1 }}
        style={{ height: 200 }}
      />
    </ScrollView>
  );
}
```

**Response Format:**
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

**Notes:**
- Product lists contain item codes - fetch product details separately
- HTML fields can be rendered using WebView or HTML renderer
- Cache with timestamp to respect refresh rate

---

## Product Integration

### Fetching Product Details

**Endpoint:** `GET /api/resource/Website Item?filters=[["name", "=", "WEB-ITM-0002"]]`

**When to Call:** Only when product detail page opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
const PRODUCT_CACHE_KEY = (erpnextName) => `product_${erpnextName}`;
const REFRESH_RATE = 3600000; // 1 hour

async function getProduct(erpnextName) {
  try {
    // Check cache
    const cacheKey = PRODUCT_CACHE_KEY(erpnextName);
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const filters = encodeURIComponent(JSON.stringify([["name", "=", erpnextName]]));
    const response = await fetch(
      `${BASE_URL}/api/resource/Website%20Item?filters=${filters}`
    );
    const result = await response.json();
    
    if (result.success && result.product) {
      // Cache the data
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: result.product,
        timestamp: Date.now()
      }));
      
      return result.product;
    }
    
    throw new Error('Product not found');
  } catch (error) {
    console.error('Error fetching product:', error);
    // Return cached data if available
    const cacheKey = PRODUCT_CACHE_KEY(erpnextName);
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached).data;
    }
    throw error;
  }
}
```

**Response Format:**
See [API.md](./API.md#get-single-product) for complete product data structure.

---

## Stock Availability Integration

### Fetching Warehouse Reference

**Endpoint:** `GET /api/stock/warehouses/reference`

**When to Call:** Once a month (or when app detects availability array length change).

**Example:**
```javascript
const WAREHOUSE_REFERENCE_KEY = 'warehouse_reference';
const WAREHOUSE_REFERENCE_TTL = 30 * 24 * 3600000; // 30 days

async function getWarehouseReference() {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(WAREHOUSE_REFERENCE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < WAREHOUSE_REFERENCE_TTL) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/stock/warehouses/reference`);
    const result = await response.json();
    
    if (result.success && result.warehouses) {
      // Cache the data
      await AsyncStorage.setItem(WAREHOUSE_REFERENCE_KEY, JSON.stringify({
        data: result.warehouses,
        timestamp: Date.now()
      }));
      
      return result.warehouses;
    }
    
    throw new Error('Failed to fetch warehouse reference');
  } catch (error) {
    console.error('Error fetching warehouse reference:', error);
    // Return cached data if available
    const cached = await AsyncStorage.getItem(WAREHOUSE_REFERENCE_KEY);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return [];
  }
}
```

---

### Fetching Stock Availability

**Endpoint:** `GET /api/stock/:itemCode`

**When to Call:** Only when product detail page opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
const STOCK_CACHE_KEY = (itemCode) => `stock_${itemCode}`;
const REFRESH_RATE = 3600000; // 1 hour

async function getStockAvailability(itemCode) {
  try {
    // Check cache
    const cacheKey = STOCK_CACHE_KEY(itemCode);
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/stock/${itemCode}`);
    const result = await response.json();
    
    if (result.success && result.availability) {
      // Get warehouse reference
      const warehouses = await getWarehouseReference();
      
      // Helper to get warehouse name (supports both object and string formats)
      const getWarehouseName = (wh) => typeof wh === 'object' ? wh.name : wh;
      
      // Map availability array to warehouse names
      const stockData = {
        itemCode: result.itemCode,
        availability: result.availability,
        warehouses: warehouses,
        stockByWarehouse: warehouses.map((warehouse, index) => ({
          name: getWarehouseName(warehouse),
          lat: typeof warehouse === 'object' ? warehouse.lat : null,
          lng: typeof warehouse === 'object' ? warehouse.lng : null,
          available: result.availability[index] === 1
        }))
      };
      
      // Cache the data
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: stockData,
        timestamp: Date.now()
      }));
      
      return stockData;
    }
    
    throw new Error('Stock availability not found');
  } catch (error) {
    console.error('Error fetching stock availability:', error);
    // Return cached data if available
    const cacheKey = STOCK_CACHE_KEY(itemCode);
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return null;
  }
}

// Usage in React component
function ProductDetailScreen({ itemCode }) {
  const [stockData, setStockData] = useState(null);
  
  useEffect(() => {
    getStockAvailability(itemCode).then(setStockData);
  }, [itemCode]);
  
  if (!stockData) {
    return <LoadingScreen />;
  }
  
  return (
    <View>
      <Text>Stock Availability:</Text>
      {stockData.stockByWarehouse.map(({ warehouse, available }) => (
        <Text key={warehouse}>
          {warehouse}: {available ? 'In Stock' : 'Out of Stock'}
        </Text>
      ))}
    </View>
  );
}
```

**Response Format:**
```json
{
  "success": true,
  "itemCode": "OL-EN-92-rng-1kg",
  "availability": [0, 0, 1, 0, 1, 0, 0]
}
```

**Notes:**
- Availability array is binary (0 = no stock, 1 = stock available)
- Each index corresponds to warehouse reference array index
- Fetch warehouse reference separately (once a month)
- **Important:** Stock availability is updated in real-time via webhooks and also via a weekly snapshot on Friday evenings. To ensure your app stays up-to-date with availability changes, **check the sync stream every hour** for stock availability updates. See the [Sync API Integration](#sync-api-integration) section for details on how to implement hourly sync checks.

---

### Fetching Item Prices

**Endpoint:** `GET /api/price/:itemCode`

**When to Call:** Only when product detail page opens, and only if cached data is older than refresh rate (e.g., 1 hour).

**Example:**
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRICE_CACHE_KEY = (itemCode) => `price_${itemCode}`;
const REFRESH_RATE = 3600000; // 1 hour

async function getItemPrice(itemCode) {
  try {
    // Check cache
    const cached = await AsyncStorage.getItem(PRICE_CACHE_KEY(itemCode));
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      if (now - timestamp < REFRESH_RATE) {
        return data; // Use cached data
      }
    }
    
    // Fetch from API
    const response = await fetch(`${BASE_URL}/api/price/${itemCode}`);
    const result = await response.json();
    
    if (result.success && result.prices) {
      // Cache the data
      await AsyncStorage.setItem(PRICE_CACHE_KEY(itemCode), JSON.stringify({
        data: result.prices,
        timestamp: Date.now()
      }));
      
      return result.prices; // [retail, wholesale]
    }
    
    throw new Error('Failed to fetch item price');
  } catch (error) {
    console.error('Error fetching item price:', error);
    // Return cached data if available, even if expired
    const cached = await AsyncStorage.getItem(PRICE_CACHE_KEY(itemCode));
    if (cached) {
      return JSON.parse(cached).data;
    }
    return [0, 0]; // Default: no prices
  }
}

// Usage in React component
function ProductDetailScreen({ itemCode }) {
  const [prices, setPrices] = useState([0, 0]);
  const [retail, wholesale] = prices;
  
  useEffect(() => {
    getItemPrice(itemCode).then(setPrices);
  }, [itemCode]);
  
  return (
    <View>
      <Text>Retail Price: ${retail}</Text>
      <Text>Wholesale Price: ${wholesale}</Text>
    </View>
  );
}
```

**Response Format:**
```json
{
  "success": true,
  "itemCode": "OL-EN-92-rng-1kg",
  "prices": [29.99, 24.99]
}
```

**Price Array Format:**
- `prices[0]`: Retail price (Standard Selling)
- `prices[1]`: Wholesale price (Wholesale Selling)
- If a price doesn't exist, it will be `0`

**Notes:**
- Prices are fetched only when product detail page opens
- Cache with timestamp to respect refresh rate (e.g., 1 hour)
- Follow detail-page-driven caching strategy

---

## Analytics Integration

The analytics system tracks user interactions and provides both public endpoints (accessible to all users) and analytics-only endpoints (write-only for data collection).

### Authentication

**Public Analytics Endpoints** (No authentication required):
- `GET /api/analytics/product/:name/view` - Get view count
- `GET /api/analytics/product/:name/comment` - Get comments
- `GET /api/analytics/product/:name/rating` - Get ratings

**Optional Authentication** (Works with or without JWT token):
- Most analytics write endpoints accept optional authentication
- If authenticated, events are tracked per-user
- If not authenticated, events are tracked anonymously (using deviceId/sessionId)

**Required Authentication**:
- `GET /api/analytics/wishlist` - Get user's wishlist
- `POST /api/analytics/wishlist/add` - Add to wishlist
- `POST /api/analytics/wishlist/remove` - Remove from wishlist

### Public Analytics Endpoints

#### Views

**Track View:**
```javascript
// POST /api/analytics/product/:name/view
async function trackProductView(productName, metadata = {}) {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Optional: Include Authorization header if user is logged in
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      duration: metadata.duration, // Optional: view duration in milliseconds
      source: metadata.source, // Optional: 'home', 'search', 'category', etc.
    }),
  });
  
  const result = await response.json();
  return result.views; // New view count
}
```

**Get View Count:**
```javascript
// GET /api/analytics/product/:name/view
async function getProductViews(productName) {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/view`);
  const result = await response.json();
  return result.views;
}
```

#### Comments

**Add Comment:**
```javascript
// POST /api/analytics/product/:name/comment
async function addComment(productName, text, author = 'anonymous') {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/comment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      author,
      timestamp: new Date().toISOString(),
    }),
  });
  
  const result = await response.json();
  return result.comments; // Updated comments array
}
```

**Get Comments:**
```javascript
// GET /api/analytics/product/:name/comment
async function getComments(productName) {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/comment`);
  const result = await response.json();
  return result.comments; // Array of comments
}
```

#### Ratings

**Add Rating:**
```javascript
// POST /api/analytics/product/:name/rating
async function addRating(productName, starRating) {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/rating`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      starRating: starRating, // 1-5
    }),
  });
  
  const result = await response.json();
  return {
    ratingBreakdown: result.ratingBreakdown,
    reviewCount: result.reviewCount,
  };
}
```

**Get Ratings:**
```javascript
// GET /api/analytics/product/:name/rating
async function getRatings(productName) {
  const response = await fetch(`${BASE_URL}/api/analytics/product/${productName}/rating`);
  const result = await response.json();
  return {
    ratingBreakdown: result.ratingBreakdown,
    reviewCount: result.reviewCount,
  };
}

// Calculate average rating
function calculateAverageRating(ratingBreakdown, reviewCount) {
  if (reviewCount === 0) return 0;
  const total = 
    ratingBreakdown['1'] * 1 +
    ratingBreakdown['2'] * 2 +
    ratingBreakdown['3'] * 3 +
    ratingBreakdown['4'] * 4 +
    ratingBreakdown['5'] * 5;
  return total / reviewCount;
}
```

### Analytics-Only Endpoints (Write-Only)

These endpoints collect data for analytics but don't expose read endpoints to app users. Data is collected for internal analysis.

#### Batch Events

**Recommended:** Use batch endpoint to send multiple events in one request for efficiency.

```javascript
// POST /api/analytics/batch
async function sendBatchEvents(events, sessionId = null, deviceId = null) {
  const response = await fetch(`${BASE_URL}/api/analytics/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Optional: Include Authorization header if user is logged in
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
      ...(deviceId && { 'X-Device-ID': deviceId }),
      ...(sessionId && { 'X-Session-ID': sessionId }),
    },
    body: JSON.stringify({
      events: [
        {
          type: 'view',
          entity_id: 'WEB-ITM-0001',
          metadata: { duration: 5000, source: 'home' },
        },
        {
          type: 'search',
          term: 'protein powder',
          filters: { category: 'supplements' },
          results_count: 15,
          clicked_results: ['WEB-ITM-0001'],
        },
        {
          type: 'interaction',
          interaction_type: 'image_view',
          product_name: 'WEB-ITM-0001',
          metadata: { image_index: 2 },
        },
      ],
      session_id: sessionId,
      device_id: deviceId,
    }),
  });
  
  const result = await response.json();
  return result; // { success: true, processed: 3, failed: 0 }
}
```

**Best Practice:** Collect events in your app and send them in batches (e.g., every 10 events or every 30 seconds) to reduce API calls.

#### Search Tracking

```javascript
// POST /api/analytics/search
async function trackSearch(term, filters = {}, resultsCount = 0, clickedResults = []) {
  const response = await fetch(`${BASE_URL}/api/analytics/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
      ...(deviceId && { 'X-Device-ID': deviceId }),
      ...(sessionId && { 'X-Session-ID': sessionId }),
    },
    body: JSON.stringify({
      term,
      filters,
      results_count: resultsCount,
      clicked_results: clickedResults,
    }),
  });
  
  return await response.json();
}
```

#### Wishlist (Authenticated)

```javascript
// POST /api/analytics/wishlist/add
async function addToWishlist(productName) {
  const response = await fetch(`${BASE_URL}/api/analytics/wishlist/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`, // Required
    },
    body: JSON.stringify({
      product_name: productName,
    }),
  });
  
  const result = await response.json();
  return result.wishlist; // Updated wishlist array
}

// GET /api/analytics/wishlist
async function getWishlist() {
  const response = await fetch(`${BASE_URL}/api/analytics/wishlist`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`, // Required
    },
  });
  
  const result = await response.json();
  return result.wishlist; // Array of product names
}

// POST /api/analytics/wishlist/remove
async function removeFromWishlist(productName) {
  const response = await fetch(`${BASE_URL}/api/analytics/wishlist/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`, // Required
    },
    body: JSON.stringify({
      product_name: productName,
    }),
  });
  
  const result = await response.json();
  return result.wishlist; // Updated wishlist array
}
```

#### App Session Tracking

```javascript
// POST /api/analytics/session/open
async function trackAppOpen(sessionId = null, metadata = {}) {
  const response = await fetch(`${BASE_URL}/api/analytics/session/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      session_id: sessionId || generateSessionId(),
      metadata: {
        heartbeatInterval: metadata.heartbeatInterval || 30000, // 30 seconds
      },
    }),
  });
  
  const result = await response.json();
  return result.sessionId; // Store this for heartbeat/close
}

// POST /api/analytics/session/heartbeat
async function trackHeartbeat(sessionId, metadata = {}) {
  const response = await fetch(`${BASE_URL}/api/analytics/session/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      session_id: sessionId,
      metadata,
    }),
  });
  
  return await response.json();
}

// POST /api/analytics/session/close
async function trackAppClose(sessionId, metadata = {}) {
  const response = await fetch(`${BASE_URL}/api/analytics/session/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      session_id: sessionId,
      metadata,
    }),
  });
  
  return await response.json();
}

// Example: Session lifecycle management
let currentSessionId = null;
let heartbeatInterval = null;

function startSession() {
  trackAppOpen().then((sessionId) => {
    currentSessionId = sessionId;
    
    // Send heartbeat every 30 seconds
    heartbeatInterval = setInterval(() => {
      trackHeartbeat(currentSessionId);
    }, 30000);
  });
}

function endSession() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  if (currentSessionId) {
    trackAppClose(currentSessionId);
    currentSessionId = null;
  }
}

// Call on app lifecycle events
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active') {
    startSession();
  } else if (nextAppState === 'background' || nextAppState === 'inactive') {
    endSession();
  }
});
```

#### Product Interactions

```javascript
// POST /api/analytics/interaction
async function trackInteraction(type, productName, metadata = {}) {
  const response = await fetch(`${BASE_URL}/api/analytics/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify({
      type: type, // 'image_view', 'variant_select', or 'share'
      product_name: productName,
      metadata: metadata, // e.g., { image_index: 2, variant: '5lb' }
    }),
  });
  
  return await response.json();
}

// Example usage
trackInteraction('image_view', 'WEB-ITM-0001', { image_index: 2 });
trackInteraction('variant_select', 'WEB-ITM-0001', { variant: '5lb' });
trackInteraction('share', 'WEB-ITM-0001', { platform: 'whatsapp' });
```

### Analytics Best Practices

1. **Batch Events**: Collect multiple events and send them in batches using the batch endpoint
2. **Optional Authentication**: Include JWT token when available for per-user tracking
3. **Session Management**: Track app open/close and send heartbeats while app is active
4. **Public vs Analytics-Only**: 
   - Use public endpoints (views, comments, ratings) for displaying data to users
   - Use analytics-only endpoints for data collection (no read access needed)
5. **Error Handling**: Analytics failures shouldn't block user experience - handle errors gracefully

---

## User Profile & Anonymous Users

The middleware supports both registered users and anonymous (non-registered) users. All users have unique user IDs, and anonymous users can be converted to registered users during signup.

### Anonymous User Creation

When your app first opens, create an anonymous user to track device and usage:

**Endpoint:** `POST /api/users/anonymous`

**When to Call:** On app launch (first time only, or if no userId exists)

**Example:**
```javascript
import DeviceInfo from 'react-native-device-info';
import Geolocation from '@react-native-community/geolocation';

async function initializeAnonymousUser() {
  try {
    // Check if we already have a userId
    const existingUserId = await AsyncStorage.getItem('userId');
    if (existingUserId) {
      return existingUserId; // Already initialized
    }

    const deviceId = await DeviceInfo.getUniqueId();
    const deviceModel = `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`;
    const osModel = `${DeviceInfo.getSystemName()} ${DeviceInfo.getSystemVersion()}`;

    // Request location permission
    let geolocation = null;
    let locationConsent = false;
    
    try {
      const hasPermission = await requestLocationPermission();
      if (hasPermission) {
        const position = await getCurrentPosition();
        geolocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          // Optionally reverse geocode to get province, city, district, town
          // province: 'Riyadh', city: 'Riyadh', district: 'Al Malaz', town: 'Al Malaz',
        };
        locationConsent = true;
      }
    } catch (error) {
      console.log('Location permission denied or unavailable');
    }

    const response = await fetch(`${BASE_URL}/api/users/anonymous`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
      },
      body: JSON.stringify({
        device_id: deviceId,
        device_model: deviceModel,
        os_model: osModel,
        geolocation: geolocation,
        location_consent: locationConsent,
      }),
    });

    const data = await response.json();
    
    if (data.success) {
      // Store userId for future requests
      await AsyncStorage.setItem('userId', data.data.userId);
      await AsyncStorage.setItem('isRegistered', String(data.data.isRegistered));
      return data.data.userId;
    }
  } catch (error) {
    console.error('Failed to initialize anonymous user:', error);
    // Don't block app - continue without anonymous user
  }
}
```

### Device Info Update

Update device information when device changes or on app start:

**Endpoint:** `POST /api/users/device-info`

**Example:**
```javascript
async function updateDeviceInfo() {
  const deviceId = await DeviceInfo.getUniqueId();
  const deviceModel = `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`;
  const osModel = `${DeviceInfo.getSystemName()} ${DeviceInfo.getSystemVersion()}`;

  await fetch(`${BASE_URL}/api/users/device-info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({
      device_model: deviceModel,
      os_model: osModel,
    }),
  });
}
```

### Geolocation Update

Update user geolocation with explicit consent. Location supports **province**, **city**, **district**, and **town** (from reverse geocoding).

**Endpoint:** `POST /api/users/geolocation`

**Location shape:** `{ lat, lng, province?, city?, district?, town?, street? }`. See [Frontend Profile Update Guide — Location Update](./FRONTEND_PROFILE_UPDATE_GUIDE.md#location-update--frontend-guide) for details.

**Example:**
```javascript
async function updateGeolocation(location, consent = true) {
  const deviceId = await DeviceInfo.getUniqueId();
  const accessToken = await getAccessToken(); // Optional - for registered users

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/api/users/geolocation`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      geolocation: location,
      location_consent: consent,
    }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to update geolocation');
  return data.data;
}

// Usage: after reverse geocoding, pass full location object
// const location = { lat, lng, province, city, district, town };
// const result = await updateGeolocation(location, true);
// result = { userId, geolocation, locationConsent } — persist to local storage and display on profile.
```

**What is returned:** `POST /api/users/geolocation` returns `{ success, message, data: { userId, geolocation, locationConsent } }`. It does **not** return the full user. Persist `data.geolocation`, `data.locationConsent`, and derived `province`/`city`/`district`/`town` from `geolocation` to local storage, then display them on the profile page. For full response shapes and persistence/display guidance, see [What Is Returned When Location Is Saved](./FRONTEND_PROFILE_UPDATE_GUIDE.md#what-is-returned-when-location-is-saved) in the Frontend Profile Update Guide.

### User Profile Management

#### Get Current User Profile

**Endpoint:** `GET /api/auth/me` (requires authentication)

**Example:**
```javascript
async function getCurrentUserProfile() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null; // User not logged in
  }

  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': await DeviceInfo.getUniqueId(),
    },
  });

  const data = await response.json();
  return data.success ? data.data.user : null;
}
```

#### Update User Profile

**Endpoint:** `PUT /api/auth/profile` (authentication optional for unregistered users)

**Progressive Updates:**
- **Unregistered users**: Can update profile fields (location, device info, personal details) without password confirmation. Cannot update email/username (must use signup endpoint).
- **Registered users**: Can update all fields. Password confirmation required for sensitive changes (email, username).

**Example:**
```javascript
async function updateUserProfile(updates) {
  const accessToken = await getAccessToken(); // Optional - may be null for unregistered users
  const deviceId = await DeviceInfo.getUniqueId();

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };

  // Include auth token if available (for registered users)
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // For registered users updating email/username, verify password client-side first
  let passwordConfirmed = false;
  if (accessToken && (updates.email || updates.username)) {
    const passwordCorrect = await verifyPasswordLocally(
      updates.currentPassword,
      storedPasswordHash
    );
    if (!passwordCorrect) {
      throw new Error('Invalid password');
    }
    passwordConfirmed = true;
  }

  const response = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify({
      username: updates.username,
      email: updates.email,
      phone: updates.phone,
      first_name: updates.firstName,
      surname: updates.surname,
      province: updates.province,
      city: updates.city,
      district: updates.district,
      town: updates.town,
      whatsapp_number: updates.whatsappNumber,
      telegram_username: updates.telegramUsername,
      avatar: updates.avatar, // Base64-encoded image
      geolocation: updates.geolocation,
      location_consent: updates.locationConsent,
      customer_type: updates.customerType,
      erpnext_customer_id: updates.erpnextCustomerId, // Optional: ERPNext customer ID
      approved_customer: updates.approvedCustomer, // Optional: Customer approval status
      passwordConfirmed: passwordConfirmed, // Only required for registered users updating email/username
    }),
  });

  const data = await response.json();
  
  // If email changed, user needs to verify new email
  if (data.data.needsEmailVerification) {
    // Show OTP input and call verify-email endpoint
    return { needsVerification: true, data: data.data };
  }

  return data.data.user;
}
```

### Converting Anonymous to Registered User

When an anonymous user signs up, the middleware automatically converts their anonymous account to a registered account, preserving device info and geolocation:

**Example:**
```javascript
async function signup(username, email, password) {
  const deviceId = await DeviceInfo.getUniqueId();
  const existingUserId = await AsyncStorage.getItem('userId');

  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({
      username: username,
      email: email,
      password: password,
      deviceId: deviceId, // Same deviceId as anonymous user
      // Additional profile fields
      province: 'Riyadh',
      city: 'Riyadh',
      customer_type: 'retail',
    }),
  });

  const data = await response.json();
  
  if (data.success) {
    // Update stored userId and registration status
    await AsyncStorage.setItem('userId', data.data.user.id);
    await AsyncStorage.setItem('isRegistered', 'true');
    
    // Store tokens if user is verified
    if (data.data.accessToken) {
      await SecureStore.setItemAsync('accessToken', data.data.accessToken);
      await SecureStore.setItemAsync('refreshToken', data.data.refreshToken);
    }
  }

  return data;
}
```

### User Profile Data Structure

**Registered User:**
```javascript
{
  id: "0001...",
  isRegistered: true,
  userStatus: "erpnext_customer", // Progressive status: 'unregistered' | 'registered' | 'erpnext_customer' | 'verified'
  accountStatus: "active", // Account health: 'active' | 'pending_verification' | 'disabled' | 'suspended'
  username: "john_doe",
  email: "john@example.com",
  phone: "+966501234567",
  province: "Riyadh",
  city: "Riyadh",
  whatsappNumber: "+966501234567",
  telegramUsername: "@johndoe",
  avatar: "data:image/jpeg;base64,...",
  deviceModel: "iPhone 14 Pro",
  osModel: "iOS 17.0",
  geolocation: {
    lat: 24.7136,
    lng: 46.6753,
    province: "Riyadh",
    city: "Riyadh"
  },
  locationConsent: true,
  customerType: "retail",
  erpnextCustomerId: "CUST-001", // ERPNext customer ID (if linked)
  approvedCustomer: true, // Whether customer is approved for orders
  isVerified: true,
  idVerified: false, // ID verification status (for credit/trust)
  createdAt: "2024-01-15T10:30:00Z",
  lastLogin: "2024-01-20T15:45:00Z"
}
```

**Unregistered User:**
```javascript
{
  id: "0002...",
  isRegistered: false,
  userStatus: "unregistered", // Progressive status
  accountStatus: "active", // Account is active, just not registered yet
  deviceId: "device-456",
  deviceModel: "Samsung Galaxy S23",
  osModel: "Android 13",
  firstName: "John", // Can be set progressively
  province: "Damascus", // Can be set progressively via location permission
  city: "Damascus",
  geolocation: {
    lat: 33.5138,
    lng: 36.2765,
    province: "Damascus",
    city: "Damascus"
  }, // Can be set via location permission popup
  locationConsent: true,
  customerType: "retail",
  createdAt: "2024-01-15T10:30:00Z"
  // No email, username, or password - these are set during signup
}
```

### Progressive Data Collection

The backend supports progressive user data collection, allowing users to update profile fields gradually without requiring email/password until registration.

#### User Status Progression

Users progress through four status levels:

1. **`unregistered`**: User has ID but hasn't completed registration (no email/password)
   - Can update: location, device info, personal details (firstName, surname, age, etc.)
   - Cannot update: email, username, password (must use signup endpoint)

2. **`registered`**: User completed registration (has email/username + password)
   - Can update: all profile fields
   - Sensitive changes (email, username) require password confirmation

3. **`erpnext_customer`**: User has ERPNext customer account (`erpnextCustomerId` is set)
   - Can place orders and access payment history (if `approvedCustomer: true`)

4. **`verified`**: User has verified ID (`idVerified: true`)
   - Highest trust level, eligible for credit/advanced features

#### Progressive Update Example

**Unregistered User Profile Update:**

```javascript
async function updateUnregisteredUserProfile(updates) {
  // Unregistered users can update profile fields without password confirmation
  // Note: Authentication token is optional for unregistered users
  const deviceId = await DeviceInfo.getUniqueId();
  const accessToken = await getAccessToken(); // Optional - may be null for unregistered users

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };

  // Include auth token if available (for registered users)
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify({
      first_name: updates.firstName,
      surname: updates.surname,
      province: updates.province,
      city: updates.city,
      district: updates.district,
      town: updates.town,
      // No passwordConfirmed required for unregistered users
      // Cannot update email/username (must use signup endpoint)
    }),
  });

  const data = await response.json();
  
  if (data.success) {
    // Check userStatus to see if it progressed
    const userStatus = data.data.user.userStatus;
    console.log(`User status: ${userStatus}`);
    
    return data.data.user;
  }
  
  throw new Error(data.message || 'Failed to update profile');
}
```

**Registered User Profile Update:**

```javascript
async function updateRegisteredUserProfile(updates, passwordConfirmed = false) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('User must be logged in');
  }

  // For sensitive changes (email, username), password confirmation is required
  const requiresPasswordConfirmation = updates.email || updates.username;
  
  if (requiresPasswordConfirmation && !passwordConfirmed) {
    throw new Error('Password confirmation required for email/username changes');
  }

  const response = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': await DeviceInfo.getUniqueId(),
    },
    body: JSON.stringify({
      ...updates,
      passwordConfirmed: requiresPasswordConfirmation ? passwordConfirmed : undefined,
    }),
  });

  const data = await response.json();
  
  // If email changed, user needs to verify new email
  if (data.data.needsEmailVerification) {
    return { needsVerification: true, data: data.data };
  }

  return data.data.user;
}
```

#### Status Transition Triggers

Status automatically transitions when:

- **`unregistered` → `registered`**: When user completes signup (provides email/username + password)
- **`registered` → `erpnext_customer`**: When `erpnextCustomerId` is set (via profile update or admin)
- **`erpnext_customer` → `verified`**: When `idVerified` becomes `true` (via admin verification)

**Example: Checking User Status:**

```javascript
async function checkUserStatus() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return 'unregistered'; // No token means unregistered
  }

  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': await DeviceInfo.getUniqueId(),
    },
  });

  const data = await response.json();
  if (data.success) {
    return data.data.user.userStatus || 'unregistered';
  }
  
  return 'unregistered';
}

// Usage: Show different UI based on user status
async function renderUserProfile() {
  const userStatus = await checkUserStatus();
  
  switch (userStatus) {
    case 'unregistered':
      // Show registration prompt, allow profile updates without email
      return <UnregisteredProfileView />;
      
    case 'registered':
      // Show full profile, allow all updates
      return <RegisteredProfileView />;
      
    case 'erpnext_customer':
      // Show profile + order history access
      return <CustomerProfileView />;
      
    case 'verified':
      // Show profile + credit/advanced features
      return <VerifiedProfileView />;
  }
}
```

#### Collecting Location via Notification Popups

You can collect user location progressively through notification permission requests. Use reverse geocoding to populate **province**, **city**, **district**, and **town** before calling the API.

```javascript
import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

async function requestLocationPermission() {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return null;
      }
    }

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const location = { lat: latitude, lng: longitude };

          // Reverse geocode to get province, city, district, town (optional)
          // const reversed = await reverseGeocode(latitude, longitude);
          // if (reversed) Object.assign(location, reversed);

          try {
            const result = await updateGeolocation(location, true);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  } catch (error) {
    console.error('Location permission error:', error);
    return null;
  }
}

// Call this when user grants location permission via notification popup
async function onLocationPermissionGranted() {
  const result = await requestLocationPermission();
  if (result) {
    // Location updates user's province, city, district, town (and geolocation)
    console.log('Location updated successfully');
  }
}
```

### Best Practices

1. **Initialize on App Launch**: Create anonymous user when app first opens
2. **Store userId**: Save userId in AsyncStorage for future requests
3. **Progressive Updates**: Allow users to update profile fields gradually without requiring registration
4. **Location Consent**: Always request explicit consent before collecting geolocation (via notification popups)
5. **Device Info**: Update device info on app start or when device changes
6. **Privacy Compliance**: Respect user's location consent and allow revocation
7. **Seamless Conversion**: Anonymous users are automatically converted to registered during signup
8. **Status Awareness**: Check `userStatus` to show appropriate UI and features based on user progression

---

## Messaging Integration

The messaging system enables two-way communication between the company and app users. Messages are delivered via the sync mechanism for efficient delivery.

### Message Sync (Hourly Check)

**Recommended Approach:** Use the sync mechanism to check for new messages hourly when the app is open.

**Endpoint:** `POST /api/sync/check-medium` (includes messages in medium-frequency entities)

**Example:**

```javascript
async function checkForNewMessages(userId, lastSync) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { messages: [], lastIds: lastSync };
  }

  const response = await fetch(`${BASE_URL}/api/sync/check-medium`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      lastSync: lastSync || {},
      userId: userId, // Required for message filtering
      limit: 100,
    }),
  });

  const result = await response.json();

  if (result.inSync) {
    return { messages: [], lastIds: lastSync };
  }

  // Filter messages from updates
  const messages = (result.updates || []).filter(
    (update) => update.entity_type === 'message'
  );

  // Update lastSync for messages
  const newLastIds = {
    ...lastSync,
    ...(result.lastIds || {}),
  };

  return { messages, lastIds: newLastIds };
}
```

### Handling Action Buttons

Company messages can include action buttons that enable deep linking to specific app screens.

**Action Button Structure:**

```javascript
{
  label: string,        // Button label (e.g., "View Product")
  action: string,       // Action type: 'product' | 'registration' | 'about' | 'enable_geolocation' | 'custom'
  target?: string,      // Target (required for 'product' and 'custom')
  metadata?: object     // Additional metadata
}
```

**Action Handler Example:**

```javascript
function handleActionButton(button, navigation) {
  const { action, target, metadata } = button;

  switch (action) {
    case 'product':
      // Navigate to product detail page
      if (target) {
        navigation.navigate('ProductDetail', { productName: target });
      }
      break;

    case 'registration':
      // Navigate to registration form
      navigation.navigate('Registration');
      break;

    case 'about':
      // Navigate to about page
      navigation.navigate('About');
      break;

    case 'enable_geolocation':
      // Request location permission and update via POST /api/users/geolocation
      requestLocationPermission()
        .then((result) => {
          if (result) console.log('Geolocation enabled');
        })
        .catch((error) => {
          console.error('Failed to enable geolocation:', error);
        });
      break;

    case 'custom':
      // Custom deep link or action
      if (target) {
        if (target.startsWith('http://') || target.startsWith('https://')) {
          // Open URL
          Linking.openURL(target);
        } else {
          // Navigate to custom screen
          navigation.navigate(target, metadata || {});
        }
      }
      break;

    default:
      console.warn('Unknown action type:', action);
  }
}
```

### Sending Messages to Company

**Endpoint:** `POST /api/messaging/send` (requires authentication)

**Example:**

```javascript
async function sendMessageToCompany(text) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('User must be logged in');
  }

  const response = await fetch(`${BASE_URL}/api/messaging/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': await DeviceInfo.getUniqueId(),
    },
    body: JSON.stringify({
      text: text,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to send message');
  }

  return data.data.message;
}
```

### Message Display Component

**Example React Native Component:**

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { checkForNewMessages, sendMessageToCompany } from './api/messaging';
import { handleActionButton } from './utils/actionButtons';

function MessagesScreen({ navigation, userId }) {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSync, setLastSync] = useState({});

  useEffect(() => {
    // Check for messages on mount
    loadMessages();

    // Set up hourly check for new messages
    const interval = setInterval(() => {
      checkForNewMessages();
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, []);

  async function loadMessages() {
    try {
      const { messages: newMessages, lastIds } = await checkForNewMessages(
        userId,
        lastSync
      );

      if (newMessages.length > 0) {
        setMessages((prev) => [...newMessages, ...prev]);
        setLastSync(lastIds);
      }

      // Update unread count
      const unread = messages.filter((msg) => !msg.read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function handleButtonPress(button) {
    handleActionButton(button, navigation);
  }

  return (
    <ScrollView>
      {messages.map((message) => (
        <View key={message.messageId} style={styles.messageContainer}>
          <Text style={styles.sender}>
            {message.sender === 'company' ? 'Company' : 'You'}
          </Text>
          <Text style={styles.text}>{message.text}</Text>
          <Text style={styles.timestamp}>
            {new Date(message.timestamp).toLocaleString()}
          </Text>

          {/* Action Buttons (company messages only) */}
          {message.sender === 'company' && message.actionButtons && (
            <View style={styles.actionButtons}>
              {message.actionButtons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.actionButton}
                  onPress={() => handleButtonPress(button)}
                >
                  <Text style={styles.actionButtonText}>{button.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
```

### Direct Message Fetch (Optional)

While sync is preferred, you can also fetch messages directly:

**Endpoint:** `GET /api/messaging` (requires authentication)

**Example:**

```javascript
async function getMessages(limit = 50, offset = 0) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('User must be logged in');
  }

  const response = await fetch(
    `${BASE_URL}/api/messaging?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Device-ID': await DeviceInfo.getUniqueId(),
      },
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to get messages');
  }

  return {
    messages: data.data.messages,
    unreadCount: data.data.unreadCount,
  };
}
```

### Mark Message as Read

**Endpoint:** `PUT /api/messaging/:messageId/read`

**Example:**

```javascript
async function markMessageAsRead(messageId) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('User must be logged in');
  }

  const response = await fetch(
    `${BASE_URL}/api/messaging/${messageId}/read`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Device-ID': await DeviceInfo.getUniqueId(),
      },
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to mark message as read');
  }

  return data.data.message;
}
```

### Get Unread Count

**Endpoint:** `GET /api/messaging/unread-count`

**Example:**

```javascript
async function getUnreadMessageCount() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return 0;
  }

  const response = await fetch(`${BASE_URL}/api/messaging/unread-count`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': await DeviceInfo.getUniqueId(),
    },
  });

  const data = await response.json();

  if (!data.success) {
    return 0;
  }

  return data.data.unreadCount;
}
```

### Best Practices

1. **Use Sync for Message Delivery**: Check for messages via `/api/sync/check-medium` hourly when app is open
2. **Store lastSync**: Persist `lastSync` object (including `message` key) in AsyncStorage
3. **Handle Action Buttons**: Implement action button handlers for all supported actions
4. **Mark as Read**: Mark messages as read when user views them
5. **Show Unread Badge**: Display unread count badge in UI
6. **Error Handling**: Handle network errors gracefully, fallback to cached messages

---

## Sync API Integration

The sync API provides efficient incremental synchronization. See [SYNC_API.md](./SYNC_API.md) for complete documentation.

### Handling Deletion Markers

When products are deleted or unpublished in ERPNext, the middleware sends deletion markers via the sync API. Your app should handle these to remove deleted products from local cache and UI.

**Deletion Marker Format:**
```json
{
  "entity_type": "product",
  "entity_id": "WEB-ITM-0001",
  "deleted": true,
  "updated_at": "1768469419659",
  "version": "2",
  "data_hash": "...",
  "idempotency_key": "..."
}
```

**Key Fields:**
- `deleted: true` - Indicates this is a deletion marker (not an update)
- `entity_id` - The product ID that was deleted
- `entity_type` - The type of entity (e.g., "product", "stock")

**What to Do:**
1. **Remove from local cache** - Delete the cached product data
2. **Remove from UI** - Remove the product from any lists (home page, search results, etc.)
3. **Handle gracefully** - If user is viewing the deleted product, show a "Product no longer available" message
4. **Update lists** - Remove the product ID from any cached product lists (top_sellers, new_arrivals, etc.)

### Basic Sync Flow

```javascript
const SYNC_CACHE_KEY = 'sync_last_ids';
const SYNC_REFRESH_RATES = {
  fast: 15 * 60 * 1000,    // 15 minutes
  medium: 60 * 60 * 1000,  // 1 hour
  slow: 24 * 60 * 60 * 1000, // 24 hours
};

async function syncData(entityTypes, frequency = 'slow') {
  try {
    const accessToken = await getAccessToken(); // Get from auth storage
    
    // Get last sync IDs
    const lastSyncIds = await AsyncStorage.getItem(SYNC_CACHE_KEY);
    const lastSync = lastSyncIds ? JSON.parse(lastSyncIds) : {};
    
    // Determine endpoint based on frequency
    let endpoint = '/api/sync/check';
    if (frequency === 'fast') {
      endpoint = '/api/sync/check-fast';
    } else if (frequency === 'medium') {
      endpoint = '/api/sync/check-medium';
    } else if (frequency === 'slow') {
      endpoint = '/api/sync/check-slow';
    }
    
    // Call sync endpoint
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        lastSync,
        entityTypes,
        limit: 100
      })
    });
    
    const result = await response.json();
    
    if (result.inSync) {
      return { updates: [], lastIds: lastSync };
    }
    
    // Process updates
    const updates = result.updates || [];
    const newLastIds = result.lastIds || lastSync;
    
    // Update last sync IDs
    await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(newLastIds));
    
    // Process each update
    for (const update of updates) {
      await processUpdate(update);
    }
    
    return { updates, lastIds: newLastIds };
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}

async function processUpdate(update) {
  const { entity_type, entity_id, data, deleted } = update;
  
  // Handle deletions
  if (deleted === true) {
    switch (entity_type) {
      case 'product':
        // Remove product from local cache
        await AsyncStorage.removeItem(PRODUCT_CACHE_KEY(entity_id));
        // Also remove from any product lists (e.g., home page lists)
        await removeProductFromLists(entity_id);
        console.log(`Product ${entity_id} deleted - removed from cache`);
        break;
        
      case 'stock':
        // Remove stock data from local cache
        await AsyncStorage.removeItem(STOCK_CACHE_KEY(entity_id));
        console.log(`Stock ${entity_id} deleted - removed from cache`);
        break;
        
      case 'price':
        // Remove price data from local cache
        await AsyncStorage.removeItem(PRICE_CACHE_KEY(entity_id));
        console.log(`Price ${entity_id} deleted - removed from cache`);
        break;
        
      case 'hero':
        // Hero images are replaced, not deleted individually
        // Fetch fresh hero images
        await getHeroImages();
        break;
        
      case 'home':
        // App Home is replaced, not deleted individually
        // Fetch fresh home data
        await getAppHome();
        break;
    }
    return; // Don't process further for deletions
  }
  
  // Handle updates (non-deletions)
  switch (entity_type) {
    case 'hero':
      await AsyncStorage.setItem(HERO_CACHE_KEY, JSON.stringify({
        data: data.heroImages,
        timestamp: Date.now()
      }));
      break;
      
    case 'home':
      await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      break;
      
    case 'product':
      await AsyncStorage.setItem(
        PRODUCT_CACHE_KEY(entity_id),
        JSON.stringify({
          data: data,
          timestamp: Date.now()
        })
      );
      break;
      
      case 'stock':
        await AsyncStorage.setItem(
          STOCK_CACHE_KEY(entity_id),
          JSON.stringify({
            data: {
              itemCode: entity_id,
              availability: data.availability
            },
            timestamp: Date.now()
          })
        );
      break;
      
      case 'price':
        await AsyncStorage.setItem(
          PRICE_CACHE_KEY(entity_id),
          JSON.stringify({
            data: data.prices, // [retail, wholesale]
            timestamp: Date.now()
          })
        );
      break;
      
      case 'message':
        // Store message in local cache
        await AsyncStorage.setItem(
          MESSAGE_CACHE_KEY(entity_id),
          JSON.stringify({
            data: data,
            timestamp: Date.now()
          })
        );
        // Also add to messages list
        await addMessageToList(data);
        // Show notification if unread
        if (!data.read) {
          showMessageNotification(data);
        }
      break;
  }
}

// Helper function to remove deleted products from cached lists
async function removeProductFromLists(productId) {
  try {
    const homeData = await AsyncStorage.getItem(HOME_CACHE_KEY);
    if (homeData) {
      const { data } = JSON.parse(homeData);
      const updatedData = {
        ...data,
        top_sellers: data.top_sellers?.filter(id => id !== productId) || [],
        new_arrivals: data.new_arrivals?.filter(id => id !== productId) || [],
        most_viewed: data.most_viewed?.filter(id => id !== productId) || [],
        top_offers: data.top_offers?.filter(id => id !== productId) || [],
      };
      await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
        data: updatedData,
        timestamp: Date.now()
      }));
    }
  } catch (error) {
    console.error('Error removing product from lists:', error);
  }
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

### Error Handling Pattern

```javascript
async function fetchWithErrorHandling(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }
    
    if (!result.success) {
      throw new Error(result.message || 'Request failed');
    }
    
    return result;
  } catch (error) {
    console.error('API Error:', error);
    
    // Handle specific error types
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      // Refresh token or redirect to login
      await refreshAccessToken();
      // Retry request
      return fetchWithErrorHandling(url, options);
    }
    
    if (error.message.includes('404')) {
      // Resource not found - return null or empty data
      return null;
    }
    
    // Re-throw for other errors
    throw error;
  }
}
```

---

## Best Practices

### 1. Caching Strategy

- **Always cache with timestamp** - Check timestamp before using cached data
- **Use appropriate refresh rates**:
  - Home page data: 1 hour
  - Product details: 1 hour
  - Stock availability: 1 hour (also check sync stream hourly for real-time updates)
  - Item prices: 1 hour
  - Warehouse reference: 30 days
- **Fallback to cached data** - If API call fails, use cached data even if expired

### 2. Network Efficiency

- **Only fetch when needed** - Follow detail-page-driven caching strategy
- **Use sync API for bulk updates** - More efficient than individual fetches
- **Batch requests** - Group related API calls when possible

### 3. User Experience

- **Show cached data immediately** - Display cached data while fetching fresh data
- **Update in background** - Fetch fresh data without blocking UI
- **Handle errors gracefully** - Show user-friendly error messages

### 4. Performance

- **Use AsyncStorage efficiently** - Don't store large objects unnecessarily
- **Clear old cache** - Periodically clean up expired cache entries
- **Compress data** - Consider compressing large cached objects

---

## Complete Examples

### Home Screen Component

```javascript
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHeroImages, getAppHome } from './api/home';
import { getProduct } from './api/product';

function HomeScreen() {
  const [heroImages, setHeroImages] = useState([]);
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadHomeData();
  }, []);
  
  async function loadHomeData() {
    try {
      setLoading(true);
      
      // Fetch hero images and home data in parallel
      const [hero, home] = await Promise.all([
        getHeroImages(),
        getAppHome()
      ]);
      
      setHeroImages(hero);
      setHomeData(home);
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  return (
    <ScrollView>
      {/* Hero Images */}
      <ScrollView horizontal>
        {heroImages.map((imageUrl, index) => (
          <Image
            key={index}
            source={{ uri: imageUrl }}
            style={{ width: 300, height: 200 }}
          />
        ))}
      </ScrollView>
      
      {/* Product Lists */}
      {homeData && (
        <>
          <ProductListSection
            title="Top Sellers"
            itemCodes={homeData.top_sellers}
          />
          <ProductListSection
            title="New Arrivals"
            itemCodes={homeData.new_arrivals}
          />
        </>
      )}
    </ScrollView>
  );
}

function ProductListSection({ title, itemCodes }) {
  const [products, setProducts] = useState([]);
  
  useEffect(() => {
    loadProducts();
  }, [itemCodes]);
  
  async function loadProducts() {
    // Fetch product details for each item code
    const productPromises = itemCodes.map(code => getProduct(code));
    const productsData = await Promise.allSettled(productPromises);
    setProducts(productsData
      .filter(p => p.status === 'fulfilled')
      .map(p => p.value)
    );
  }
  
  return (
    <View>
      <Text>{title}</Text>
      {products.map(product => (
        <ProductCard key={product.erpnext_name} product={product} />
      ))}
    </View>
  );
}

export default HomeScreen;
```

### Product Detail Screen Component

```javascript
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { getProduct } from './api/product';
import { getStockAvailability } from './api/stock';
import { getItemPrice } from './api/price';
import { trackProductView, getProductViews, getComments, getRatings, addComment, addRating } from './api/analytics';

function ProductDetailScreen({ route }) {
  const { erpnextName, itemCode } = route.params;
  const [product, setProduct] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [prices, setPrices] = useState([0, 0]);
  const [views, setViews] = useState(0);
  const [comments, setComments] = useState([]);
  const [ratings, setRatings] = useState({ ratingBreakdown: {}, reviewCount: 0 });
  const [loading, setLoading] = useState(true);
  const viewStartTime = useRef(Date.now());
  
  useEffect(() => {
    loadProductData();
    trackView(); // Track view when screen opens
    
    // Track view duration when component unmounts
    return () => {
      const duration = Date.now() - viewStartTime.current;
      trackProductView(erpnextName, null, { duration, source: 'product_detail' });
    };
  }, [erpnextName, itemCode]);
  
  async function loadProductData() {
    try {
      setLoading(true);
      
      // Fetch product, stock, price, and analytics in parallel
      const [productData, stock, priceArray, viewCount, commentsData, ratingsData] = await Promise.all([
        getProduct(erpnextName),
        getStockAvailability(itemCode),
        getItemPrice(itemCode),
        getProductViews(erpnextName),
        getComments(erpnextName),
        getRatings(erpnextName)
      ]);
      
      setProduct(productData);
      setStockData(stock);
      setPrices(priceArray || [0, 0]);
      setViews(viewCount);
      setComments(commentsData);
      setRatings(ratingsData);
    } catch (error) {
      console.error('Error loading product:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function trackView() {
    try {
      // Track view with metadata
      await trackProductView(erpnextName, null, {
        source: 'product_detail',
      });
    } catch (error) {
      // Don't block UI if analytics fails
      console.warn('Failed to track view:', error);
    }
  }
  
  async function handleAddComment(text) {
    try {
      const updatedComments = await addComment(erpnextName, text);
      setComments(updatedComments);
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  }
  
  async function handleAddRating(starRating) {
    try {
      const result = await addRating(erpnextName, starRating);
      setRatings({
        ratingBreakdown: result.ratingBreakdown,
        reviewCount: result.reviewCount,
      });
    } catch (error) {
      console.error('Error adding rating:', error);
    }
  }
  
  function calculateAverageRating() {
    const { ratingBreakdown, reviewCount } = ratings;
    if (reviewCount === 0) return 0;
    const total = 
      ratingBreakdown['1'] * 1 +
      ratingBreakdown['2'] * 2 +
      ratingBreakdown['3'] * 3 +
      ratingBreakdown['4'] * 4 +
      ratingBreakdown['5'] * 5;
    return total / reviewCount;
  }
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!product) {
    return <ErrorScreen message="Product not found" />;
  }
  
  const [retail, wholesale] = prices;
  const averageRating = calculateAverageRating();
  
  return (
    <ScrollView>
      <Text>{product.item_name}</Text>
      <Text>{product.description}</Text>
      
      {/* Views */}
      <Text>{views} views</Text>
      
      {/* Ratings */}
      <View>
        <Text>Rating: {averageRating.toFixed(1)} ({ratings.reviewCount} reviews)</Text>
        {/* Star rating component - allow user to rate */}
        <StarRatingComponent 
          onRate={handleAddRating}
          currentRating={averageRating}
        />
      </View>
      
      {/* Prices */}
      <View>
        <Text>Retail Price: ${retail}</Text>
        {wholesale > 0 && <Text>Wholesale Price: ${wholesale}</Text>}
      </View>
      
      {/* Stock Availability */}
      {stockData && (
        <View>
          <Text>Stock Availability:</Text>
          {stockData.stockByWarehouse.map(({ warehouse, available }) => (
            <Text key={warehouse}>
              {warehouse}: {available ? '✓ In Stock' : '✗ Out of Stock'}
            </Text>
          ))}
        </View>
      )}
      
      {/* Comments */}
      <View>
        <Text>Comments ({comments.length})</Text>
        {comments.map((comment) => (
          <View key={comment.id}>
            <Text>{comment.author}: {comment.text}</Text>
            <Text>{new Date(comment.timestamp).toLocaleDateString()}</Text>
          </View>
        ))}
        {/* Comment input component */}
        <CommentInput onSubmit={handleAddComment} />
      </View>
    </ScrollView>
  );
}

export default ProductDetailScreen;
```

---

## Additional Resources

- [API.md](./API.md) - Complete API reference
- [SYNC_API.md](./SYNC_API.md) - Sync API documentation
- [AUTH_QUICK_START.md](./AUTH_QUICK_START.md) - Authentication guide
- [HOME_DATA_STRUCTURE.md](./HOME_DATA_STRUCTURE.md) - Home data structure details

---

## Support

For issues or questions:
1. Check API documentation
2. Review error messages in logs
3. Verify network connectivity
4. Check cache expiration
5. Contact backend team for API issues
