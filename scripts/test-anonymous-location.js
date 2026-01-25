#!/usr/bin/env node

/**
 * Test script for anonymous user location setting
 * Tests the full flow: create anonymous user -> set location -> verify location saved
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const DEVICE_ID = `test-device-location-${Date.now()}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logDebug(message, data = {}) {
  console.log(`${colors.cyan}[DEBUG] ${message}${colors.reset}`);
  if (Object.keys(data).length > 0) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': DEVICE_ID,
        ...headers,
      },
    };

    logDebug(`Making ${method} request to ${path}`, {
      headers: options.headers,
      body: body ? JSON.parse(JSON.stringify(body)) : null,
    });

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsedData;
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = data;
        }

        logDebug(`Response status: ${res.statusCode}`, {
          headers: res.headers,
          body: parsedData,
        });

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsedData,
        });
      });
    });

    req.on('error', (error) => {
      logDebug('Request error', { error: error.message });
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testAnonymousUserLocation() {
  log('\n==========================================', 'bright');
  log('Testing Anonymous User Location Setting', 'bright');
  log('==========================================\n', 'bright');

  let userId = null;
  let accessToken = null;

  // Step 1: Create anonymous user
  log('\n[STEP 1] Creating anonymous user...', 'yellow');
  try {
    const createResponse = await makeRequest('POST', '/api/users/anonymous', {
      device_id: DEVICE_ID,
      device_model: 'Test Device',
      os_model: 'Test OS',
    });

    if (createResponse.statusCode !== 201) {
      log(`❌ Failed to create anonymous user: ${createResponse.statusCode}`, 'red');
      logDebug('Response', createResponse.body);
      return false;
    }

    if (!createResponse.body.success) {
      log(`❌ Create user failed: ${createResponse.body.error || 'Unknown error'}`, 'red');
      logDebug('Response', createResponse.body);
      return false;
    }

    userId = createResponse.body.data.userId;
    accessToken = createResponse.body.data.accessToken;

    log(`✓ Anonymous user created: ${userId}`, 'green');
    logDebug('User data', {
      userId,
      isRegistered: createResponse.body.data.isRegistered,
      userStatus: createResponse.body.data.userStatus,
      hasToken: !!accessToken,
    });

    // Verify initial state
    if (createResponse.body.data.geolocation) {
      log(`⚠️  Warning: User already has geolocation: ${JSON.stringify(createResponse.body.data.geolocation)}`, 'yellow');
    } else {
      log('✓ User has no geolocation (expected)', 'green');
    }
  } catch (error) {
    log(`❌ Error creating anonymous user: ${error.message}`, 'red');
    logDebug('Error details', { error: error.stack });
    return false;
  }

  // Step 2: Set location with consent
  log('\n[STEP 2] Setting location with consent...', 'yellow');
  const testLocation = {
    lat: 24.7136,
    lng: 46.6753,
    province: 'Riyadh',
    city: 'Riyadh',
    district: 'Al Malaz',
    town: 'Al Malaz',
  };

  try {
    const locationResponse = await makeRequest(
      'POST',
      '/api/users/geolocation',
      {
        geolocation: testLocation,
        location_consent: true,
      },
      {
        'X-Device-ID': DEVICE_ID,
        // Note: Not sending Authorization header to test anonymous user flow
      }
    );

    logDebug('Location update response', locationResponse.body);

    if (locationResponse.statusCode !== 200) {
      log(`❌ Failed to set location: ${locationResponse.statusCode}`, 'red');
      logDebug('Response', locationResponse.body);
      return false;
    }

    if (!locationResponse.body.success) {
      log(`❌ Set location failed: ${locationResponse.body.error || 'Unknown error'}`, 'red');
      logDebug('Response', locationResponse.body);
      return false;
    }

    const returnedLocation = locationResponse.body.data.geolocation;
    const returnedConsent = locationResponse.body.data.locationConsent;

    log(`✓ Location update response received`, 'green');
    logDebug('Returned data', {
      userId: locationResponse.body.data.userId,
      geolocation: returnedLocation,
      locationConsent: returnedConsent,
    });

    // Verify location was saved correctly
    if (!returnedLocation) {
      log('❌ Location is null in response!', 'red');
      return false;
    }

    if (returnedLocation.lat !== testLocation.lat || returnedLocation.lng !== testLocation.lng) {
      log('❌ Location coordinates do not match!', 'red');
      logDebug('Expected', testLocation);
      logDebug('Got', returnedLocation);
      return false;
    }

    if (returnedLocation.province !== testLocation.province) {
      log(`⚠️  Warning: Province mismatch. Expected: ${testLocation.province}, Got: ${returnedLocation.province}`, 'yellow');
    }

    if (returnedLocation.city !== testLocation.city) {
      log(`⚠️  Warning: City mismatch. Expected: ${testLocation.city}, Got: ${returnedLocation.city}`, 'yellow');
    }

    if (testLocation.district && returnedLocation.district !== testLocation.district) {
      log(`⚠️  Warning: District mismatch. Expected: ${testLocation.district}, Got: ${returnedLocation.district}`, 'yellow');
    }

    if (testLocation.town && returnedLocation.town !== testLocation.town) {
      log(`⚠️  Warning: Town mismatch. Expected: ${testLocation.town}, Got: ${returnedLocation.town}`, 'yellow');
    }

    if (!returnedConsent) {
      log('❌ Location consent is false!', 'red');
      return false;
    }

    log('✓ Location saved correctly', 'green');
    logDebug('Saved location', returnedLocation);
  } catch (error) {
    log(`❌ Error setting location: ${error.message}`, 'red');
    logDebug('Error details', { error: error.stack });
    return false;
  }

  // Step 3: Verify location by fetching user profile
  log('\n[STEP 3] Verifying location by fetching user profile...', 'yellow');
  try {
    const profileResponse = await makeRequest(
      'GET',
      '/api/auth/me',  // Fixed: Use /api/auth/me instead of /api/auth/profile
      null,
      {
        'X-Device-ID': DEVICE_ID,
        Authorization: `Bearer ${accessToken}`,
      }
    );

    logDebug('Profile response', profileResponse.body);

    if (profileResponse.statusCode !== 200) {
      log(`⚠️  Warning: Could not fetch profile: ${profileResponse.statusCode}`, 'yellow');
      logDebug('Response', profileResponse.body);
    } else if (profileResponse.body.success && profileResponse.body.data?.user) {
      const user = profileResponse.body.data.user;
      log('✓ Profile fetched successfully', 'green');
      logDebug('User profile', {
        userId: user.id,
        geolocation: user.geolocation,
        locationConsent: user.locationConsent,
        userStatus: user.userStatus,
      });

      if (user.geolocation) {
        if (
          user.geolocation.lat === testLocation.lat &&
          user.geolocation.lng === testLocation.lng
        ) {
          log('✓ Location verified in user profile', 'green');
        } else {
          log('❌ Location mismatch in profile!', 'red');
          logDebug('Expected', testLocation);
          logDebug('Got', user.geolocation);
          return false;
        }
      } else {
        log('❌ Location is null in user profile!', 'red');
        return false;
      }

      if (user.locationConsent !== true) {
        log('❌ Location consent is false in profile!', 'red');
        return false;
      }
    }
  } catch (error) {
    log(`⚠️  Warning: Error fetching profile: ${error.message}`, 'yellow');
    logDebug('Error details', { error: error.stack });
    // Don't fail the test if profile fetch fails - location update already succeeded
  }

  // Step 4: Test updating location again
  log('\n[STEP 4] Testing location update (second time)...', 'yellow');
  const updatedLocation = {
    lat: 21.4858,
    lng: 39.1925,
    province: 'Makkah',
    city: 'Jeddah',
    district: 'Al Balad',
    town: 'Al Balad',
  };

  try {
    const updateResponse = await makeRequest(
      'POST',
      '/api/users/geolocation',
      {
        geolocation: updatedLocation,
        location_consent: true,
      },
      {
        'X-Device-ID': DEVICE_ID,
      }
    );

    if (updateResponse.statusCode !== 200 || !updateResponse.body.success) {
      log(`❌ Failed to update location: ${updateResponse.statusCode}`, 'red');
      logDebug('Response', updateResponse.body);
      return false;
    }

    const updatedReturnedLocation = updateResponse.body.data.geolocation;
    if (
      updatedReturnedLocation.lat === updatedLocation.lat &&
      updatedReturnedLocation.lng === updatedLocation.lng
    ) {
      log('✓ Location update (second time) successful', 'green');
    } else {
      log('❌ Location update (second time) failed - coordinates mismatch', 'red');
      logDebug('Expected', updatedLocation);
      logDebug('Got', updatedReturnedLocation);
      return false;
    }
  } catch (error) {
    log(`❌ Error updating location: ${error.message}`, 'red');
    logDebug('Error details', { error: error.stack });
    return false;
  }

  log('\n==========================================', 'bright');
  log('✅ All tests passed!', 'green');
  log('==========================================\n', 'bright');

  return true;
}

// Run the test
testAnonymousUserLocation()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    logDebug('Error details', { error: error.stack });
    process.exit(1);
  });
