const { getRedisClient } = require('../redis/client');
const { logger } = require('../logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Increment product views count
 * Uses atomic Redis INCR for thread-safe increment
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 * Enhanced to support optional user tracking and metadata
 */
async function incrementProductViews(name, userId = null, metadata = {}) {
  try {
    const redis = getRedisClient();
    const key = `views:${name}`;
    
    // Atomic increment - returns new count
    const newCount = await redis.incr(key);
    
    // Track per-user views if userId provided
    if (userId) {
      const userViewKey = `views:user:${userId}:${name}`;
      const timestamp = new Date().toISOString();
      const viewData = {
        timestamp,
        duration: metadata.duration || null,
        source: metadata.source || null,
      };
      
      // Get existing user views
      const userViewsData = await redis.get(userViewKey);
      let userViews = [];
      
      if (userViewsData) {
        try {
          userViews = JSON.parse(userViewsData);
          if (!Array.isArray(userViews)) {
            userViews = [];
          }
        } catch (parseError) {
          logger.warn('Failed to parse user views, starting fresh', {
            userId,
            name,
            error: parseError.message,
          });
          userViews = [];
        }
      }
      
      // Add new view (prepend for newest first)
      userViews.unshift(viewData);
      
      // Keep only last 100 views per user per product
      if (userViews.length > 100) {
        userViews = userViews.slice(0, 100);
      }
      
      await redis.set(userViewKey, JSON.stringify(userViews));
    }
    
    // Add to view_changes stream when threshold met (every 10 views)
    const VIEW_STREAM_THRESHOLD = 10;
    if (newCount % VIEW_STREAM_THRESHOLD === 0) {
      const { addStreamEntry } = require('../sync/stream-manager');
      const { computeDataHash } = require('../sync/hash-computer');
      const viewData = { views: newCount };
      const dataHash = computeDataHash(viewData);
      await addStreamEntry('view', name, dataHash, '1');
    }
    
    logger.info('Product view incremented', {
      name,
      newCount,
      userId: userId || 'anonymous',
    });
    
    return newCount;
  } catch (error) {
    logger.error('Failed to increment product views', {
      name,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get product views count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function getProductViews(name) {
  try {
    const redis = getRedisClient();
    const key = `views:${name}`;
    
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error('Failed to get product views', {
      name,
      error: error.message,
    });
    return 0;
  }
}

/**
 * Add product rating vote (1-5 stars)
 * Increments the count for the specific star rating and updates reviewCount
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function addProductRating(name, starRating) {
  try {
    if (![1, 2, 3, 4, 5].includes(starRating)) {
      throw new Error('Star rating must be between 1 and 5');
    }

    const redis = getRedisClient();
    const key = `rating:${name}`;
    
    // Get current rating data
    const data = await redis.get(key);
    let ratingData = {
      ratingBreakdown: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
      reviewCount: 0,
    };

    if (data) {
      try {
        ratingData = JSON.parse(data);
        // Ensure ratingBreakdown exists and has all keys
        ratingData.ratingBreakdown = {
          '1': ratingData.ratingBreakdown?.['1'] || 0,
          '2': ratingData.ratingBreakdown?.['2'] || 0,
          '3': ratingData.ratingBreakdown?.['3'] || 0,
          '4': ratingData.ratingBreakdown?.['4'] || 0,
          '5': ratingData.ratingBreakdown?.['5'] || 0,
        };
        ratingData.reviewCount = ratingData.reviewCount || 0;
      } catch (parseError) {
        logger.warn('Failed to parse rating data, using defaults', {
          name,
          error: parseError.message,
        });
      }
    }

    // Increment the star rating count
    ratingData.ratingBreakdown[String(starRating)] =
      (ratingData.ratingBreakdown[String(starRating)] || 0) + 1;
    
    // Increment total review count
    ratingData.reviewCount = (ratingData.reviewCount || 0) + 1;

    // Save back to Redis
    await redis.set(key, JSON.stringify(ratingData));

    logger.info('Product rating added', {
      name,
      starRating,
      reviewCount: ratingData.reviewCount,
    });

    return {
      ratingBreakdown: ratingData.ratingBreakdown,
      reviewCount: ratingData.reviewCount,
    };
  } catch (error) {
    logger.error('Failed to add product rating', {
      name,
      starRating,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get product ratings breakdown and review count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function getProductRatings(name) {
  try {
    const redis = getRedisClient();
    const key = `rating:${name}`;
    
    const data = await redis.get(key);
    if (!data) {
      return {
        ratingBreakdown: {
          '1': 0,
          '2': 0,
          '3': 0,
          '4': 0,
          '5': 0,
        },
        reviewCount: 0,
      };
    }

    const parsed = JSON.parse(data);
    return {
      ratingBreakdown: {
        '1': parsed.ratingBreakdown?.['1'] || 0,
        '2': parsed.ratingBreakdown?.['2'] || 0,
        '3': parsed.ratingBreakdown?.['3'] || 0,
        '4': parsed.ratingBreakdown?.['4'] || 0,
        '5': parsed.ratingBreakdown?.['5'] || 0,
      },
      reviewCount: parsed.reviewCount || 0,
    };
  } catch (error) {
    logger.error('Failed to get product ratings', {
      name,
      error: error.message,
    });
    return {
      ratingBreakdown: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
      reviewCount: 0,
    };
  }
}

/**
 * Add product comment
 * Adds comment object to array and returns updated array
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function addProductComment(name, comment) {
  try {
    if (!comment || !comment.text) {
      throw new Error('Comment must have text field');
    }

    const redis = getRedisClient();
    const key = `comments:${name}`;
    
    // Get current comments
    const data = await redis.get(key);
    let comments = [];

    if (data) {
      try {
        comments = JSON.parse(data);
        if (!Array.isArray(comments)) {
          comments = [];
        }
      } catch (parseError) {
        logger.warn('Failed to parse comments, starting fresh', {
          name,
          error: parseError.message,
        });
        comments = [];
      }
    }

    // Create comment object with required fields
    const newComment = {
      id: comment.id || uuidv4(),
      text: comment.text,
      author: comment.author || 'anonymous',
      timestamp: comment.timestamp || new Date().toISOString(),
      ...comment, // Allow additional fields
    };

    // Add comment to array (prepend for newest first)
    comments.unshift(newComment);

    // Save back to Redis
    await redis.set(key, JSON.stringify(comments));

    logger.info('Product comment added', {
      name,
      commentId: newComment.id,
    });

    return comments;
  } catch (error) {
    logger.error('Failed to add product comment', {
      name,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get product comments array
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function getProductComments(name) {
  try {
    const redis = getRedisClient();
    const key = `comments:${name}`;
    
    const data = await redis.get(key);
    if (!data) {
      return [];
    }

    try {
      const comments = JSON.parse(data);
      return Array.isArray(comments) ? comments : [];
    } catch (error) {
      logger.warn('Failed to parse comments', {
        name,
        error: error.message,
      });
      return [];
    }
  } catch (error) {
    logger.error('Failed to get product comments', {
      name,
      error: error.message,
    });
    return [];
  }
}

/**
 * Fetch all analytics data for a product
 * Returns views, ratings, and comments in one call
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function fetchProductAnalytics(name) {
  try {
    const [views, ratings, comments] = await Promise.all([
      getProductViews(name),
      getProductRatings(name),
      getProductComments(name),
    ]);

    return {
      views,
      ratingBreakdown: ratings.ratingBreakdown,
      reviewCount: ratings.reviewCount,
      comments,
    };
  } catch (error) {
    logger.error('Failed to fetch product analytics', {
      name,
      error: error.message,
    });
    return {
      views: 0,
      ratingBreakdown: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
      reviewCount: 0,
      comments: [],
    };
  }
}

/**
 * Track search event
 * Stores detailed search information for analytics
 */
async function trackSearch(term, filters = {}, resultsCount = 0, clickedResults = [], userId = null, deviceId = null, sessionId = null) {
  try {
    const redis = getRedisClient();
    const timestamp = new Date().toISOString();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Normalize search term (lowercase, trim)
    const normalizedTerm = term.toLowerCase().trim();
    
    // Create search event
    const searchEvent = {
      term: normalizedTerm,
      originalTerm: term,
      filters,
      results_count: resultsCount,
      clicked_results: clickedResults,
      timestamp,
      userId: userId || null,
      deviceId: deviceId || null,
      sessionId: sessionId || null,
    };
    
    // Store detailed event log (30-day TTL)
    const eventKey = `events:search:${date}:${Date.now()}`;
    await redis.setex(eventKey, 30 * 24 * 60 * 60, JSON.stringify(searchEvent));
    
    // Update aggregated search term count
    const searchTermKey = `search:term:${normalizedTerm}`;
    const searchTermData = await redis.get(searchTermKey);
    let searchTermInfo = {
      count: 0,
      last_searched: timestamp,
    };
    
    if (searchTermData) {
      try {
        searchTermInfo = JSON.parse(searchTermData);
      } catch (parseError) {
        logger.warn('Failed to parse search term data', {
          term: normalizedTerm,
          error: parseError.message,
        });
      }
    }
    
    searchTermInfo.count = (searchTermInfo.count || 0) + 1;
    searchTermInfo.last_searched = timestamp;
    
    await redis.set(searchTermKey, JSON.stringify(searchTermInfo));
    
    // Track per-user search history (if userId provided)
    if (userId) {
      const userSearchKey = `search:user:${userId}`;
      const userSearchData = await redis.get(userSearchKey);
      let userSearches = [];
      
      if (userSearchData) {
        try {
          userSearches = JSON.parse(userSearchData);
          if (!Array.isArray(userSearches)) {
            userSearches = [];
          }
        } catch (parseError) {
          logger.warn('Failed to parse user search history', {
            userId,
            error: parseError.message,
          });
          userSearches = [];
        }
      }
      
      // Add search to history (prepend for newest first)
      userSearches.unshift({
        term: normalizedTerm,
        originalTerm: term,
        timestamp,
      });
      
      // Keep only last 50 searches per user
      if (userSearches.length > 50) {
        userSearches = userSearches.slice(0, 50);
      }
      
      await redis.set(userSearchKey, JSON.stringify(userSearches));
    }
    
    logger.info('Search tracked', {
      term: normalizedTerm,
      resultsCount,
      userId: userId || 'anonymous',
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to track search', {
      term,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Add product to user wishlist
 */
async function addToWishlist(userId, productName) {
  try {
    if (!userId) {
      throw new Error('User ID required for wishlist operations');
    }
    
    const redis = getRedisClient();
    const wishlistKey = `wishlist:user:${userId}`;
    
    // Get current wishlist
    const wishlistData = await redis.get(wishlistKey);
    let wishlist = [];
    
    if (wishlistData) {
      try {
        wishlist = JSON.parse(wishlistData);
        if (!Array.isArray(wishlist)) {
          wishlist = [];
        }
      } catch (parseError) {
        logger.warn('Failed to parse wishlist', {
          userId,
          error: parseError.message,
        });
        wishlist = [];
      }
    }
    
    // Add product if not already in wishlist
    if (!wishlist.includes(productName)) {
      wishlist.push(productName);
      await redis.set(wishlistKey, JSON.stringify(wishlist));
      
      // Update aggregated product wishlist count
      const productWishlistKey = `wishlist:product:${productName}`;
      await redis.incr(productWishlistKey);
      
      logger.info('Product added to wishlist', {
        userId,
        productName,
      });
    }
    
    return wishlist;
  } catch (error) {
    logger.error('Failed to add to wishlist', {
      userId,
      productName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Remove product from user wishlist
 */
async function removeFromWishlist(userId, productName) {
  try {
    if (!userId) {
      throw new Error('User ID required for wishlist operations');
    }
    
    const redis = getRedisClient();
    const wishlistKey = `wishlist:user:${userId}`;
    
    // Get current wishlist
    const wishlistData = await redis.get(wishlistKey);
    let wishlist = [];
    
    if (wishlistData) {
      try {
        wishlist = JSON.parse(wishlistData);
        if (!Array.isArray(wishlist)) {
          wishlist = [];
        }
      } catch (parseError) {
        logger.warn('Failed to parse wishlist', {
          userId,
          error: parseError.message,
        });
        wishlist = [];
      }
    }
    
    // Remove product if in wishlist
    const index = wishlist.indexOf(productName);
    if (index !== -1) {
      wishlist.splice(index, 1);
      await redis.set(wishlistKey, JSON.stringify(wishlist));
      
      // Update aggregated product wishlist count
      const productWishlistKey = `wishlist:product:${productName}`;
      const currentCount = await redis.get(productWishlistKey);
      if (currentCount && parseInt(currentCount, 10) > 0) {
        await redis.decr(productWishlistKey);
      }
      
      logger.info('Product removed from wishlist', {
        userId,
        productName,
      });
    }
    
    return wishlist;
  } catch (error) {
    logger.error('Failed to remove from wishlist', {
      userId,
      productName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get user wishlist
 */
async function getUserWishlist(userId) {
  try {
    if (!userId) {
      throw new Error('User ID required');
    }
    
    const redis = getRedisClient();
    const wishlistKey = `wishlist:user:${userId}`;
    
    const wishlistData = await redis.get(wishlistKey);
    if (!wishlistData) {
      return [];
    }
    
    try {
      const wishlist = JSON.parse(wishlistData);
      return Array.isArray(wishlist) ? wishlist : [];
    } catch (error) {
      logger.warn('Failed to parse wishlist', {
        userId,
        error: error.message,
      });
      return [];
    }
  } catch (error) {
    logger.error('Failed to get user wishlist', {
      userId,
      error: error.message,
    });
    return [];
  }
}

/**
 * Get product wishlist count (analytics-only, not exposed to app users)
 */
async function getProductWishlistCount(productName) {
  try {
    const redis = getRedisClient();
    const productWishlistKey = `wishlist:product:${productName}`;
    
    const count = await redis.get(productWishlistKey);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error('Failed to get product wishlist count', {
      productName,
      error: error.message,
    });
    return 0;
  }
}

/**
 * Track app session event (open, close, heartbeat)
 */
async function trackAppSession(event, userId = null, sessionId = null, metadata = {}) {
  try {
    const redis = getRedisClient();
    const timestamp = new Date().toISOString();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!sessionId) {
      sessionId = uuidv4();
    }
    
    if (event === 'app_open') {
      // Create active session
      const activeSessionKey = `session:active:${userId || 'anonymous'}:${sessionId}`;
      const heartbeatInterval = metadata.heartbeatInterval || 30000; // Default 30 seconds
      const sessionData = {
        sessionId,
        userId: userId || null,
        startTime: timestamp,
        lastSeen: timestamp,
        metadata,
      };
      
      // Set TTL to heartbeat interval * 2 (safety margin)
      await redis.setex(activeSessionKey, (heartbeatInterval * 2) / 1000, JSON.stringify(sessionData));
      
      // Create session log entry
      const sessionLogKey = `events:session:${date}:${sessionId}`;
      const sessionLog = {
        sessionId,
        userId: userId || null,
        startTime: timestamp,
        events: [{
          type: 'app_open',
          timestamp,
        }],
      };
      
      await redis.setex(sessionLogKey, 30 * 24 * 60 * 60, JSON.stringify(sessionLog));
      
      logger.info('App session opened', {
        sessionId,
        userId: userId || 'anonymous',
      });
      
      return { sessionId, startTime: timestamp };
    } else if (event === 'app_close') {
      // End session
      const activeSessionKey = `session:active:${userId || 'anonymous'}:${sessionId}`;
      const activeSessionData = await redis.get(activeSessionKey);
      
      if (activeSessionData) {
        try {
          const sessionData = JSON.parse(activeSessionData);
          const startTime = new Date(sessionData.startTime);
          const endTime = new Date(timestamp);
          const duration = endTime - startTime; // milliseconds
          
          // Update session log
          const sessionLogKey = `events:session:${date}:${sessionId}`;
          const sessionLogData = await redis.get(sessionLogKey);
          
          if (sessionLogData) {
            try {
              const sessionLog = JSON.parse(sessionLogData);
              sessionLog.endTime = timestamp;
              sessionLog.duration = duration;
              sessionLog.events.push({
                type: 'app_close',
                timestamp,
              });
              
              await redis.setex(sessionLogKey, 30 * 24 * 60 * 60, JSON.stringify(sessionLog));
            } catch (parseError) {
              logger.warn('Failed to update session log on close', {
                sessionId,
                error: parseError.message,
              });
            }
          }
          
          // Update daily session summary
          if (userId) {
            const dailySessionKey = `session:user:${userId}:${date}`;
            const dailySessionData = await redis.get(dailySessionKey);
            let dailySession = {
              totalDuration: 0,
              sessionCount: 0,
            };
            
            if (dailySessionData) {
              try {
                dailySession = JSON.parse(dailySessionData);
              } catch (parseError) {
                logger.warn('Failed to parse daily session data', {
                  userId,
                  date,
                  error: parseError.message,
                });
              }
            }
            
            dailySession.totalDuration = (dailySession.totalDuration || 0) + duration;
            dailySession.sessionCount = (dailySession.sessionCount || 0) + 1;
            
            await redis.set(dailySessionKey, JSON.stringify(dailySession));
          }
          
          // Delete active session
          await redis.del(activeSessionKey);
          
          logger.info('App session closed', {
            sessionId,
            userId: userId || 'anonymous',
            duration,
          });
        } catch (parseError) {
          logger.warn('Failed to parse active session data', {
            sessionId,
            error: parseError.message,
          });
        }
      }
      
      return { sessionId, endTime: timestamp };
    } else if (event === 'heartbeat') {
      // Update active session last_seen
      const activeSessionKey = `session:active:${userId || 'anonymous'}:${sessionId}`;
      const activeSessionData = await redis.get(activeSessionKey);
      
      if (activeSessionData) {
        try {
          const sessionData = JSON.parse(activeSessionData);
          sessionData.lastSeen = timestamp;
          
          const heartbeatInterval = metadata.heartbeatInterval || 30000; // Default 30 seconds
          await redis.setex(activeSessionKey, (heartbeatInterval * 2) / 1000, JSON.stringify(sessionData));
          
          // Update session log
          const sessionLogKey = `events:session:${date}:${sessionId}`;
          const sessionLogData = await redis.get(sessionLogKey);
          
          if (sessionLogData) {
            try {
              const sessionLog = JSON.parse(sessionLogData);
              sessionLog.events.push({
                type: 'heartbeat',
                timestamp,
              });
              
              await redis.setex(sessionLogKey, 30 * 24 * 60 * 60, JSON.stringify(sessionLog));
            } catch (parseError) {
              logger.warn('Failed to update session log on heartbeat', {
                sessionId,
                error: parseError.message,
              });
            }
          }
        } catch (parseError) {
          logger.warn('Failed to update session on heartbeat', {
            sessionId,
            error: parseError.message,
          });
        }
      } else {
        // Session not found, might have expired - create new one
        logger.warn('Heartbeat for non-existent session, creating new session', {
          sessionId,
          userId: userId || 'anonymous',
        });
        return await trackAppSession('app_open', userId, sessionId, metadata);
      }
      
      return { sessionId, lastSeen: timestamp };
    } else {
      throw new Error(`Invalid session event: ${event}. Must be 'app_open', 'app_close', or 'heartbeat'`);
    }
  } catch (error) {
    logger.error('Failed to track app session', {
      event,
      sessionId,
      userId: userId || 'anonymous',
      error: error.message,
    });
    throw error;
  }
}

/**
 * Track product interaction (image view, variant select, share)
 */
async function trackProductInteraction(type, productName, metadata = {}, userId = null) {
  try {
    if (!['image_view', 'variant_select', 'share'].includes(type)) {
      throw new Error(`Invalid interaction type: ${type}. Must be 'image_view', 'variant_select', or 'share'`);
    }
    
    const redis = getRedisClient();
    const timestamp = new Date().toISOString();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Create interaction event
    const interactionEvent = {
      type,
      product_name: productName,
      metadata,
      timestamp,
      userId: userId || null,
    };
    
    // Store detailed event log (30-day TTL)
    const eventKey = `events:interaction:${date}:${Date.now()}`;
    await redis.setex(eventKey, 30 * 24 * 60 * 60, JSON.stringify(interactionEvent));
    
    // Update aggregated interaction count
    const interactionKey = `interaction:${type}:${productName}`;
    await redis.incr(interactionKey);
    
    // Track per-user interactions (if userId provided)
    if (userId) {
      const userInteractionKey = `interaction:user:${userId}:${productName}`;
      const userInteractionData = await redis.get(userInteractionKey);
      let userInteractions = [];
      
      if (userInteractionData) {
        try {
          userInteractions = JSON.parse(userInteractionData);
          if (!Array.isArray(userInteractions)) {
            userInteractions = [];
          }
        } catch (parseError) {
          logger.warn('Failed to parse user interactions', {
            userId,
            productName,
            error: parseError.message,
          });
          userInteractions = [];
        }
      }
      
      // Add interaction (prepend for newest first)
      userInteractions.unshift({
        type,
        metadata,
        timestamp,
      });
      
      // Keep only last 100 interactions per user per product
      if (userInteractions.length > 100) {
        userInteractions = userInteractions.slice(0, 100);
      }
      
      await redis.set(userInteractionKey, JSON.stringify(userInteractions));
    }
    
    logger.info('Product interaction tracked', {
      type,
      productName,
      userId: userId || 'anonymous',
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to track product interaction', {
      type,
      productName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Process batch analytics events
 */
async function processBatchEvents(events, userId = null, deviceId = null, sessionId = null) {
  try {
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('Events array is required and must not be empty');
    }
    
    const results = {
      processed: 0,
      failed: 0,
      errors: [],
    };
    
    for (const event of events) {
      try {
        switch (event.type) {
          case 'view':
            await incrementProductViews(
              event.entity_id || event.product_name,
              userId,
              event.metadata || {}
            );
            results.processed++;
            break;
            
          case 'search':
            await trackSearch(
              event.term,
              event.filters || {},
              event.results_count || 0,
              event.clicked_results || [],
              userId,
              deviceId,
              sessionId
            );
            results.processed++;
            break;
            
          case 'wishlist_add':
            if (!userId) {
              throw new Error('User ID required for wishlist operations');
            }
            await addToWishlist(userId, event.product_name);
            results.processed++;
            break;
            
          case 'wishlist_remove':
            if (!userId) {
              throw new Error('User ID required for wishlist operations');
            }
            await removeFromWishlist(userId, event.product_name);
            results.processed++;
            break;
            
          case 'interaction':
            await trackProductInteraction(
              event.interaction_type,
              event.product_name,
              event.metadata || {},
              userId
            );
            results.processed++;
            break;
            
          case 'session_open':
            await trackAppSession('app_open', userId, sessionId || event.session_id, event.metadata || {});
            results.processed++;
            break;
            
          case 'session_close':
            await trackAppSession('app_close', userId, sessionId || event.session_id, event.metadata || {});
            results.processed++;
            break;
            
          case 'session_heartbeat':
            await trackAppSession('heartbeat', userId, sessionId || event.session_id, event.metadata || {});
            results.processed++;
            break;
            
          default:
            throw new Error(`Unknown event type: ${event.type}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          event,
          error: error.message,
        });
        logger.error('Failed to process batch event', {
          eventType: event.type,
          error: error.message,
        });
      }
    }
    
    logger.info('Batch events processed', {
      total: events.length,
      processed: results.processed,
      failed: results.failed,
    });
    
    return results;
  } catch (error) {
    logger.error('Failed to process batch events', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  incrementProductViews,
  getProductViews,
  addProductRating,
  getProductRatings,
  addProductComment,
  getProductComments,
  fetchProductAnalytics,
  trackSearch,
  addToWishlist,
  removeFromWishlist,
  getUserWishlist,
  getProductWishlistCount,
  trackAppSession,
  trackProductInteraction,
  processBatchEvents,
};

