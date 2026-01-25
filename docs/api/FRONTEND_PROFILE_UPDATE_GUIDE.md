# Frontend Profile Update Guide

## Overview

The middleware provides endpoints for getting and updating user profile information. Both anonymous (unregistered) and registered users can update their profiles, with different restrictions based on their `userStatus`.

When location is updated or saved, the frontend must **persist the returned data to local storage** and **display it on the profile page**. See [What Is Returned When Location Is Saved](#what-is-returned-when-location-is-saved) for the exact response shapes, which fields to save, and how to render them.

## Available Endpoints

### 1. Get Current User Profile

**Endpoint:** `GET /api/auth/me`

**Authentication:** Required (Bearer token)

**Headers:**
- `Authorization: Bearer <accessToken>` (required)
- `X-Device-ID: <deviceId>` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "0001",
      "email": "user@example.com",
      "username": "username",
      "phone": "+1234567890",
      "firstName": "John",
      "surname": "Doe",
      "age": 25,
      "occupation": "Developer",
      "fitnessLevel": "intermediate",
      "gender": "male",
      "fitnessGoal": "muscle_gain",
      "province": "Riyadh",
      "city": "Riyadh",
      "district": "Al Malaz",
      "town": "Al Malaz",
      "whatsappNumber": "+1234567890",
      "telegramUsername": "@username",
      "avatar": "data:image/jpeg;base64,...",
      "deviceModel": "iPhone 14 Pro",
      "osModel": "iOS 17.0",
      "geolocation": {
        "lat": 24.7136,
        "lng": 46.6753,
        "province": "Riyadh",
        "city": "Riyadh",
        "district": "Al Malaz",
        "town": "Al Malaz"
      },
      "locationConsent": true,
      "customerType": "retail",
      "erpnextCustomerId": "CUST-001",
      "approvedCustomer": true,
      "isVerified": true,
      "idVerified": false,
      "phoneVerified": true,
      "accountStatus": "active",
      "userStatus": "registered",
      "trustScore": 100,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "lastLogin": "2025-01-15T10:30:00.000Z",
      "isRegistered": true
    }
  }
}
```

**Example Frontend Code:**
```javascript
async function getCurrentUser() {
  const accessToken = await getAccessToken(); // From your auth store
  const deviceId = await getDeviceId(); // From your device storage
  
  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': deviceId,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch user profile');
  }

  return data.data.user;
}
```

---

### 2. Update User Profile

**Endpoint:** `PUT /api/auth/profile`

**Authentication:** Required (Bearer token)

**Headers:**
- `Authorization: Bearer <accessToken>` (required)
- `X-Device-ID: <deviceId>` (required)
- `Content-Type: application/json` (required)

**Important Rules by User Status:**

#### Unregistered Users (`userStatus: 'unregistered'`)
- ✅ Can update: `first_name`, `surname`, `age`, `occupation`, `fitness_level`, `gender`, `fitness_goal`, `province`, `city`, `district`, `town`, `whatsapp_number`, `telegram_username`, `avatar`, `geolocation`, `location_consent`, `device_model`, `os_model`
- ❌ Cannot update: `email`, `username` (must use signup endpoint)
- ✅ No password confirmation required

#### Registered Users (`userStatus: 'registered'` or higher)
- ✅ Can update: All fields
- ⚠️ Password confirmation required for: `email`, `username` changes
- ✅ No password confirmation needed for: profile fields (name, age, location, etc.)

**Request Body (all fields optional):**
```json
{
  "first_name": "John",
  "surname": "Doe",
  "age": 25,
  "occupation": "Developer",
  "fitness_level": "intermediate",
  "gender": "male",
  "fitness_goal": "muscle_gain",
  "province": "Riyadh",
  "city": "Riyadh",
  "district": "Al Malaz",
  "town": "Al Malaz",
  "phone": "+1234567890",
  "whatsapp_number": "+1234567890",
  "telegram_username": "@username",
  "avatar": "data:image/jpeg;base64,...",
  "geolocation": {
    "lat": 24.7136,
    "lng": 46.6753,
    "province": "Riyadh",
    "city": "Riyadh",
    "district": "Al Malaz",
    "town": "Al Malaz"
  },
  "location_consent": true,
  "device_model": "iPhone 14 Pro",
  "os_model": "iOS 17.0",
  
  // For registered users only:
  "username": "newusername",
  "email": "newemail@example.com",
  "passwordConfirmed": true  // Required if updating email/username
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      // Full user object (same structure as GET /api/auth/me)
    }
  }
}
```

**Response (if email changed - requires verification):**
```json
{
  "success": true,
  "data": {
    "needsEmailVerification": true,
    "message": "Email verification code sent",
    "code": "123456"  // Only in development mode
  }
}
```

**Example Frontend Code:**

```javascript
async function updateUserProfile(updates) {
  const accessToken = await getAccessToken();
  const deviceId = await getDeviceId();
  const currentUser = await getCurrentUser(); // Get current user to check status
  
  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  // Check if user is trying to update email/username
  const isUnregistered = currentUser.userStatus === 'unregistered';
  const isUpdatingEmailOrUsername = !!(updates.email || updates.username);
  
  // Unregistered users cannot update email/username
  if (isUnregistered && isUpdatingEmailOrUsername) {
    throw new Error('Email and username can only be set during registration. Please use the signup endpoint.');
  }
  
  // Registered users need password confirmation for email/username changes
  let passwordConfirmed = false;
  if (!isUnregistered && isUpdatingEmailOrUsername) {
    // You need to verify password client-side first
    // This is a simplified example - implement proper password verification
    if (!updates.currentPassword) {
      throw new Error('Password confirmation required for email/username changes');
    }
    // Verify password with your auth system
    passwordConfirmed = await verifyPassword(updates.currentPassword);
    if (!passwordConfirmed) {
      throw new Error('Invalid password');
    }
  }

  // Prepare request body
  const body = {
    ...updates,
    // Convert camelCase to snake_case for API
    first_name: updates.firstName,
    surname: updates.surname,
    fitness_level: updates.fitnessLevel,
    fitness_goal: updates.fitnessGoal,
    whatsapp_number: updates.whatsappNumber,
    telegram_username: updates.telegramUsername,
    location_consent: updates.locationConsent,
    device_model: updates.deviceModel,
    os_model: updates.osModel,
    passwordConfirmed: passwordConfirmed,
  };

  // Remove undefined values
  Object.keys(body).forEach(key => {
    if (body[key] === undefined) {
      delete body[key];
    }
  });

  const response = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-ID': deviceId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to update profile');
  }

  // If email changed, handle verification
  if (data.data.needsEmailVerification) {
    // Show OTP input to user
    // Then call POST /api/auth/verify-email with the code
    return {
      ...data,
      requiresEmailVerification: true,
    };
  }

  return data.data.user;
}
```

---

### 3. Update Geolocation (Dedicated Location Endpoint)

**Endpoint:** `POST /api/users/geolocation`

**Authentication:** Optional (works for both anonymous and registered users)

**Headers:**
- `X-Device-ID: <deviceId>` (required)
- `Authorization: Bearer <accessToken>` (optional - for registered users)

**Request Body:**
```json
{
  "geolocation": {
    "lat": 24.7136,
    "lng": 46.6753,
    "province": "Riyadh",
    "city": "Riyadh",
    "district": "Al Malaz",
    "town": "Al Malaz"
  },
  "location_consent": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Geolocation updated",
  "data": {
    "userId": "0001",
    "geolocation": {
      "lat": 24.7136,
      "lng": 46.6753,
      "province": "Riyadh",
      "city": "Riyadh",
      "district": "Al Malaz",
      "town": "Al Malaz"
    },
    "locationConsent": true
  }
}
```

**Example Frontend Code:**
```javascript
async function updateGeolocation(lat, lng, province, city, district, town, consent = true) {
  const deviceId = await getDeviceId();
  const accessToken = await getAccessToken(); // Optional

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/api/users/geolocation`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      geolocation: {
        lat,
        lng,
        province,
        city,
        district,
        town,
      },
      location_consent: consent,
    }),
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to update geolocation');
  }

  return data.data;
}
```

---

## What Is Returned When Location Is Saved

When the frontend updates or saves profile location, it must **persist the returned data to local storage** and **render it on the profile page**. The response shape depends on which endpoint you use.

| Endpoint | Returns | What to persist | What to display |
|----------|---------|-----------------|-----------------|
| `PUT /api/auth/profile` | `data.user` (full user) | `user` or at least `province`, `city`, `district`, `town`, `geolocation`, `locationConsent` | `user.province`, `user.city`, etc.; `user.geolocation` for map/address |
| `POST /api/users/geolocation` | `data.userId`, `data.geolocation`, `data.locationConsent` | Those three; derive `province`/`city`/`district`/`town` from `geolocation` | Same as above; hide location if `locationConsent` is `false` |

### 1. `PUT /api/auth/profile` (location updated with profile)

**When:** User edits province/city/district/town in a form, or sends `geolocation` + `location_consent` in the profile update.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "0001",
      "email": "user@example.com",
      "username": "username",
      "phone": "+1234567890",
      "firstName": "John",
      "surname": "Doe",
      "age": 25,
      "occupation": "Developer",
      "fitnessLevel": "intermediate",
      "gender": "male",
      "fitnessGoal": "muscle_gain",
      "province": "Riyadh",
      "city": "Riyadh",
      "district": "Al Malaz",
      "town": "Al Malaz",
      "whatsappNumber": "+1234567890",
      "telegramUsername": "@username",
      "avatar": "data:image/jpeg;base64,...",
      "deviceModel": "iPhone 14 Pro",
      "osModel": "iOS 17.0",
      "geolocation": {
        "lat": 24.7136,
        "lng": 46.6753,
        "province": "Riyadh",
        "city": "Riyadh",
        "district": "Al Malaz",
        "town": "Al Malaz"
      },
      "locationConsent": true,
      "customerType": "retail",
      "erpnextCustomerId": "CUST-001",
      "approvedCustomer": true,
      "isVerified": true,
      "idVerified": false,
      "phoneVerified": true,
      "accountStatus": "active",
      "userStatus": "registered",
      "trustScore": 100,
      "isRegistered": true
    }
  }
}
```

**Save to local storage:** Persist `data.user` (or at least the location-related fields below).

**Location-related fields to persist:**

| Field | Type | Use |
|-------|------|-----|
| `province` | `string \| null` | Top-level location; display on profile |
| `city` | `string \| null` | Top-level location; display on profile |
| `district` | `string \| null` | Top-level location; display on profile |
| `town` | `string \| null` | Top-level location; display on profile |
| `geolocation` | `object \| null` | `{ lat, lng, province?, city?, district?, town?, street? }`; use for map or full address |
| `locationConsent` | `boolean` | Whether user has agreed to location storage |

**Display on profile page:** Use `user.province`, `user.city`, `user.district`, `user.town` for text (e.g. “Riyadh, Al Malaz”). Use `user.geolocation` for map pin or full address. If `user.locationConsent` is `false`, treat stored location as revoked and do not show it.

---

### 2. `POST /api/users/geolocation` (dedicated location endpoint)

**When:** User grants location permission, or you update location via GPS + reverse geocode (e.g. “Enable location” flow).

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Geolocation updated",
  "data": {
    "userId": "0001",
    "geolocation": {
      "lat": 24.7136,
      "lng": 46.6753,
      "province": "Riyadh",
      "city": "Riyadh",
      "district": "Al Malaz",
      "town": "Al Malaz"
    },
    "locationConsent": true
  }
}
```

