const request = require('supertest');
const express = require('express');
const webhookRoutes = require('../../../src/routes/webhooks');
const { setCachedPrice } = require('../../../src/services/price/price');
const { deleteCache } = require('../../../src/services/redis/cache');
const { errorHandler } = require('../../../src/middleware/error-handler');

// Mock services
jest.mock('../../../src/services/price/price');
jest.mock('../../../src/services/redis/cache');

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhookRoutes);
app.use(errorHandler);

describe('Webhook Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks/price-update', () => {
    test('should accept valid price update', async () => {
      setCachedPrice.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: 29.99,
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Price updated successfully',
        erpnextName: 'WEB-ITM-0002',
        sizeUnit: '5lb',
        price: 29.99,
      });
      expect(setCachedPrice).toHaveBeenCalledWith('WEB-ITM-0002', '5lb', 29.99);
    });

    test('should accept price as string and convert to number', async () => {
      setCachedPrice.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: '29.99',
        })
        .expect(200);

      expect(response.body.price).toBe(29.99);
      expect(setCachedPrice).toHaveBeenCalledWith('WEB-ITM-0002', '5lb', 29.99);
    });

    test('should handle invalidateCache flag', async () => {
      setCachedPrice.mockResolvedValue(true);
      deleteCache.mockResolvedValue(true);

      await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: 29.99,
          invalidateCache: true,
        })
        .expect(200);

      expect(deleteCache).toHaveBeenCalledWith('product', 'WEB-ITM-0002');
    });

    test('should reject missing erpnextName', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          sizeUnit: '5lb',
          price: 29.99,
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              field: 'body.erpnextName',
            }),
          ]),
        }),
      });
    });

    test('should reject missing sizeUnit', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          price: 29.99,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject missing price', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject invalid price (negative)', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: -10,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject invalid price (too high)', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: 1000000,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject invalid erpnextName format', async () => {
      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'invalid-name',
          sizeUnit: '5lb',
          price: 29.99,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject sizeUnit exceeding max length', async () => {
      const longSizeUnit = 'a'.repeat(51);

      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: longSizeUnit,
          price: 29.99,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should accept optional itemCode', async () => {
      setCachedPrice.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: 29.99,
          itemCode: 'OL-PC-91-vnl-5lb',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle cache update failure', async () => {
      setCachedPrice.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/webhooks/price-update')
        .send({
          erpnextName: 'WEB-ITM-0002',
          sizeUnit: '5lb',
          price: 29.99,
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update price',
      });
    });
  });
});

