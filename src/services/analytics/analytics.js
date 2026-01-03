const { getRedisClient } = require('../redis/client');
const { logger } = require('../logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Increment product views count
 * Uses atomic Redis INCR for thread-safe increment
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 */
async function incrementProductViews(name) {
  try {
    const redis = getRedisClient();
    const key = `views:${name}`;
    
    // Atomic increment - returns new count
    const newCount = await redis.incr(key);
    
    logger.info('Product view incremented', {
      name,
      newCount,
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
          webItemName,
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

module.exports = {
  incrementProductViews,
  getProductViews,
  addProductRating,
  getProductRatings,
  addProductComment,
  getProductComments,
  fetchProductAnalytics,
};