**Note:** This endpoint does **not** return the full user. Only `userId`, `geolocation`, and `locationConsent` are returned. When consent is **revoked** (you send `geolocation: null`, `location_consent: false`), the response has `data.geolocation: null` and `data.locationConsent: false`. The frontend should clear or overwrite stored location with these values and **not** display location on the profile.

**Save to local storage:** Persist `data.userId`, `data.geolocation`, and `data.locationConsent`. Either:

- **Option A (simplest):** Update your local user/profile store with:
  - `geolocation` ← `data.geolocation`
  - `locationConsent` ← `data.locationConsent`
  - `province` ← `data.geolocation?.province ?? null`
  - `city` ← `data.geolocation?.city ?? null`
  - `district` ← `data.geolocation?.district ?? null`
  - `town` ← `data.geolocation?.town ?? null`
- **Option B (single source of truth):** After a successful `POST /api/users/geolocation`, call `GET /api/auth/me`, then persist and display from `data.user` as in section 1.

**Display on profile page:** Same as above: use `province`, `city`, `district`, `town` for text; use `geolocation` for map/full address. If `locationConsent` is `false`, do not show stored location.

---

### Example: persist and display after location update

```javascript
// After PUT /api/auth/profile (location in body)
const res = await fetch(`${BASE_URL}/api/auth/profile`, { ... });
const data = await res.json();
if (data.success && data.data.user) {
  const user = data.data.user;
  await saveToLocalStorage('user', user);
  // Profile page reads from local storage: user.province, user.city, user.district, user.town, user.geolocation, user.locationConsent
}

// After POST /api/users/geolocation
const res = await fetch(`${BASE_URL}/api/users/geolocation`, { ... });
const data = await res.json();
if (data.success && data.data) {
  const { userId, geolocation, locationConsent } = data.data;
  const locationFields = {
    geolocation,
    locationConsent,
    province: geolocation?.province ?? null,
    city: geolocation?.city ?? null,
    district: geolocation?.district ?? null,
    town: geolocation?.town ?? null,
  };
  await mergeUserLocationInLocalStorage(userId, locationFields);
  // Or: refetch GET /api/auth/me and save data.user, then display from that
}
```

