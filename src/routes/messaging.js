const express = require('express');
const router = express.Router();
const {
  createMessage,
  getMessage,
  getUserMessages,
  markMessageRead,
  deleteMessage,
  getUnreadCount,
} = require('../services/messaging/message-storage');
const { validateRequest } = require('../middleware/validate');
const {
  sendMessageRequestSchema,
  markMessageReadRequestSchema,
  deleteMessageRequestSchema,
} = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../utils/errors');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../services/logger');

/**
 * POST /api/messaging/send
 * Send message (user → company or company → user)
 * User messages: Requires authentication, userId from token, actionButtons NOT allowed
 * Company messages: Requires admin access (or via Redis directly), targetUserId required, actionButtons allowed
 */
router.post(
  '/send',
  authenticate,
  validateRequest(sendMessageRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { text, actionButtons, targetUserId } = req.validatedBody;
    const userId = req.userId; // From authenticated user

    // Validate: actionButtons only allowed for company messages
    // Since this is a user endpoint (requires authentication), actionButtons are NOT allowed
    if (actionButtons && actionButtons.length > 0) {
      throw new ValidationError('actionButtons are only allowed for company messages. Company messages should be created via admin/Redis access.');
    }

    // User messages: userId is from authenticated user
    // Company messages: would use targetUserId (but this endpoint is for users only)
    const sender = 'user';
    const messageUserId = userId; // User sending message to company

    try {
      const message = await createMessage(messageUserId, sender, text, []);

      return res.status(201).json({
        success: true,
        data: {
          message: {
            messageId: message.messageId,
            userId: message.userId,
            sender: message.sender,
            text: message.text,
            timestamp: message.timestamp,
          },
        },
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new Error(`Failed to send message: ${error.message}`);
    }
  })
);

/**
 * GET /api/messaging
 * Get user's messages (optional, sync preferred)
 * Returns messages for authenticated user only
 */
router.get(
  '/',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
      const messages = await getUserMessages(userId, limit, offset);
      const unreadCount = await getUnreadCount(userId);

      return res.json({
        success: true,
        data: {
          messages,
          unreadCount,
          total: messages.length,
        },
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  })
);

/**
 * PUT /api/messaging/:messageId/read
 * Mark message as read
 * User can only mark their own messages as read
 */
router.put(
  '/:messageId/read',
  authenticate,
  validateRequest(markMessageReadRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { messageId } = req.validatedParams;
    const userId = req.userId;

    try {
      // Get message to verify ownership
      const message = await getMessage(messageId);
      if (!message) {
        throw new NotFoundError('Message not found');
      }

      // Verify user owns this message
      if (message.userId !== userId) {
        throw new UnauthorizedError('You can only mark your own messages as read');
      }

      const updatedMessage = await markMessageRead(messageId);

      return res.json({
        success: true,
        data: {
          message: {
            messageId: updatedMessage.messageId,
            read: updatedMessage.read,
          },
        },
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  })
);

/**
 * DELETE /api/messaging/:messageId
 * Delete message (soft delete)
 * User can only delete their own messages
 */
router.delete(
  '/:messageId',
  authenticate,
  validateRequest(deleteMessageRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { messageId } = req.validatedParams;
    const userId = req.userId;

    try {
      // Get message to verify ownership
      const message = await getMessage(messageId);
      if (!message) {
        throw new NotFoundError('Message not found');
      }

      // Verify user owns this message
      if (message.userId !== userId) {
        throw new UnauthorizedError('You can only delete your own messages');
      }

      const success = await deleteMessage(messageId);

      if (!success) {
        throw new Error('Failed to delete message');
      }

      return res.json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  })
);

/**
 * GET /api/messaging/unread-count
 * Get count of unread messages for authenticated user
 */
router.get(
  '/unread-count',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;

    try {
      const unreadCount = await getUnreadCount(userId);

      return res.json({
        success: true,
        data: {
          unreadCount,
        },
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  })
);

module.exports = router;
