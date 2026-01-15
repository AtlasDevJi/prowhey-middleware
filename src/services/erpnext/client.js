const axios = require('axios');
const { logger } = require('../logger');
const {
  transformProduct,
  transformQueryResults,
} = require('../cache/transformer');

const ERPNEXT_API_URL = process.env.ERPNEXT_API_URL;
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY;
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET;

/**
 * Create ERPNext API client
 * Always uses server's ERPNext credentials from environment variables
 * No user authentication required - middleware acts as a proxy
 */
function createErpnextClient() {
  // Always use server's ERPNext API credentials
  const auth = Buffer.from(`${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`).toString(
    'base64'
  );

  // Build base URL
  const baseURL = ERPNEXT_API_URL.replace(/\/$/, '');

  return axios.create({
    baseURL,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout
  });
}

/**
 * Fetch product from ERPNext using direct resource access (same pattern as Postman)
 * Returns transformed app-ready data
 * Uses server's ERPNext credentials (not user auth)
 */
async function fetchProduct(itemCode) {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';

    // Use direct resource access: /api/resource/Website Item/WEB-ITM-0002
    // This matches the Postman pattern that works
    // Encode the doctype properly (spaces become %20)
    const encodedDoctype = encodeURIComponent(doctype);
    const url = `/api/resource/${encodedDoctype}/${itemCode}`;
    const response = await client.get(url);

    // Direct resource access returns {data: {...}} format directly
    if (!response.data || !response.data.data) {
      return null;
    }

    // Wrap in {data: {...}} format for transformer
    const wrapped = { data: response.data.data };

    // Transform to app-ready format
    const transformed = await transformProduct(wrapped);
    return transformed;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch product query results from ERPNext
 * Returns transformed app-ready array
 * Uses server's ERPNext credentials (not user auth)
 */
async function fetchProductQuery(queryString) {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';
    const encodedDoctype = encodeURIComponent(doctype);
    
    // Handle empty query string - fetch all items
    // Format: /api/resource/Website Item or /api/resource/Website Item?filters=...
    const url = queryString 
      ? `/api/resource/${encodedDoctype}?${queryString}`
      : `/api/resource/${encodedDoctype}`;

    const response = await client.get(url);

    // ERPNext returns {data: [...]} format (wrapped array)
    if (!response.data || !response.data.data) {
      return [];
    }

    // Transform to app-ready format
    const transformed = await transformQueryResults('product', response.data);
    return transformed;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch raw product from ERPNext (without transformation)
 * Use only when raw ERPNext data is needed
 * Uses server's ERPNext credentials (not user auth)
 */
async function fetchProductRaw(itemCode) {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';

    const fields = [
      'item_code',
      'item_name',
      'web_item_name',
      'brand',
      'item_group',
      'description',
      'short_description',
      'web_long_description',
      'website_image',
      'custom_variant',
    ];

    const filters = [['name', '=', itemCode]];
    const queryParams = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
    });

    const url = `${doctype}?${queryParams.toString()}`;
    const response = await client.get(url);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return null;
    }

    return { data: response.data.data[0] };
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch all published Website Items with only name and custom_variant fields
 * Used for bulk price updates and stock snapshots
 * @returns {Promise<Array>} Array of {name, custom_variant} objects
 */
async function fetchPublishedWebsiteItems() {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';

    const fields = ['name', 'custom_variant'];
    const filters = [['published', '=', 1]];

    // Build query string matching ERPNext API format
    // Format: /api/resource/Website Item?filters=[["published","=",1]]&fields=["name","custom_variant"]
    const encodedDoctype = encodeURIComponent(doctype);
    const filtersStr = encodeURIComponent(JSON.stringify(filters));
    const fieldsStr = encodeURIComponent(JSON.stringify(fields));
    
    const url = `/api/resource/${encodedDoctype}?filters=${filtersStr}&fields=${fieldsStr}`;
    
    logger.info('Fetching published website items', { 
      url, 
      filters: JSON.stringify(filters),
      fields: JSON.stringify(fields),
    });
    
    const response = await client.get(url);

    if (!response.data || !response.data.data) {
      logger.warn('No data returned from ERPNext query', {
        responseData: response.data,
      });
      return [];
    }

    logger.info('Fetched published website items', {
      count: response.data.data.length,
    });

    return response.data.data;
  } catch (error) {
    logger.error('Failed to fetch published website items', {
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
    });
    throw error;
  }
}

/**
 * Fetch retail and wholesale prices for an item from Item Price doctype
 * Returns object with retail and wholesale prices
 * @param {string} itemCode - The item code to fetch prices for
 * @returns {Promise<{retail: number|null, wholesale: number|null}>} Object with retail and wholesale prices
 */
