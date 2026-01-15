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
 * Fetch product analytics data from Redis
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002) as key
 * Returns views, rating breakdown, review count, and comments
 */
async function fetchProductAnalytics(name) {
  const { fetchProductAnalytics: getAnalytics } = require('../analytics/analytics');
  
  try {
    return await getAnalytics(name);
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

  // Direct mappings - analytics will be added separately in middleware
  // Include 'name' field from ERPNext (e.g., WEB-ITM-0002) for analytics key
  const product = {
    name: data.web_item_name,
    web_item_name: data.web_item_name,
    item_code: data.item_code,
    item_name: data.item_name,
    erpnext_name: data.name, // ERPNext name field (e.g., WEB-ITM-0002) for analytics
    erpnext_name: data.name, // ERPNext name field (e.g., WEB-ITM-0002) for analytics
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

  // Fetch and attach prices for all sizes
  // Prices are fetched on-demand and cached in Redis
  const { getProductPrices } = require('../price/price');
  product.prices = await getProductPrices(data.name, product.variants);

  // Note: Analytics (views, ratings, comments) are NOT included here
  // They will be fetched separately and returned as top-level fields

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

/**
 * Transform hero images from ERPNext File data
 * Downloads images and converts to base64 data URLs
 * @param {object} erpnextData - ERPNext response with file URLs
 * @returns {Promise<object>} Transformed hero images object
 */
async function transformHeroImages(erpnextData) {
  if (!erpnextData?.data) {
    return { heroImages: [] };
  }

  const { downloadHeroImage } = require('../erpnext/client');
  const heroImages = [];

  // Process each file URL
  for (const file of erpnextData.data) {
    if (!file.file_url) {
      continue;
    }

    // Download and convert to base64
    const base64DataUrl = await downloadHeroImage(file.file_url);
    if (base64DataUrl) {
      heroImages.push(base64DataUrl);
    } else {
      logger.warn('Failed to download hero image, skipping', {
        file_url: file.file_url,
      });
    }
  }

  return { heroImages };
}

/**
 * Transform App Home data from ERPNext
 * Parses JSON strings and selects latest if multiple
 * @param {object} erpnextData - ERPNext App Home response
 * @returns {Promise<object|null>} Transformed App Home object
 */
async function transformAppHome(erpnextData) {
  if (!erpnextData?.data) {
    return null;
  }

  // If multiple objects, select latest by modified timestamp
  let data = erpnextData.data;
  if (Array.isArray(data) && data.length > 1) {
    data = data.reduce((prev, current) => {
      const prevModified = new Date(prev.modified || prev.creation || 0);
      const currentModified = new Date(current.modified || current.creation || 0);
      return currentModified > prevModified ? current : prev;
    });
  } else if (Array.isArray(data)) {
    data = data[0];
  }

  if (!data) {
    return null;
  }

  // Parse JSON string fields
  const parseJsonField = (fieldValue) => {
    if (!fieldValue) {
      return [];
    }
    try {
      return JSON.parse(fieldValue);
    } catch (error) {
      logger.warn('Failed to parse JSON field in App Home', {
        field: fieldValue,
        error: error.message,
      });
      return [];
    }
  };

  // Build transformed object
  const transformed = {
    top_sellers: parseJsonField(data.top_sellers),
    new_arrivals: parseJsonField(data.new_arrivals),
    most_viewed: parseJsonField(data.most_viewed),
    top_offers: parseJsonField(data.top_offers),
    html1: data.html1 || '',
    html2: data.html2 || '',
    html3: data.html3 || '',
    modified: data.modified || data.creation || null,
  };

  return transformed;
}

module.exports = {
  transformProduct,
  transformQueryResults,
  parseCustomVariant,
  parseNutritionFacts,
  parseBenefits,
  fetchProductAnalytics,
  transformHeroImages,
  transformAppHome,
};

