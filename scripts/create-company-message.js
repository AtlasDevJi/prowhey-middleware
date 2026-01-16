#!/usr/bin/env node

/**
 * Helper script to create company messages
 * Usage: node create-company-message.js <userId> <text> [actionButtons JSON]
 */

const path = require('path');
const { createMessage } = require('../src/services/messaging/message-storage');

async function main() {
  const userId = process.argv[2];
  const text = process.argv[3];
  const actionButtonsJson = process.argv[4] || '[]';

  if (!userId || !text) {
    console.error('Usage: node create-company-message.js <userId> <text> [actionButtons JSON]');
    process.exit(1);
  }

  let actionButtons = [];
  try {
    actionButtons = JSON.parse(actionButtonsJson);
  } catch (error) {
    // If parsing fails, use empty array
    actionButtons = [];
  }

  try {
    const message = await createMessage(userId, 'company', text, actionButtons);
    console.log(JSON.stringify({
      success: true,
      messageId: message.messageId,
      userId: message.userId,
      sender: message.sender,
      text: message.text,
      timestamp: message.timestamp,
    }));
    
    // Close Redis connection
    const { getRedisClient } = require('../src/services/redis/client');
    const redis = getRedisClient();
    if (redis && redis.quit) {
      await redis.quit();
    }
    
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message,
    }));
    
    // Close Redis connection on error
    try {
      const { getRedisClient } = require('../src/services/redis/client');
      const redis = getRedisClient();
      if (redis && redis.quit) {
        await redis.quit();
      }
    } catch (closeError) {
      // Ignore close errors
    }
    
    process.exit(1);
  }
}

main();
