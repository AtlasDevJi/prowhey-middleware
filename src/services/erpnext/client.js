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
 * Fetch product from ERPNext using query API with filters
 * Returns transformed app-ready data
 * Uses server's ERPNext credentials (not user auth)
 */
async function fetchProduct(itemCode) {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';

    // Fields to request
    const fields = [
      'name', // ERPNext name field (e.g., WEB-ITM-0002) for analytics key
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

    // Filters to get specific item
    const filters = [['name', '=', itemCode]];

    // Build query string
    const queryParams = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
    });

    const url = `${doctype}?${queryParams.toString()}`;
    const response = await client.get(url);

    // ERPNext query returns {data: [...]} format
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return null;
    }

    // Wrap in {data: {...}} format for transformer
    // Transformer expects single item, but we get array from query
    const wrapped = { data: response.data.data[0] };

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
 * Used for bulk price updates
 * @returns {Promise<Array>} Array of {name, custom_variant} objects
 */
async function fetchPublishedWebsiteItems() {
  try {
    const client = createErpnextClient();
    const doctype = 'Website Item';

    const fields = ['name', 'custom_variant'];
    const filters = [['published', '=', 1]];

    const queryParams = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
    });

    const url = `${doctype}?${queryParams.toString()}`;
    const response = await client.get(url);

    if (!response.data || !response.data.data) {
      return [];
    }

    return response.data.data;
  } catch (error) {
    logger.error('Failed to fetch published website items', {
      error: error.message,
      status: error.response?.status,
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