async function fetchItemPrices(itemCode) {
  try {
    const client = createErpnextClient();
    const doctype = 'Item Price';
    const encodedDoctype = encodeURIComponent(doctype);

    // Fetch both prices in parallel
    const [retailResult, wholesaleResult] = await Promise.allSettled([
      // Retail price (Standard Selling)
      (async () => {
        try {
          const fields = ['price_list_rate'];
          const filters = [
            ['item_code', '=', itemCode],
            ['price_list', '=', 'Standard Selling'],
          ];

          const filtersStr = encodeURIComponent(JSON.stringify(filters));
          const fieldsStr = encodeURIComponent(JSON.stringify(fields));
          
          const url = `/api/resource/${encodedDoctype}?filters=${filtersStr}&fields=${fieldsStr}`;
          const response = await client.get(url);

          if (!response.data || !response.data.data || response.data.data.length === 0) {
            logger.info('Retail price not found', { itemCode, priceList: 'Standard Selling' });
            return null;
          }

          const priceData = response.data.data[0];
          const price = parseFloat(priceData.price_list_rate);
          return isNaN(price) ? null : price;
        } catch (error) {
          logger.error('Error fetching retail price', {
            itemCode,
            error: error.message,
            status: error.response?.status,
            responseData: error.response?.data,
          });
          throw error;
        }
      })(),
      // Wholesale price (Wholesale Selling)
      (async () => {
        try {
          const fields = ['price_list_rate'];
          const filters = [
            ['item_code', '=', itemCode],
            ['price_list', '=', 'Wholesale Selling'],
          ];

          const filtersStr = encodeURIComponent(JSON.stringify(filters));
          const fieldsStr = encodeURIComponent(JSON.stringify(fields));
          
          const url = `/api/resource/${encodedDoctype}?filters=${filtersStr}&fields=${fieldsStr}`;
          const response = await client.get(url);

          if (!response.data || !response.data.data || response.data.data.length === 0) {
            logger.info('Wholesale price not found', { itemCode, priceList: 'Wholesale Selling' });
            return null;
          }

          const priceData = response.data.data[0];
          const price = parseFloat(priceData.price_list_rate);
          return isNaN(price) ? null : price;
        } catch (error) {
          logger.error('Error fetching wholesale price', {
            itemCode,
            error: error.message,
            status: error.response?.status,
            responseData: error.response?.data,
          });
          throw error;
        }
      })(),
    ]);

    // Log any rejected promises
    if (retailResult.status === 'rejected') {
      logger.error('Retail price fetch rejected', {
        itemCode,
        error: retailResult.reason?.message || retailResult.reason,
      });
    }
    if (wholesaleResult.status === 'rejected') {
      logger.error('Wholesale price fetch rejected', {
        itemCode,
        error: wholesaleResult.reason?.message || wholesaleResult.reason,
      });
    }

    const retail = retailResult.status === 'fulfilled' ? retailResult.value : null;
    const wholesale = wholesaleResult.status === 'fulfilled' ? wholesaleResult.value : null;

    return { retail, wholesale };
  } catch (error) {
    logger.error('Failed to fetch item prices from ERPNext', {
      itemCode,
      error: error.message,
      status: error.response?.status,
      stack: error.stack,
    });
    return { retail: null, wholesale: null };
  }
}

/**
 * Fetch stock availability for an item from Bin API
 * Returns array of warehouse names where item has stock (actual_qty > 0)
 * @param {string} itemCode - The item code to fetch stock for
 * @returns {Promise<Array<string>>} Array of warehouse names with stock
 */
async function fetchItemStock(itemCode) {
  try {
    const client = createErpnextClient();
    const doctype = 'Bin';

    const fields = ['item_code', 'warehouse'];
    const filters = [
      ['item_code', '=', itemCode],
      ['actual_qty', '>', 0],
    ];

    const queryParams = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
    });

    const url = `${doctype}?${queryParams.toString()}`;
    const response = await client.get(url);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return [];
    }

    // Extract warehouse names from response
    const warehouses = response.data.data.map((bin) => bin.warehouse);
    return warehouses;
  } catch (error) {
    logger.error('Failed to fetch item stock from ERPNext', {
      itemCode,
      error: error.message,
      status: error.response?.status,
    });
    return [];
  }
}

/**
 * Download hero image from URL and convert to base64 data URL
 * @param {string} imageUrl - Image URL (can be relative or absolute)
 * @returns {Promise<string|null>} Base64 data URL or null if download fails
 */
