# Prowhey Middleware Documentation

## Overview

This directory contains documentation for the Prowhey Middleware API.

## Documentation Files

- **[API.md](./api/API.md)** - Complete API documentation with endpoints, request/response formats, and examples
- **[SYNC_API.md](./api/SYNC_API.md)** - Detailed sync API documentation for frontend apps
- **[ERPNEXT_WEBHOOKS.md](./api/ERPNEXT_WEBHOOKS.md)** - ERPNext webhook configuration guide for administrators

## Quick Links

### Product Endpoints
- [Get Single Product](./api/API.md#get-single-product)
- [Query Products](./api/API.md#query-products)

### Analytics Endpoints
- [Increment Views](./api/API.md#increment-product-views)
- [Add Rating](./api/API.md#add-product-rating)
- [Add Comment](./api/API.md#add-product-comment)

### Management Endpoints
- [Bulk Price Update](./api/API.md#bulk-price-update)
- [Bulk Stock Update](./api/API.md#bulk-stock-update)
- [Webhooks](./api/API.md#webhooks)

### ERPNext Integration
- [ERPNext Webhook Configuration](./api/ERPNEXT_WEBHOOKS.md) - Complete guide for setting up ERPNext webhooks

## Getting Started

1. Read the [API Documentation](./api/API.md) for complete endpoint details
2. Check the [Base URL](./api/API.md#base-url) section for your environment
3. Review [Response Format](./api/API.md#response-format) for standard response structure
4. See [Examples](./api/API.md#examples) for common use cases

## Key Concepts

- **ERPNext Name Field**: Used as primary identifier (e.g., `WEB-ITM-0002`)
- **Caching**: Products cached for 1 hour, queries for 5 minutes
- **Stock Availability**: Binary arrays matching warehouse reference order
- **Price Storage**: Per size (first flavor only, all flavors same price)
- **Stock Storage**: Per item code (all flavors tracked separately)

## Support

For detailed information, see the [API Documentation](./api/API.md).

