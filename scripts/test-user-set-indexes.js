#!/usr/bin/env node

/**
 * Test User Set Index Updates
 *
 * Tests that profile updates properly remove users from old sets and add them to new ones:
 * - Province changes: removed from old province set, added to new
 * - City changes: removed from old city set, added to new
 * - User status transitions: removed from non_registered:users when registering
 * - Location clearing: removed from province/city sets when location is cleared
 *
 * Usage: node scripts/test-user-set-indexes.js
 */

require('dotenv').config({ path: '.env.development' });

const { getRedisClient } = require('../src/services/redis/client');
const {
  createAnonymousUser,
  createUser,
  updateUser,
  updateGeolocation,
  getUserById,
} = require('../src/services/auth/user-storage');
const { hashPassword } = require('../src/services/auth/password');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Helper to check if userId is in a set
async function isInSet(setKey, userId) {
  const redis = getRedisClient();
  const members = await redis.smembers(setKey);
  return members.includes(userId);
}

// Helper to get all members of a set
async function getSetMembers(setKey) {
  const redis = getRedisClient();
  return await redis.smembers(setKey);
}

// Helper to log test results
function logTest(testName, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${icon} ${testName}${reset}${details ? ' - ' + details : ''}`);
}

async function testUserSetIndexes() {
  console.log('🧪 Testing User Set Index Updates\n');
  console.log('='.repeat(60));

  // Check Redis connectivity first
  console.log('\n[SETUP] Checking Redis connectivity...');
  try {
    const redis = getRedisClient();
    await redis.ping();
    console.log('✅ Redis is connected\n');
  } catch (error) {
    console.error('\x1b[31m❌ Redis connection failed!\x1b[0m');
    console.error('Please ensure Redis is running:');
    console.error('  - macOS: brew services start redis');
    console.error('  - Linux: sudo systemctl start redis');
    console.error('  - Docker: docker run -d -p 6379:6379 redis');
    console.error('\nError:', error.message);
    process.exit(1);
  }

  const redis = getRedisClient();
  let allTestsPassed = true;

  // Test 1: Create anonymous user and verify in non_registered:users
  console.log('\n[TEST 1] Create anonymous user → verify in non_registered:users');
  try {
    const deviceId1 = `test-device-${Date.now()}-1`;
    const user1 = await createAnonymousUser(deviceId1, 'iPhone 14', 'iOS 17.0');
    
    const inNonRegistered = await isInSet('non_registered:users', user1.id);
    logTest('Anonymous user in non_registered:users', inNonRegistered);
    if (!inNonRegistered) allTestsPassed = false;

    console.log(`  User ID: ${user1.id}, Status: ${user1.userStatus}`);
  } catch (error) {
    logTest('Create anonymous user', false, error.message);
    allTestsPassed = false;
  }

  // Test 2: Register user → verify removed from non_registered:users
  console.log('\n[TEST 2] Register user → verify removed from non_registered:users');
  try {
    const deviceId2 = `test-device-${Date.now()}-2`;
    const user2 = await createAnonymousUser(deviceId2, 'iPhone 14', 'iOS 17.0');
    
    // Verify initially in non_registered
    const initiallyInSet = await isInSet('non_registered:users', user2.id);
    logTest('User initially in non_registered:users', initiallyInSet);
    
    // Register the user
    const passwordHash = await hashPassword('Test123!');
    await updateUser(user2.id, {
      email: `test-${Date.now()}@example.com`,
      username: `testuser${Date.now()}`,
      passwordHash,
      isRegistered: true,
    });
    
    // Verify removed from non_registered
    const stillInSet = await isInSet('non_registered:users', user2.id);
    const updatedUser = await getUserById(user2.id);
    
    logTest('User removed from non_registered:users after registration', !stillInSet);
    logTest('User status updated to registered', updatedUser.userStatus === 'registered');
    
    if (stillInSet) allTestsPassed = false;
    if (updatedUser.userStatus !== 'registered') allTestsPassed = false;
    
    console.log(`  User ID: ${user2.id}, Old Status: unregistered, New Status: ${updatedUser.userStatus}`);
  } catch (error) {
    logTest('Register user', false, error.message);
    allTestsPassed = false;
  }

  // Test 3: Update province → verify moved between sets
  console.log('\n[TEST 3] Update province → verify moved between province sets');
  try {
    const deviceId3 = `test-device-${Date.now()}-3`;
    const user3 = await createAnonymousUser(deviceId3, 'iPhone 14', 'iOS 17.0');
    
    // Set initial province
    await updateUser(user3.id, { province: 'Riyadh' });
    
    // Verify in Riyadh set
    const inRiyadh = await isInSet('province:Riyadh:users', user3.id);
    logTest('User in province:Riyadh:users', inRiyadh);
    
    // Update to new province
    await updateUser(user3.id, { province: 'Makkah' });
    
    // Verify removed from Riyadh
    const stillInRiyadh = await isInSet('province:Riyadh:users', user3.id);
    // Verify added to Makkah
    const inMakkah = await isInSet('province:Makkah:users', user3.id);
    
    logTest('User removed from province:Riyadh:users', !stillInRiyadh);
    logTest('User added to province:Makkah:users', inMakkah);
    
    if (stillInRiyadh) allTestsPassed = false;
    if (!inMakkah) allTestsPassed = false;
    
    console.log(`  User ID: ${user3.id}, Old Province: Riyadh, New Province: Makkah`);
  } catch (error) {
    logTest('Update province', false, error.message);
    allTestsPassed = false;
  }

  // Test 4: Update city → verify moved between sets
  console.log('\n[TEST 4] Update city → verify moved between city sets');
  try {
    const deviceId4 = `test-device-${Date.now()}-4`;
    const user4 = await createAnonymousUser(deviceId4, 'iPhone 14', 'iOS 17.0');
    
    // Set initial city
    await updateUser(user4.id, { city: 'Riyadh' });
    
    // Verify in Riyadh set
    const inRiyadh = await isInSet('city:Riyadh:users', user4.id);
    logTest('User in city:Riyadh:users', inRiyadh);
    
    // Update to new city
    await updateUser(user4.id, { city: 'Jeddah' });
    
    // Verify removed from Riyadh
    const stillInRiyadh = await isInSet('city:Riyadh:users', user4.id);
    // Verify added to Jeddah
    const inJeddah = await isInSet('city:Jeddah:users', user4.id);
    
    logTest('User removed from city:Riyadh:users', !stillInRiyadh);
    logTest('User added to city:Jeddah:users', inJeddah);
    
    if (stillInRiyadh) allTestsPassed = false;
    if (!inJeddah) allTestsPassed = false;
    
    console.log(`  User ID: ${user4.id}, Old City: Riyadh, New City: Jeddah`);
  } catch (error) {
    logTest('Update city', false, error.message);
    allTestsPassed = false;
  }

  // Test 5: Clear location → verify removed from sets
  console.log('\n[TEST 5] Clear location → verify removed from province/city sets');
  try {
    const deviceId5 = `test-device-${Date.now()}-5`;
    const user5 = await createAnonymousUser(deviceId5, 'iPhone 14', 'iOS 17.0');
    
    // Set initial location
    await updateUser(user5.id, { province: 'Riyadh', city: 'Riyadh' });
    
    // Verify in sets
    const inProvince = await isInSet('province:Riyadh:users', user5.id);
    const inCity = await isInSet('city:Riyadh:users', user5.id);
    logTest('User initially in province and city sets', inProvince && inCity);
    
    // Clear location (revoke consent)
    await updateGeolocation(user5.id, null, false);
    
    // Verify removed from sets
    const stillInProvince = await isInSet('province:Riyadh:users', user5.id);
    const stillInCity = await isInSet('city:Riyadh:users', user5.id);
    const updatedUser5 = await getUserById(user5.id);
    
    logTest('User removed from province:Riyadh:users after clearing', !stillInProvince);
    logTest('User removed from city:Riyadh:users after clearing', !stillInCity);
    logTest('User province cleared', !updatedUser5.province);
    logTest('User city cleared', !updatedUser5.city);
    
    if (stillInProvince || stillInCity) allTestsPassed = false;
    if (updatedUser5.province || updatedUser5.city) allTestsPassed = false;
    
    console.log(`  User ID: ${user5.id}, Province: ${updatedUser5.province}, City: ${updatedUser5.city}`);
  } catch (error) {
    logTest('Clear location', false, error.message);
    allTestsPassed = false;
  }

  // Test 6: Update via geolocation endpoint → verify sets updated
  console.log('\n[TEST 6] Update via geolocation → verify province/city sets updated');
  try {
    const deviceId6 = `test-device-${Date.now()}-6`;
    const user6 = await createAnonymousUser(deviceId6, 'iPhone 14', 'iOS 17.0');
    
    // Set initial location via geolocation
    await updateGeolocation(user6.id, {
      lat: 24.7136,
      lng: 46.6753,
      province: 'Riyadh',
      city: 'Riyadh',
    }, true);
    
    // Verify in sets
    const inProvince = await isInSet('province:Riyadh:users', user6.id);
    const inCity = await isInSet('city:Riyadh:users', user6.id);
    logTest('User in province and city sets after geolocation update', inProvince && inCity);
    
    // Update to new location
    await updateGeolocation(user6.id, {
      lat: 21.4858,
      lng: 39.1925,
      province: 'Makkah',
      city: 'Jeddah',
    }, true);
    
    // Verify moved
    const stillInRiyadhProvince = await isInSet('province:Riyadh:users', user6.id);
    const stillInRiyadhCity = await isInSet('city:Riyadh:users', user6.id);
    const inMakkahProvince = await isInSet('province:Makkah:users', user6.id);
    const inJeddahCity = await isInSet('city:Jeddah:users', user6.id);
    
    logTest('User removed from province:Riyadh:users', !stillInRiyadhProvince);
    logTest('User removed from city:Riyadh:users', !stillInRiyadhCity);
    logTest('User added to province:Makkah:users', inMakkahProvince);
    logTest('User added to city:Jeddah:users', inJeddahCity);
    
    if (stillInRiyadhProvince || stillInRiyadhCity) allTestsPassed = false;
    if (!inMakkahProvince || !inJeddahCity) allTestsPassed = false;
    
    console.log(`  User ID: ${user6.id}, Province: Riyadh → Makkah, City: Riyadh → Jeddah`);
  } catch (error) {
    logTest('Update via geolocation', false, error.message);
    allTestsPassed = false;
  }

  // Test 7: User status auto-transition → verify non_registered updated
  console.log('\n[TEST 7] User status auto-transition → verify non_registered set updated');
  try {
    const deviceId7 = `test-device-${Date.now()}-7`;
    const user7 = await createAnonymousUser(deviceId7, 'iPhone 14', 'iOS 17.0');
    
    // Verify initially in non_registered
    const initiallyInSet = await isInSet('non_registered:users', user7.id);
    logTest('User initially in non_registered:users', initiallyInSet);
    
    // Trigger auto-transition by adding email/password (not explicitly setting userStatus)
    const passwordHash = await hashPassword('Test123!');
    await updateUser(user7.id, {
      email: `test-auto-${Date.now()}@example.com`,
      passwordHash,
    });
    
    // Verify status auto-transitioned and removed from set
    const updatedUser7 = await getUserById(user7.id);
    const stillInSet = await isInSet('non_registered:users', user7.id);
    
    logTest('User status auto-transitioned to registered', updatedUser7.userStatus === 'registered');
    logTest('User removed from non_registered:users after auto-transition', !stillInSet);
    
    if (updatedUser7.userStatus !== 'registered') allTestsPassed = false;
    if (stillInSet) allTestsPassed = false;
    
    console.log(`  User ID: ${user7.id}, Status: unregistered → ${updatedUser7.userStatus}`);
  } catch (error) {
    logTest('Auto-transition test', false, error.message);
    allTestsPassed = false;
  }

  // Test 8: Multiple updates in sequence → verify sets stay consistent
  console.log('\n[TEST 8] Multiple updates in sequence → verify sets stay consistent');
  try {
    const deviceId8 = `test-device-${Date.now()}-8`;
    const user8 = await createAnonymousUser(deviceId8, 'iPhone 14', 'iOS 17.0');
    
    // Step 1: Set province
    await updateUser(user8.id, { province: 'Riyadh' });
    const inRiyadh1 = await isInSet('province:Riyadh:users', user8.id);
    
    // Step 2: Set city
    await updateUser(user8.id, { city: 'Riyadh' });
    const inRiyadhProvince2 = await isInSet('province:Riyadh:users', user8.id);
    const inRiyadhCity2 = await isInSet('city:Riyadh:users', user8.id);
    
    // Step 3: Change province
    await updateUser(user8.id, { province: 'Makkah' });
    const stillInRiyadhProvince = await isInSet('province:Riyadh:users', user8.id);
    const inMakkahProvince = await isInSet('province:Makkah:users', user8.id);
    const stillInRiyadhCity = await isInSet('city:Riyadh:users', user8.id);
    
    // Step 4: Change city
    await updateUser(user8.id, { city: 'Jeddah' });
    const stillInRiyadhCity2 = await isInSet('city:Riyadh:users', user8.id);
    const inJeddahCity = await isInSet('city:Jeddah:users', user8.id);
    const stillInMakkahProvince = await isInSet('province:Makkah:users', user8.id);
    
    logTest('Step 1: User in province:Riyadh:users', inRiyadh1);
    logTest('Step 2: User in both province and city sets', inRiyadhProvince2 && inRiyadhCity2);
    logTest('Step 3: User moved from province:Riyadh to province:Makkah', !stillInRiyadhProvince && inMakkahProvince);
    logTest('Step 3: User still in city:Riyadh:users', stillInRiyadhCity);
    logTest('Step 4: User moved from city:Riyadh to city:Jeddah', !stillInRiyadhCity2 && inJeddahCity);
    logTest('Step 4: User still in province:Makkah:users', stillInMakkahProvince);
    
    if (!inRiyadh1 || !inRiyadhProvince2 || !inRiyadhCity2) allTestsPassed = false;
    if (stillInRiyadhProvince || !inMakkahProvince) allTestsPassed = false;
    if (!stillInRiyadhCity || stillInRiyadhCity2 || !inJeddahCity) allTestsPassed = false;
    if (!stillInMakkahProvince) allTestsPassed = false;
    
    console.log(`  User ID: ${user8.id}`);
    console.log(`  Final: Province: Makkah, City: Jeddah`);
  } catch (error) {
    logTest('Multiple updates test', false, error.message);
    allTestsPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('\x1b[32m✅ All tests passed! Set indexes are properly maintained.\x1b[0m\n');
  } else {
    console.log('\x1b[31m❌ Some tests failed. Please review the output above.\x1b[0m\n');
  }

  process.exit(allTestsPassed ? 0 : 1);
}

testUserSetIndexes().catch((error) => {
  console.error('\x1b[31m❌ Test script failed:\x1b[0m', error);
  process.exit(1);
});
