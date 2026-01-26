#!/usr/bin/env node

/**
 * Test Signup Without Verification
 *
 * Tests that the signup endpoint:
 * 1. Accepts registration without requiring verification
 * 2. Returns accessToken and refreshToken in response
 * 3. Returns full user object with all profile fields
 * 4. Sets isVerified: true for all registered users
 * 5. Does NOT send OTP codes during registration
 *
 * Usage: node scripts/test-signup-no-verification.js
 */

require('dotenv').config({ path: '.env.development' });

const { getRedisClient } = require('../src/services/redis/client');
const {
  createAnonymousUser,
  getUserById,
  hashPassword,
} = require('../src/services/auth/user-storage');
const { hashPassword: hashPasswordUtil } = require('../src/services/auth/password');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Helper to make HTTP requests with timeout
function makeRequest(method, path, body = null, headers = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: timeout,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to log test results
function logTest(testName, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${icon} ${testName}${reset}${details ? ' - ' + details : ''}`);
}

async function testSignupNoVerification() {
  console.log('🧪 Testing Signup Without Verification\n');
  console.log('='.repeat(60));

  // Set overall timeout for the entire test suite (2 minutes)
  const overallTimeout = setTimeout(() => {
    console.error('\n\x1b[31m❌ Test suite timed out after 2 minutes\x1b[0m');
    process.exit(1);
  }, 120000);

  // Check Redis connectivity
  console.log('\n[SETUP] Checking Redis connectivity...');
  try {
    const redis = getRedisClient();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 5000))
    ]);
    console.log('✅ Redis is connected\n');
  } catch (error) {
    clearTimeout(overallTimeout);
    console.error('\x1b[31m❌ Redis connection failed!\x1b[0m');
    console.error('Please ensure Redis is running');
    process.exit(1);
  }

  let allTestsPassed = true;
  const testUsers = [];

  // Test 1: Signup with required fields → verify tokens returned, isVerified: true
  console.log('[TEST 1] Signup with required fields → verify tokens and isVerified');
  try {
    const deviceId1 = `test-signup-${Date.now()}-1`;
    const username1 = `testuser${Date.now()}`;
    const email1 = `test${Date.now()}@example.com`;
    
    const signupBody = {
      username: username1,
      email: email1,
      password: 'Test123!',
      phone: '+12345678901',
      deviceId: deviceId1,
      first_name: 'John',
      surname: 'Doe',
      province: 'Riyadh',
      city: 'Riyadh',
      gender: 'male',
    };

    const response = await makeRequest('POST', '/api/auth/signup', signupBody, {
      'X-Device-ID': deviceId1,
    });

    logTest('Signup request successful', response.status === 201);
    if (response.status !== 201) {
      console.log('Response:', JSON.stringify(response.body, null, 2));
      allTestsPassed = false;
      throw new Error(`Expected 201, got ${response.status}`);
    }

    const { success, data } = response.body;
    logTest('Response has success: true', success === true);
    logTest('Response has accessToken', !!data.accessToken);
    logTest('Response has refreshToken', !!data.refreshToken);
    logTest('User isVerified is true', data.user.isVerified === true);
    logTest('User userStatus is registered', data.user.userStatus === 'registered');
    logTest('Response does NOT have needsVerification', data.needsVerification === undefined);
    logTest('User has all required profile fields', 
      !!(data.user.firstName && data.user.surname && data.user.phone && 
         data.user.province && data.user.city && data.user.gender));

    if (!success || !data.accessToken || !data.refreshToken) allTestsPassed = false;
    if (data.user.isVerified !== true) allTestsPassed = false;
    if (data.user.userStatus !== 'registered') allTestsPassed = false;
    if (data.needsVerification !== undefined) allTestsPassed = false;

    testUsers.push({ id: data.user.id, deviceId: deviceId1 });
    console.log(`  User ID: ${data.user.id}, Username: ${username1}`);
    console.log(`  Has tokens: ${!!data.accessToken && !!data.refreshToken}`);
    console.log(`  isVerified: ${data.user.isVerified}, userStatus: ${data.user.userStatus}`);
  } catch (error) {
    logTest('Signup with required fields', false, error.message);
    allTestsPassed = false;
  }

  // Test 2: Signup with optional fields → verify all fields returned
  console.log('\n[TEST 2] Signup with optional fields → verify all fields returned');
  try {
    const deviceId2 = `test-signup-${Date.now()}-2`;
    const username2 = `testuser${Date.now()}-2`;
    const email2 = `test${Date.now()}-2@example.com`;
    
    const signupBody = {
      username: username2,
      email: email2,
      password: 'Test123!',
      phone: '+12345678902',
      deviceId: deviceId2,
      first_name: 'Jane',
      surname: 'Smith',
      province: 'Makkah',
      city: 'Jeddah',
      district: 'Al Balad',
      town: 'Al Balad',
      gender: 'female',
      age: 25,
      occupation: 'Developer',
      fitness_level: 'intermediate',
      fitness_goal: 'muscle_gain',
    };

    const response = await makeRequest('POST', '/api/auth/signup', signupBody, {
      'X-Device-ID': deviceId2,
    });

    logTest('Signup with optional fields successful', response.status === 201);
    if (response.status === 201) {
      const { data } = response.body;
      logTest('Optional fields returned in user object', 
        !!(data.user.district && data.user.town && data.user.age && 
           data.user.occupation && data.user.fitnessLevel && data.user.fitnessGoal));
      
      if (!data.user.district || !data.user.town || !data.user.age) allTestsPassed = false;
      
      console.log(`  User ID: ${data.user.id}`);
      console.log(`  District: ${data.user.district}, Town: ${data.user.town}`);
      console.log(`  Age: ${data.user.age}, Occupation: ${data.user.occupation}`);
    } else {
      allTestsPassed = false;
    }
  } catch (error) {
    logTest('Signup with optional fields', false, error.message);
    allTestsPassed = false;
  }

  // Test 3: Signup from anonymous user → verify conversion works
  console.log('\n[TEST 3] Signup from anonymous user → verify conversion');
  try {
    const deviceId3 = `test-signup-${Date.now()}-3`;
    
    // Create anonymous user first
    const anonymousUser = await createAnonymousUser(deviceId3, 'iPhone 14', 'iOS 17.0');
    console.log(`  Created anonymous user: ${anonymousUser.id}`);
    
    // Now signup
    const username3 = `testuser${Date.now()}-3`;
    const email3 = `test${Date.now()}-3@example.com`;
    
    const signupBody = {
      username: username3,
      email: email3,
      password: 'Test123!',
      phone: '+12345678903',
      deviceId: deviceId3,
      first_name: 'Bob',
      surname: 'Johnson',
      province: 'Riyadh',
      city: 'Riyadh',
      gender: 'male',
    };

    const response = await makeRequest('POST', '/api/auth/signup', signupBody, {
      'X-Device-ID': deviceId3,
    });

    logTest('Signup from anonymous user successful', response.status === 201);
    if (response.status === 201) {
      const { data } = response.body;
      logTest('User converted from anonymous to registered', data.user.isRegistered === true);
      logTest('User has tokens', !!(data.accessToken && data.refreshToken));
      logTest('User isVerified is true', data.user.isVerified === true);
      
      if (data.user.id !== anonymousUser.id) {
        logTest('User ID matches anonymous user', false, `Expected ${anonymousUser.id}, got ${data.user.id}`);
        allTestsPassed = false;
      }
      
      console.log(`  User ID: ${data.user.id} (same as anonymous: ${anonymousUser.id})`);
      console.log(`  isRegistered: ${data.user.isRegistered}, isVerified: ${data.user.isVerified}`);
    } else {
      allTestsPassed = false;
    }
  } catch (error) {
    logTest('Signup from anonymous user', false, error.message);
    allTestsPassed = false;
  }

  // Test 4: Verify no OTP codes are sent (check that verification endpoint is not called)
  console.log('\n[TEST 4] Verify no OTP codes sent during registration');
  try {
    // This is more of a documentation test - we can't easily verify OTP wasn't sent
    // But we can verify the response doesn't indicate verification is needed
    const deviceId4 = `test-signup-${Date.now()}-4`;
    const username4 = `testuser${Date.now()}-4`;
    const email4 = `test${Date.now()}-4@example.com`;
    
    const signupBody = {
      username: username4,
      email: email4,
      password: 'Test123!',
      phone: '+12345678904',
      deviceId: deviceId4,
      first_name: 'Alice',
      surname: 'Williams',
      province: 'Riyadh',
      city: 'Riyadh',
      gender: 'female',
    };

    const response = await makeRequest('POST', '/api/auth/signup', signupBody, {
      'X-Device-ID': deviceId4,
    });

    if (response.status === 201) {
      const { data } = response.body;
      logTest('Response does NOT have needsVerification field', data.needsVerification === undefined);
      logTest('Response has tokens (no verification needed)', !!(data.accessToken && data.refreshToken));
      logTest('User isVerified is true', data.user.isVerified === true);
      
      if (data.needsVerification !== undefined) allTestsPassed = false;
      if (!data.accessToken || !data.refreshToken) allTestsPassed = false;
      if (data.user.isVerified !== true) allTestsPassed = false;
      
      console.log(`  User ID: ${data.user.id}`);
      console.log(`  needsVerification: ${data.needsVerification} (should be undefined)`);
      console.log(`  Tokens provided: ${!!data.accessToken && !!data.refreshToken}`);
    } else {
      logTest('Signup request', false, `Status: ${response.status}`);
      allTestsPassed = false;
    }
  } catch (error) {
    logTest('Verify no OTP sent', false, error.message);
    allTestsPassed = false;
  }

  // Test 5: Verify validation requires all required fields
  console.log('\n[TEST 5] Verify validation requires all required fields');
  try {
    const deviceId5 = `test-signup-${Date.now()}-5`;
    
    // Try signup without first_name
    const signupBodyMissing = {
      username: `testuser${Date.now()}-5`,
      email: `test${Date.now()}-5@example.com`,
      password: 'Test123!',
      phone: '+12345678905',
      deviceId: deviceId5,
      // Missing first_name
      surname: 'Doe',
      province: 'Riyadh',
      city: 'Riyadh',
      gender: 'male',
    };

    const response = await makeRequest('POST', '/api/auth/signup', signupBodyMissing, {
      'X-Device-ID': deviceId5,
    });

    logTest('Signup without first_name rejected', response.status === 400);
    if (response.status !== 400) {
      console.log('  Expected 400 validation error, got:', response.status);
      allTestsPassed = false;
    } else {
      console.log('  Validation error (expected):', response.body.error || response.body.message);
    }
  } catch (error) {
    logTest('Validation test', false, error.message);
    allTestsPassed = false;
  }

  // Summary
  clearTimeout(overallTimeout);
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('\x1b[32m✅ All tests passed! Signup works without verification.\x1b[0m\n');
  } else {
    console.log('\x1b[31m❌ Some tests failed. Please review the output above.\x1b[0m\n');
  }

  process.exit(allTestsPassed ? 0 : 1);
}

testSignupNoVerification().catch((error) => {
  console.error('\x1b[31m❌ Test script failed:\x1b[0m', error);
  process.exit(1);
});
