# Authentication API - Quick Start Guide

## Overview

This guide provides a quick reference for integrating authentication into your frontend application.

## Base URL

- **Development**: `http://localhost:3001`
- **Production**: `https://your-domain.com`

## Authentication Flow

### 1. User Registration

```javascript
// Step 1: Signup
const signupResponse = await fetch('http://localhost:3001/api/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId, // Get from device or generate UUID
  },
  body: JSON.stringify({
    username: 'johndoe',
    email: 'john@example.com',
    password: 'securepass123',
    phone: '+1234567890',
    verificationMethod: 'sms',
    deviceId: deviceId,
  }),
});

const signupData = await signupResponse.json();
// signupData.data.user.id - Save for verification
// signupData.data.needsVerification - true if verification needed
```

### 2. Verify Account (if needed)

```javascript
// Step 2: Verify with OTP (if needsVerification is true)
const verifyResponse = await fetch('http://localhost:3001/api/auth/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  },
  body: JSON.stringify({
    userId: signupData.data.user.id,
    code: '123456', // OTP from SMS/WhatsApp
    method: 'sms',
  }),
});

const verifyData = await verifyResponse.json();
// Save tokens
const accessToken = verifyData.data.accessToken;
const refreshToken = verifyData.data.refreshToken;
```

### 3. Login

```javascript
// Login
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'securepass123',
  }),
});

const loginData = await loginResponse.json();
// Save tokens
const accessToken = loginData.data.accessToken;
const refreshToken = loginData.data.refreshToken;
```

### 4. Use Authenticated Endpoints

```javascript
// Make authenticated requests
const response = await fetch('http://localhost:3001/api/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Device-ID': deviceId,
  },
});

const userData = await response.json();
```

## Token Management

### Store Tokens Securely

```javascript
// React Native - Use SecureStore or AsyncStorage
import * as SecureStore from 'expo-secure-store';

// Save tokens
await SecureStore.setItemAsync('accessToken', accessToken);
await SecureStore.setItemAsync('refreshToken', refreshToken);

// Retrieve tokens
const accessToken = await SecureStore.getItemAsync('accessToken');
const refreshToken = await SecureStore.getItemAsync('refreshToken');
```

### Refresh Access Token (Token Rotation)

**Important**: The refresh endpoint returns a **new refresh token** each time. You must store it to maintain the session.

```javascript
// When access token expires (401 error) or proactively
async function refreshAccessToken() {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  
  const refreshResponse = await fetch('http://localhost:3001/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
  });

  const refreshData = await refreshResponse.json();
  
  // IMPORTANT: Store both new tokens (token rotation)
  const newAccessToken = refreshData.data.accessToken;
  const newRefreshToken = refreshData.data.refreshToken; // New refresh token
  
  await SecureStore.setItemAsync('accessToken', newAccessToken);
  await SecureStore.setItemAsync('refreshToken', newRefreshToken);
  
  return newAccessToken;
}
```

**Token Rotation Benefits:**
- Users stay logged in indefinitely as long as they use the app
- Each refresh extends the session automatically
- More secure: old refresh tokens become invalid after use

## Profile Updates

### Update Profile (with Password Confirmation)

```javascript
// Step 1: Verify password client-side
const passwordCorrect = await verifyPasswordLocally(currentPassword, storedPasswordHash);

if (passwordCorrect) {
  // Step 2: Send update request with passwordConfirmed flag
  const updateResponse = await fetch('http://localhost:3001/api/auth/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({
      username: 'newusername',
      passwordConfirmed: true, // App verified password
    }),
  });

  const updateData = await updateResponse.json();
  
  // If email changed, verify email
  if (updateData.data.needsEmailVerification) {
    // Show OTP input, then call verify-email endpoint
  }
}
```

### Verify Email Change

```javascript
const verifyEmailResponse = await fetch('http://localhost:3001/api/auth/verify-email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-Device-ID': deviceId,
  },
  body: JSON.stringify({
    code: '123456', // OTP from SMS/WhatsApp
  }),
});
```

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": "Error Type",
  "code": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Invalid input data
- `UNAUTHORIZED_ERROR` (401): Invalid credentials or expired token
- `FORBIDDEN_ERROR` (403): Access denied
- `NOT_FOUND_ERROR` (404): Resource not found
- `CONFLICT_ERROR` (409): Username/email already taken
- `RATE_LIMIT_ERROR` (429): Too many requests
- `INTERNAL_SERVER_ERROR` (500): Server error

### Handle Token Expiration

```javascript
async function makeAuthenticatedRequest(url, options = {}) {
  let accessToken = await SecureStore.getItemAsync('accessToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': deviceId,
    },
  });

  // If token expired, refresh and retry
  if (response.status === 401) {
    // refreshAccessToken() handles storing the new refresh token automatically
    const newAccessToken = await refreshAccessToken();
    
    // Retry request with new token
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${newAccessToken}`,
        'X-Device-ID': deviceId,
      },
    });
  }

  return response;
}
```

## Required Headers

All requests require:
- `X-Device-ID`: Unique device identifier (UUID or device ID)
- `Content-Type: application/json` (for POST/PUT requests)

Authenticated requests require:
- `Authorization: Bearer <accessToken>`

## Rate Limiting

- **Auth Endpoints**: 5 requests per 15 minutes per device
- **Response**: 429 status with `Retry-After` header if limit exceeded

## Testing

Use the manual test script to verify endpoints:

```bash
node scripts/test-auth.js
```

Or use curl:

```bash
# Signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: test-device" \
  -d '{"username":"test","email":"test@example.com","password":"pass123","deviceId":"test-device"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: test-device" \
  -d '{"email":"test@example.com","password":"pass123"}'
```

## Complete Example (React Native)

```javascript
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'http://localhost:3001/api/auth';
const deviceId = await SecureStore.getItemAsync('deviceId') || uuidv4();
await SecureStore.setItemAsync('deviceId', deviceId);

// Signup
async function signup(username, email, password, phone) {
  const response = await fetch(`${API_BASE}/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({
      username,
      email,
      password,
      phone,
      verificationMethod: 'sms',
      deviceId,
    }),
  });
  
  const data = await response.json();
  if (data.success && data.data.needsVerification) {
    // Show OTP input screen
    return { needsVerification: true, userId: data.data.user.id };
  }
  
  if (data.success && data.data.accessToken) {
    // Save tokens
    await SecureStore.setItemAsync('accessToken', data.data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.data.refreshToken);
    return { success: true, user: data.data.user };
  }
  
  throw new Error(data.message || 'Signup failed');
}

// Login
async function login(email, password) {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  if (data.success) {
    await SecureStore.setItemAsync('accessToken', data.data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.data.refreshToken);
    return { success: true, user: data.data.user };
  }
  
  throw new Error(data.message || 'Login failed');
}

// Get current user
async function getCurrentUser() {
  const accessToken = await SecureStore.getItemAsync('accessToken');
  const response = await fetch(`${API_BASE}/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': deviceId,
    },
  });
  
  const data = await response.json();
  return data.success ? data.data.user : null;
}
```

## Notes

1. **Password Confirmation**: For profile updates, verify password client-side before sending `passwordConfirmed: true`
2. **Email Verification**: Email changes require OTP verification via SMS/WhatsApp
3. **Token Storage**: Store tokens securely (use SecureStore in React Native)
4. **Device ID**: Generate once per device and persist (UUID recommended)
5. **Error Handling**: Always check `success` field in response
6. **Rate Limiting**: Implement retry logic with exponential backoff