---

## Location Update — Frontend Guide

Use this section when implementing location in the UI (e.g. profile, settings, “Enable location” flows).

### Location structure

The API supports a **hierarchy**: province → city → district → town. All are optional; send what you have (e.g. from reverse geocoding or manual input).

| Field      | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `lat`      | number | ✅       | Latitude (-90–90)                    |
| `lng`      | number | ✅       | Longitude (-180–180)                 |
| `province` | string | No       | Province / region                    |
| `city`     | string | No       | City                                 |
| `district` | string | No       | District                             |
| `town`     | string | No       | Town / neighbourhood                 |
| `street`   | string | No       | Street address (optional)            |

**User profile** also exposes top-level `province`, `city`, `district`, `town` (kept in sync with `geolocation` when you use the location endpoints).

### Two ways to update location

| Method | Endpoint | Auth | Use when |
|--------|----------|------|----------|
| **Geolocation** | `POST /api/users/geolocation` | Optional (device ID) | GPS/reverse-geocode updates, “Enable location” flows, anonymous users |
| **Profile**     | `PUT /api/auth/profile`       | Required             | Editing location as part of profile (e.g. province/city/district/town only) |

- Prefer **`POST /api/users/geolocation`** when you have `lat`/`lng` (and optionally province, city, district, town). Works for anonymous and registered users.
- Use **`PUT /api/auth/profile`** when updating location fields only (e.g. user manually changes province/city/district/town) or together with other profile fields.

