const { getRedisClient } = require('../redis/client');
const { setCacheHash, getCacheHash, getCacheHashData } = require('../redis/cache');
const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const { logger } = require('../logger');
const crypto = require('crypto');

/**
 * Generate unique message ID
 * @returns {string} Message ID in format msg_<hex>
 */
function generateMessageId() {
  return `msg_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Create a new message
 * @param {string} userId - User ID (REQUIRED - identifies sender for user messages, recipient for company messages)
 * @param {string} sender - Message sender: 'user' | 'company'
 * @param {string} text - Message text content
 * @param {Array} actionButtons - Action buttons (only for company messages, max 3)
 * @returns {Promise<object>} Created message object
 */
async function createMessage(userId, sender, text, actionButtons = []) {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    if (sender !== 'user' && sender !== 'company') {
      throw new Error('sender must be "user" or "company"');
    }

    // Validate: actionButtons only allowed for company messages
    if (sender === 'user' && actionButtons && actionButtons.length > 0) {
      throw new Error('actionButtons are only allowed for company messages');
    }

    // Validate: max 3 action buttons
    if (actionButtons && actionButtons.length > 3) {
      throw new Error('Maximum 3 action buttons allowed');
    }

    const redis = getRedisClient();
    const messageId = generateMessageId();
    const now = new Date().toISOString();

    // Create message object
    const message = {
      messageId,
      userId,
      sender,
      text,
      actionButtons: sender === 'company' ? (actionButtons || []) : undefined,
      timestamp: now,
      read: false,
      deleted: false,
    };

    // Compute hash for change detection
    const dataHash = computeDataHash(message);

    // Store in Redis hash cache
    const updatedAt = Date.now().toString();
    const version = '1';
    await setCacheHash('message', messageId, message, {
      data_hash: dataHash,
      updated_at: updatedAt,
      version,
    });

    // Add to user index (Redis Set)
    await redis.sadd(`user:${userId}:messages`, messageId);

    // Add to message_changes stream for sync mechanism
    const streamId = await addStreamEntry('message', messageId, dataHash, version);

    logger.info('Message created', {
      messageId,
      userId,
      sender,
      streamId,
    });

    return message;
  } catch (error) {
    logger.error('Message creation failed', {
      userId,
      sender,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get a single message by ID
 * @param {string} messageId - Message ID
 * @returns {Promise<object|null>} Message object or null if not found
 */
async function getMessage(messageId) {
  try {
    const cached = await getCacheHash('message', messageId);
    if (!cached) {
      return null;
    }

    const message = cached.data;
    // Don't return deleted messages
    if (message.deleted) {
      return null;
    }

    return message;
  } catch (error) {
    logger.error('Get message failed', { messageId, error: error.message });
    return null;
  }
}

/**
 * Get messages for a specific user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of messages to return (default: 50)
 * @param {number} offset - Offset for pagination (default: 0)
 * @returns {Promise<Array>} Array of message objects (newest first)
 */
async function getUserMessages(userId, limit = 50, offset = 0) {
  try {
    const redis = getRedisClient();

    // Get message IDs from user index
    const messageIds = await redis.smembers(`user:${userId}:messages`);

    if (!messageIds || messageIds.length === 0) {
      return [];
    }

    // Fetch message data from hash cache
    const messages = [];
    for (const messageId of messageIds) {
      const message = await getMessage(messageId);
      if (message) {
        messages.push(message);
      }
    }

    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const paginatedMessages = messages.slice(offset, offset + limit);

    return paginatedMessages;
  } catch (error) {
    logger.error('Get user messages failed', { userId, error: error.message });
    return [];
  }
}

/**
 * Mark message as read
 * @param {string} messageId - Message ID
 * @returns {Promise<object|null>} Updated message object or null if not found
 */
async function markMessageRead(messageId) {
  try {
    const cached = await getCacheHash('message', messageId);
    if (!cached) {
      return null;
    }

    const message = cached.data;
    if (message.deleted) {
      return null;
    }

    // If already read, no need to update
    if (message.read) {
      return message;
    }

    // Update read status
    const updatedMessage = {
      ...message,
      read: true,
    };

    // Compute new hash
    const dataHash = computeDataHash(updatedMessage);

    // Update hash cache
    const updatedAt = Date.now().toString();
    await setCacheHash('message', messageId, updatedMessage, {
      data_hash: dataHash,
      updated_at: updatedAt,
      version: cached.version,
    });

    // Note: We don't add stream entry for read status changes
    // Read status is client-side only, doesn't need to sync

    logger.info('Message marked as read', { messageId });

    return updatedMessage;
  } catch (error) {
    logger.error('Mark message read failed', { messageId, error: error.message });
    throw error;
  }
}

/**
 * Delete message (soft delete)
 * @param {string} messageId - Message ID
 * @returns {Promise<boolean>} True if successful
 */
async function deleteMessage(messageId) {
  try {
    const cached = await getCacheHash('message', messageId);
    if (!cached) {
      return false;
    }

    const message = cached.data;
    if (message.deleted) {
      return true; // Already deleted
    }

    // Soft delete: set deleted flag
    const deletedMessage = {
      ...message,
      deleted: true,
    };

    // Compute hash for deletion marker
    const deletionMarker = { deleted: true, messageId };
    const dataHash = computeDataHash(deletionMarker);

    // Update hash cache
    const updatedAt = Date.now().toString();
    await setCacheHash('message', messageId, deletedMessage, {
      data_hash: dataHash,
      updated_at: updatedAt,
      version: cached.version,
    });

    // Add to stream for sync (deletion marker)
    await addStreamEntry('message', messageId, dataHash, cached.version);

    logger.info('Message deleted', { messageId });

    return true;
  } catch (error) {
    logger.error('Delete message failed', { messageId, error: error.message });
    throw error;
  }
}

/**
 * Get count of unread messages for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of unread messages
 */
async function getUnreadCount(userId) {
  try {
    const messages = await getUserMessages(userId, 1000, 0); // Get all messages (up to 1000)
    const unreadMessages = messages.filter((msg) => !msg.read && !msg.deleted);
    return unreadMessages.length;
  } catch (error) {
    logger.error('Get unread count failed', { userId, error: error.message });
    return 0;
  }
}

module.exports = {
  createMessage,
  getMessage,
  getUserMessages,
  markMessageRead,
  deleteMessage,
  getUnreadCount,
  generateMessageId,
};
