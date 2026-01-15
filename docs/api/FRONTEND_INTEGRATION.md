# Frontend Integration Guide

This guide provides comprehensive instructions for integrating the Prowhey Middleware API into your React Native mobile application.

## Table of Contents

- [Overview](#overview)
- [Base URL & Authentication](#base-url--authentication)
- [Data Sync Strategy](#data-sync-strategy)
- [Home Page Integration](#home-page-integration)
- [Product Integration](#product-integration)
- [Stock Availability Integration](#stock-availability-integration)
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

**Protected Endpoints** (Require JWT token):
- Sync endpoints (`/api/sync/*`)
- Analytics endpoints (`/api/analytics/*`)
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
      
      // Map availability array to warehouse names
      const stockData = {
        itemCode: result.itemCode,
        availability: result.availability,
        warehouses: warehouses,
        stockByWarehouse: warehouses.map((warehouse, index) => ({
          warehouse,
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
  - Stock availability: 1 hour
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
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { getProduct } from './api/product';
import { getStockAvailability } from './api/stock';

function ProductDetailScreen({ route }) {
  const { erpnextName, itemCode } = route.params;
  const [product, setProduct] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadProductData();
  }, [erpnextName, itemCode]);
  
  async function loadProductData() {
    try {
      setLoading(true);
      
      // Fetch product and stock in parallel
      const [productData, stock] = await Promise.all([
        getProduct(erpnextName),
        getStockAvailability(itemCode)
      ]);
      
      setProduct(productData);
      setStockData(stock);
    } catch (error) {
      console.error('Error loading product:', error);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!product) {
    return <ErrorScreen message="Product not found" />;
  }
  
  return (
    <ScrollView>
      <Text>{product.item_name}</Text>
      <Text>{product.description}</Text>
      
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
