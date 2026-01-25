#!/usr/bin/env node

/**
 * Cleanup All User Index Sets
 *
 * Removes stale userId entries from all user index sets:
 * - non_registered:users - removes users with userStatus !== 'unregistered'
 * - province:*:users - removes users whose current province doesn't match
 * - city:*:users - removes users whose current city doesn't match
 *
 * A user should appear only in sets that match their current data.
 * Run this once to fix existing duplicate entries (e.g. after status transitions
 * or location updates) before the index fix was applied.
 *
 * Usage: node scripts/cleanup-all-user-indexes.js
 */

require('dotenv').config({ path: '.env.development' });

const { getRedisClient } = require('../src/services/redis/client');
const { getUserById } = require('../src/services/auth/user-storage');

async function cleanupAllUserIndexes() {
  const redis = getRedisClient();
  let removedNonRegistered = 0;
  let removedProvince = 0;
  let removedCity = 0;

  const scanKeys = async (pattern) => {
    const keys = [];
    let cursor = '0';
    do {
      const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');
    return keys;
  };

  console.log('Starting cleanup of all user index sets...\n');

  // 1. Clean up non_registered:users set
  console.log('1. Cleaning non_registered:users set...');
  const nonRegisteredUserIds = await redis.smembers('non_registered:users');
  if (nonRegisteredUserIds && nonRegisteredUserIds.length > 0) {
    for (const userId of nonRegisteredUserIds) {
      const user = await getUserById(userId);
      if (!user) {
        await redis.srem('non_registered:users', userId);
        removedNonRegistered++;
        console.log(`  Removed ${userId} from non_registered:users (user not found)`);
        continue;
      }
      const currentStatus = user.userStatus || 'unregistered';
      if (currentStatus !== 'unregistered') {
        await redis.srem('non_registered:users', userId);
        removedNonRegistered++;
        console.log(`  Removed ${userId} from non_registered:users (userStatus is "${currentStatus}")`);
      }
    }
  }
  console.log(`   Done. Removed ${removedNonRegistered} stale entries.\n`);

  // 2. Clean up province:*:users sets
  console.log('2. Cleaning province:*:users sets...');
  const provinceKeys = await scanKeys('province:*:users');
  console.log(`   Found ${provinceKeys.length} province sets.`);
  for (const key of provinceKeys) {
    const match = key.match(/^province:(.+):users$/);
    if (!match) continue;
    const province = match[1];
    const userIds = await redis.smembers(key);
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (!user) {
        await redis.srem(key, userId);
        removedProvince++;
        console.log(`  Removed ${userId} from province:${province} (user not found)`);
        continue;
      }
      const current = user.province || '';
      if (current !== province) {
        await redis.srem(key, userId);
        removedProvince++;
        console.log(`  Removed ${userId} from province:${province} (user province is "${current}")`);
      }
    }
  }
  console.log(`   Done. Removed ${removedProvince} stale entries.\n`);

  // 3. Clean up city:*:users sets
  console.log('3. Cleaning city:*:users sets...');
  const cityKeys = await scanKeys('city:*:users');
  console.log(`   Found ${cityKeys.length} city sets.`);
  for (const key of cityKeys) {
    const match = key.match(/^city:(.+):users$/);
    if (!match) continue;
    const city = match[1];
    const userIds = await redis.smembers(key);
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (!user) {
        await redis.srem(key, userId);
        removedCity++;
        console.log(`  Removed ${userId} from city:${city} (user not found)`);
        continue;
      }
      const current = user.city || '';
      if (current !== city) {
        await redis.srem(key, userId);
        removedCity++;
        console.log(`  Removed ${userId} from city:${city} (user city is "${current}")`);
      }
    }
  }
  console.log(`   Done. Removed ${removedCity} stale entries.\n`);

  const total = removedNonRegistered + removedProvince + removedCity;
  console.log(`========================================`);
  console.log(`Cleanup complete!`);
  console.log(`Total removed: ${total} stale entries`);
  console.log(`  - non_registered:users: ${removedNonRegistered}`);
  console.log(`  - province:*:users: ${removedProvince}`);
  console.log(`  - city:*:users: ${removedCity}`);
  console.log(`========================================`);
  process.exit(0);
}

cleanupAllUserIndexes().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
