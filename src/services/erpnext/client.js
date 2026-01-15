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
    const url = `${doctype}?${queryString}`;

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

module.exports = {
  createErpnextClient,
  fetchProduct,
  fetchProductQuery,
  fetchProductRaw,
  fetchPublishedWebsiteItems,
  fetchItemStock,
};