async function downloadHeroImage(imageUrl) {
  try {
    const client = createErpnextClient();
    
    // If URL is relative, prepend ERPNext base URL
    let fullUrl = imageUrl;
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      const baseURL = ERPNEXT_API_URL.replace(/\/$/, '');
      fullUrl = `${baseURL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }

    // Download image as arraybuffer
    const response = await axios.get(fullUrl, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`).toString('base64')}`,
      },
      timeout: 10000,
    });

    // Determine content type from response headers or URL extension
    let contentType = response.headers['content-type'] || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      // Fallback: try to determine from URL extension
      const ext = imageUrl.split('.').pop()?.toLowerCase();
      const mimeTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      contentType = mimeTypes[ext] || 'image/jpeg';
    }

    // Convert to base64
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error('Failed to download hero image', {
      imageUrl,
      error: error.message,
      status: error.response?.status,
    });
    return null;
  }
}

/**
 * Fetch hero images from ERPNext File doctype
 * Returns array of file URLs
 * @returns {Promise<Array<string>>} Array of file URLs
 */
async function fetchHeroImages() {
  try {
    const client = createErpnextClient();
    const doctype = 'File';

    const fields = ['file_url'];
    const filters = [['is_hero', '=', 1]];
    const limit = 10;

    const encodedDoctype = encodeURIComponent(doctype);
    const filtersStr = encodeURIComponent(JSON.stringify(filters));
    const fieldsStr = encodeURIComponent(JSON.stringify(fields));
    
    const url = `/api/resource/${encodedDoctype}?filters=${filtersStr}&fields=${fieldsStr}&limit=${limit}`;
    
    logger.info('Fetching hero images', { url });
    
    const response = await client.get(url);

    if (!response.data || !response.data.data) {
      logger.warn('No hero images returned from ERPNext', {
        responseData: response.data,
      });
      return [];
    }

    // Extract file_url from response
    const fileUrls = response.data.data
      .map((file) => file.file_url)
      .filter((url) => url); // Filter out null/undefined URLs

    logger.info('Fetched hero images', {
      count: fileUrls.length,
    });

    return fileUrls;
  } catch (error) {
    logger.error('Failed to fetch hero images from ERPNext', {
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
    });
    return [];
  }
}

/**
 * Fetch App Home data from ERPNext App Home doctype
 * Returns single object (latest if multiple)
 * @returns {Promise<object|null>} App Home object or null if not found
 */
async function fetchAppHome() {
  try {
    const client = createErpnextClient();
    const doctype = 'App Home';

    const encodedDoctype = encodeURIComponent(doctype);
    const fieldsStr = encodeURIComponent(JSON.stringify(['*']));
    
    const url = `/api/resource/${encodedDoctype}?fields=${fieldsStr}`;
    
    logger.info('Fetching App Home data', { url });
    
    const response = await client.get(url);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      logger.warn('No App Home data returned from ERPNext', {
        responseData: response.data,
      });
      return null;
    }

    // If multiple objects, select latest by modified timestamp
    let latest = response.data.data[0];
    if (response.data.data.length > 1) {
      latest = response.data.data.reduce((prev, current) => {
        const prevModified = new Date(prev.modified || prev.creation || 0);
        const currentModified = new Date(current.modified || current.creation || 0);
        return currentModified > prevModified ? current : prev;
      });
    }

    logger.info('Fetched App Home data', {
      name: latest.name,
      modified: latest.modified,
      totalCount: response.data.data.length,
    });

    return latest;
  } catch (error) {
    logger.error('Failed to fetch App Home from ERPNext', {
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
    });
    return null;
  }
}

/**
 * Fetch bundle images from ERPNext File doctype
 * Returns array of file URLs
 * @returns {Promise<Array<string>>} Array of file URLs
 */
async function fetchBundleImages() {
  try {
    const client = createErpnextClient();
    const doctype = 'File';

    const fields = ['file_url'];
    const filters = [['is_bundle', '=', 1]];
    const limit = 10;

    const encodedDoctype = encodeURIComponent(doctype);
    const filtersStr = encodeURIComponent(JSON.stringify(filters));
    const fieldsStr = encodeURIComponent(JSON.stringify(fields));
    
    const url = `/api/resource/${encodedDoctype}?filters=${filtersStr}&fields=${fieldsStr}&limit=${limit}`;
    
    logger.info('Fetching bundle images', { url });
    
    const response = await client.get(url);

    if (!response.data || !response.data.data) {
      logger.warn('No bundle images returned from ERPNext', {
        responseData: response.data,
      });
      return [];
    }

    // Extract file_url from response
    const fileUrls = response.data.data
      .map((file) => file.file_url)
      .filter((url) => url); // Filter out null/undefined URLs

    logger.info('Fetched bundle images', {
      count: fileUrls.length,
    });

    return fileUrls;
  } catch (error) {
    logger.error('Failed to fetch bundle images from ERPNext', {
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
    });
    return [];
  }
}

module.exports = {
  createErpnextClient,
  fetchProduct,
  fetchProductQuery,
  fetchProductRaw,
  fetchPublishedWebsiteItems,
  fetchItemPrices,
  fetchItemStock,
  downloadHeroImage,
  fetchHeroImages,
  fetchBundleImages,
  fetchAppHome,
};

