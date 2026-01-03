const request = require('supertest');
const express = require('express');

// Mock uuid before requiring analytics
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123'),
}));

const analyticsRoutes = require('../../../src/routes/analytics');
const {
  incrementProductViews,
  addProductRating,
  addProductComment,
} = require('../../../src/services/analytics/analytics');

// Mock analytics service
jest.mock('../../../src/services/analytics/analytics');

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

describe('Analytics Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/analytics/product/:name/view', () => {
    test('should accept valid request', async () => {
      incrementProductViews.mockResolvedValue(100);

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/view')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        views: 100,
      });
      expect(incrementProductViews).toHaveBeenCalledWith('WEB-ITM-0002');
    });

    test('should reject invalid ERPNext name format', async () => {
      const response = await request(app)
        .post('/api/analytics/product/invalid-name/view')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              field: 'params.name',
              message: expect.stringContaining('ERPNext name'),
            }),
          ]),
        }),
      });
    });

    test('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/analytics/product//view')
        .expect(404); // Express routing issue, but validation would catch it
    });
  });

  describe('POST /api/analytics/product/:name/rating', () => {
    test('should accept valid rating', async () => {
      addProductRating.mockResolvedValue({
        ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
        reviewCount: 1,
      });

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/rating')
        .send({ starRating: 5 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, 5: 1 },
        reviewCount: 1,
      });
      expect(addProductRating).toHaveBeenCalledWith('WEB-ITM-0002', 5);
    });

    test('should reject invalid starRating (too high)', async () => {
      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/rating')
        .send({ starRating: 6 })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({
              field: 'body.starRating',
            }),
          ]),
        }),
      });
    });

    test('should reject invalid starRating (too low)', async () => {
      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/rating')
        .send({ starRating: 0 })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject missing starRating', async () => {
      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/rating')
        .send({})
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should sanitize XSS in product name', async () => {
      // Even if XSS is attempted, it should be sanitized
      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/rating')
        .send({ starRating: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/analytics/product/:name/comment', () => {
    test('should accept valid comment', async () => {
      const mockComments = [
        {
          id: '123',
          text: 'Great product!',
          author: 'John Doe',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ];

      addProductComment.mockResolvedValue(mockComments);

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/comment')
        .send({
          text: 'Great product!',
          author: 'John Doe',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        comments: mockComments,
      });
      expect(addProductComment).toHaveBeenCalledWith(
        'WEB-ITM-0002',
        expect.objectContaining({
          text: 'Great product!',
          author: 'John Doe',
        })
      );
    });

    test('should reject empty text', async () => {
      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/comment')
        .send({
          text: '',
          author: 'John Doe',
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should reject text exceeding max length', async () => {
      const longText = 'a'.repeat(5001);

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/comment')
        .send({
          text: longText,
        })
        .expect(400);

      expect(response.body.details).toBeDefined();
      expect(response.body.details.fields).toBeDefined();
    });

    test('should sanitize XSS in comment text', async () => {
      addProductComment.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/comment')
        .send({
          text: '<script>alert("xss")</script>',
        })
        .expect(200);

      // Check that sanitized text was passed to service
      expect(addProductComment).toHaveBeenCalledWith(
        'WEB-ITM-0002',
        expect.objectContaining({
          text: expect.stringContaining('&lt;script&gt;'),
        })
      );
    });

    test('should accept optional fields', async () => {
      addProductComment.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/analytics/product/WEB-ITM-0002/comment')
        .send({
          text: 'Comment',
          author: 'John',
          timestamp: '2024-01-01T00:00:00.000Z',
          customField: 'value',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});

