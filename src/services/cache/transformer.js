const { logger } = require('../logger');

/**
 * Parse custom_variant JSON string and return as-is (no transformation)
 * The structure is already in the format the app expects
 */
function parseCustomVariant(customVariantString) {
  if (!customVariantString) {
    return [];
  }

  try {
    const parsed = JSON.parse(customVariantString);
    // Return the parsed structure directly - no transformation needed
    // Assuming it's already in the correct format (sizes array with variants)
    return parsed.sizes || [];
  } catch (error) {
    logger.warn('Failed to parse custom_variant', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Parse nutrition_facts custom field JSON string
 * Expected format: Array of {label: string, value: string} objects
 * Returns object with label as key and value as value
 */
function parseNutritionFacts(nutritionFactsString) {
  if (!nutritionFactsString) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(nutritionFactsString);
    
    // If it's an array of {label, value} pairs, convert to object
    if (Array.isArray(parsed)) {
      const nutritionFacts = {};
      parsed.forEach((item) => {
        if (item.label && item.value !== undefined) {
          nutritionFacts[item.label] = item.value;
        }
      });
      return nutritionFacts;
    }
    
    // If it's already an object, return as-is
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    
    return undefined;
  } catch (error) {
    logger.warn('Failed to parse nutrition_facts', {
      error: error.message,
    });
    return undefined;
  }
}

/**
 * Parse benefits custom field
 * Expected format: Single text field (string)
 * Returns string directly (no JSON parsing needed)
 */
function parseBenefits(benefitsString) {
  if (!benefitsString) {
    return undefined;
  }

  // Benefits is a single text field, return as-is
  // If it comes as JSON string, parse it, otherwise return directly
  try {
    // Try parsing in case it's a JSON-encoded string
    const parsed = JSON.parse(benefitsString);
    // If parsed result is a string, return it
    if (typeof parsed === 'string') {
      return parsed;
    }
    // If it's something else, return as string
    return String(parsed);
  } catch (error) {
    // Not JSON, return as plain string
    return benefitsString;
  }
}

/**
 * Fetch product rating data from Redis
 * Rating breakdown stores vote counts by star (1-5), no average calculation
 * Structure: { "1": count, "2": count, "3": count, "4": count, "5": count, reviewCount: total, views: total }
 */
async function fetchProductRatingData(itemCode) {
  const { getRedisClient } = require('../redis/client');
  const redis = getRedisClient();
  const key = `rating:${itemCode}`;

  try {
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
        views: 0,
      };
    }

    const parsed = JSON.parse(data);
    
    // Ensure ratingBreakdown has all star counts (1-5)
    const ratingBreakdown = {
      '1': parsed.ratingBreakdown?.['1'] || 0,
      '2': parsed.ratingBreakdown?.['2'] || 0,
      '3': parsed.ratingBreakdown?.['3'] || 0,
      '4': parsed.ratingBreakdown?.['4'] || 0,
      '5': parsed.ratingBreakdown?.['5'] || 0,
    };

    return {
      ratingBreakdown,
      reviewCount: parsed.reviewCount || 0,
      views: parsed.views || 0,
    };
  } catch (error) {
    logger.error('Failed to fetch rating data', {
      itemCode,
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
      views: 0,
    };
  }
}

/**
 * Transform ERPNext Website Item data to app-ready Product2 format
 */
async function transformProduct(erpnextData) {
  if (!erpnextData?.data) {
    return null;
  }

  // Extract first item from query response (filter ensures single result)
  const data = Array.isArray(erpnextData.data)
    ? erpnextData.data[0]
    : erpnextData.data;

  if (!data) {
    return null;
  }

  // Fetch Redis rating data
  const redisData = await fetchProductRatingData(data.item_code);

  // Direct mappings
  const product = {
    name: data.web_item_name,
    web_item_name: data.web_item_name,
    item_code: data.item_code,
    item_name: data.item_name,
    brand: data.brand || '',
    item_group: data.item_group || '',
    category: data.item_group || '', // Same value
    description: data.description || '',
    short_description: data.short_description || '',
    web_long_description: data.web_long_description || '',
    website_image: data.website_image || undefined,
  };

  // Parse custom_variant - just parse JSON, no transformation
  product.variants = parseCustomVariant(data.custom_variant);

  // Parse custom fields (with dummy data for now)
  product.nutritionFacts = parseNutritionFacts(data.nutrition_facts);
  product.benefits = parseBenefits(data.benefits);

  // Add Redis data (no rating average - app will calculate from breakdown)
  product.reviewCount = redisData.reviewCount || 0;
  product.views = redisData.views || 0;
  product.ratingBreakdown = redisData.ratingBreakdown || {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };

  return product;
}

/**
 * Transform query results (array of products)
 * ERPNext returns {data: [...]} format (wrapped array)
 */
async function transformQueryResults(entityType, erpnextData) {
  // ERPNext query response: {data: [...]}
  if (!erpnextData?.data || !Array.isArray(erpnextData.data)) {
    return [];
  }

  // Transform each product in parallel
  const transformed = await Promise.all(
    erpnextData.data.map((item) => {
      // Wrap each item in {data: {...}} format for transformProduct
      const wrapped = { data: item };
      return transformProduct(wrapped);
    })
  );

  // Filter out null results
  return transformed.filter((item) => item !== null);
}

module.exports = {
  transformProduct,
  transformQueryResults,
  parseCustomVariant,
  parseNutritionFacts,
  parseBenefits,
  fetchProductRatingData,
};

