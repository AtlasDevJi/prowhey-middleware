#!/usr/bin/env node

/**
 * Cleanup User Location Indexes
 *
 * Removes stale userId entries from province:*:users and city:*:users sets.
 * A user should appear only in the set that matches their current province/city.
 * Run this once to fix existing duplicate entries (e.g. after location updates
 * or revoking location consent) before the index fix was applied.
 *
 * Usage: node scripts/cleanup-user-location-indexes.js
 */

require('dotenv').config({ path: '.env.development' });

const { getRedisClient } = require('../src/services/redis/client');
const { getUserById } = require('../src/services/auth/user-storage');

async function cleanupLocationIndexes() {
  const redis = getRedisClient();
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

  const provinceKeys = await scanKeys('province:*:users');
  const cityKeys = await scanKeys('city:*:users');

  console.log(`Found ${provinceKeys.length} province sets, ${cityKeys.length} city sets.\n`);

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

  console.log(`\nDone. Removed ${removedProvince} stale province entries, ${removedCity} stale city entries.`);
  process.exit(0);
}

cleanupLocationIndexes().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