### Handling location updates in the UI

1. **Collect coordinates**  
   Use the platform APIs (e.g. `@react-native-community/geolocation`, browser Geolocation) to get `lat`/`lng`. Always request permission first and respect user consent.

2. **Reverse geocode → province, city, district, town**  
   Use a reverse-geocoding service (e.g. Google Maps, Mapbox, or your backend) to resolve `lat`/`lng` into:
   - `province`
   - `city`
   - `district`
   - `town`  
   Map your API’s response fields to these names. Omit any you don’t have.

3. **Call the API**  
   - **With coordinates** (and optionally reverse-geocoded fields):
     ```js
     await updateGeolocation(lat, lng, province, city, district, town, true);
     ```
   - **Object form** (e.g. from a hook or shared helper):
     ```js
     await updateGeolocationPayload(
       { lat, lng, province, city, district, town },
       true
     );
     ```
     Implement `updateGeolocationPayload` by sending the first argument as `geolocation` and the second as `location_consent` in the body of `POST /api/users/geolocation` (see example below).

4. **Consent**  
   - Send `location_consent: true` only when the user has explicitly agreed (e.g. “Allow location” or “Save location”).  
   - To revoke: `POST /api/users/geolocation` with `geolocation: null` and `location_consent: false`. The backend clears stored location and top-level province/city/district/town derived from it.

5. **Persist and refresh**  
   Save the returned location to local storage and update the profile page. See [What Is Returned When Location Is Saved](#what-is-returned-when-location-is-saved) for exact response shapes, which fields to persist, and how to display them. Optionally refetch `GET /api/auth/me` after `POST /api/users/geolocation` so you have the full user object for storage and display.

### Example: object-based `updateGeolocation` helper

```javascript
/** @param { { lat: number; lng: number; province?: string; city?: string; district?: string; town?: string; street?: string } } location */
async function updateGeolocationPayload(location, consent = true) {
  const deviceId = await getDeviceId();
  const accessToken = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}/api/users/geolocation`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      geolocation: location,
      location_consent: consent,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to update location');
  return data.data;
}

// Usage after reverse geocoding:
const { lat, lng, province, city, district, town } = reverseGeocodeResult;
await updateGeolocationPayload(
  { lat, lng, province, city, district, town },
  true
);
```

### Example: updating only province/city/district/town (no coordinates)

When the user edits location in a form **without** GPS (e.g. dropdowns or text fields):

```javascript
await updateUserProfile({
  province: 'Riyadh',
  city: 'Riyadh',
  district: 'Al Malaz',
  town: 'Al Malaz',
});
```

Use `PUT /api/auth/profile` with these fields. Do **not** use `POST /api/users/geolocation` if you have no `lat`/`lng`.

### Revoking location consent

```javascript
const deviceId = await getDeviceId();
const token = await getAccessToken();
const headers = { 'Content-Type': 'application/json', 'X-Device-ID': deviceId };
if (token) headers['Authorization'] = `Bearer ${token}`;

