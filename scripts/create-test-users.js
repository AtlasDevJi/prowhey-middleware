#!/usr/bin/env node

/**
 * Create Test Users Script
 * Creates 5 test users in Redis for testing authentication
 */

require('dotenv').config({ path: '.env.development' });

const { createUser } = require('../src/services/auth/user-storage');
const { hashPassword } = require('../src/services/auth/password');
const { v4: uuidv4 } = require('uuid');

const testUsers = [
  {
    username: 'testuser1',
    email: 'testuser1@example.com',
    password: 'Test123!',
    phone: '+12345678901',
  },
  {
    username: 'testuser2',
    email: 'testuser2@example.com',
    password: 'Test123!',
    phone: '+12345678902',
  },
  {
    username: 'testuser3',
    email: 'testuser3@example.com',
    password: 'Test123!',
    phone: '+12345678903',
  },
  {
    username: 'testuser4',
    email: 'testuser4@example.com',
    password: 'Test123!',
    phone: '+12345678904',
  },
  {
    username: 'testuser5',
    email: 'testuser5@example.com',
    password: 'Test123!',
    phone: '+12345678905',
  },
];

async function createTestUsers() {
  console.log('Creating test users...\n');

  const createdUsers = [];
  const errors = [];

  for (const userData of testUsers) {
    try {
      // Hash password
      const passwordHash = await hashPassword(userData.password);

      // Create user (auto-verified for testing)
      const user = await createUser({
        username: userData.username,
        email: userData.email,
        passwordHash,
        phone: userData.phone,
        googleId: null,
        isVerified: true, // Auto-verify for testing
        verificationMethod: null,
        deviceId: uuidv4(),
      });

      createdUsers.push({
        username: userData.username,
        email: userData.email,
        password: userData.password,
        userId: user.id,
        isVerified: user.isVerified,
      });

      console.log(`✓ Created user: ${userData.username} (${userData.email})`);
    } catch (error) {
      errors.push({
        username: userData.username,
        error: error.message,
      });
      console.error(`✗ Failed to create user ${userData.username}: ${error.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${createdUsers.length} users`);
  console.log(`Errors: ${errors.length}`);

  if (createdUsers.length > 0) {
    console.log('\n=== User Credentials ===');
    console.log('Username | Email | Password');
    console.log('---------|-------|----------');
    createdUsers.forEach((user) => {
      console.log(`${user.username} | ${user.email} | ${user.password}`);
    });

    console.log('\n=== Login Credentials (Copy these) ===');
    createdUsers.forEach((user, index) => {
      console.log(`\nUser ${index + 1}:`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Password: ${user.password}`);
    });
  }

  if (errors.length > 0) {
    console.log('\n=== Errors ===');
    errors.forEach((err) => {
      console.log(`${err.username}: ${err.error}`);
    });
  }

  // Close Redis connection
  const { getRedisClient } = require('../src/services/redis/client');
  const redis = getRedisClient();
  if (redis && typeof redis.quit === 'function') {
    await redis.quit();
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

// Run script
createTestUsers().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