const res = await fetch(`${BASE_URL}/api/users/geolocation`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ geolocation: null, location_consent: false }),
});
const data = await res.json();
if (!data.success) throw new Error(data.error || 'Failed to revoke location');
```

Then refetch the user profile so the UI stops showing stored location.

---

### 4. Update Device Info

**Endpoint:** `POST /api/users/device-info`

**Authentication:** Optional (works for both anonymous and registered users)

**Headers:**
- `X-Device-ID: <deviceId>` (required)
- `Authorization: Bearer <accessToken>` (optional)

**Request Body:**
```json
{
  "device_model": "iPhone 14 Pro",
  "os_model": "iOS 17.0"
}
```

---

## Common Use Cases

### Use Case 1: Anonymous User Updates Profile Fields

```javascript
// User is unregistered, wants to add their name and location
const updates = {
  firstName: "John",
  surname: "Doe",
  age: 25,
  province: "Riyadh",
  city: "Riyadh",
  district: "Al Malaz",
  town: "Al Malaz",
};

const updatedUser = await updateUserProfile(updates);
```

### Use Case 2: Registered User Updates Profile

```javascript
// User is registered, wants to update their fitness goal
const updates = {
  fitnessGoal: "weight_loss",
  age: 26, // Also updating age
};

const updatedUser = await updateUserProfile(updates);
// No password confirmation needed for these fields
```

### Use Case 3: Registered User Changes Username

```javascript
// User is registered, wants to change username
const updates = {
  username: "newusername",
  currentPassword: "user's current password", // Required
};

// Your updateUserProfile function should:
// 1. Verify password client-side
// 2. Set passwordConfirmed: true
// 3. Send request

const updatedUser = await updateUserProfile(updates);
```

### Use Case 4: User Sets Location via Geolocation Endpoint

```javascript
// Works for both anonymous and registered users
const location = await updateGeolocation(
  24.7136,  // lat
  46.6753,  // lng
  "Riyadh",   // province
  "Riyadh",   // city
  "Al Malaz", // district
  "Al Malaz"  // town
);
```

---

## Error Handling

### Common Errors:

1. **401 Unauthorized**: Token is missing, invalid, or expired
   - Solution: Refresh token or re-authenticate

2. **400 Validation Error**: Invalid field values
   - Check error response for specific field errors

3. **403 Forbidden**: Unregistered user trying to update email/username
   - Solution: User must register first using signup endpoint

4. **409 Conflict**: Username or email already taken
   - Solution: Choose a different username/email

5. **400 Password Confirmation Required**: Registered user updating email/username without password
   - Solution: Include `passwordConfirmed: true` in request

---

## Field Name Mapping

Frontend (camelCase) → Backend (snake_case):

- `firstName` → `first_name`
- `surname` → `surname` (same)
- `district` → `district` (same)
- `town` → `town` (same)
- `fitnessLevel` → `fitness_level`
- `fitnessGoal` → `fitness_goal`
- `whatsappNumber` → `whatsapp_number`
- `telegramUsername` → `telegram_username`
- `locationConsent` → `location_consent`
- `deviceModel` → `device_model`
- `osModel` → `os_model`
- `erpnextCustomerId` → `erpnext_customer_id`
- `approvedCustomer` → `approved_customer`

---

## Notes

1. **Anonymous users get tokens**: When an anonymous user is created via `POST /api/users/anonymous`, they receive an `accessToken` and `refreshToken`. Use this token for authenticated requests.

2. **Progressive updates**: Unregistered users can progressively add profile information without needing to register first.

3. **Email verification**: If email is changed, the user must verify the new email using `POST /api/auth/verify-email` with the OTP code sent to their phone.

4. **Username availability**: Check username availability before updating using `GET /api/auth/check-username?username=<username>`.

5. **Geolocation endpoint**: The `POST /api/users/geolocation` endpoint is specifically designed for location updates and works without authentication (uses device ID). This is useful for anonymous users who haven't created an account yet.

6. **Location update**: For a step-by-step frontend guide (reverse geocoding, consent, revoke, when to use which endpoint), see [Location Update — Frontend Guide](#location-update--frontend-guide) above.
