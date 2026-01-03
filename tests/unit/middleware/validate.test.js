const { validateRequest } = require('../../../src/middleware/validate');
const { ValidationError, InternalServerError } = require('../../../src/utils/errors');
const { z } = require('zod');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      path: '/test',
      method: 'POST',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe('validateRequest', () => {
    test('should pass valid request', async () => {
      const schema = z.object({
        params: z.object({}),
        body: z.object({
          name: z.string().min(1),
        }),
        query: z.object({}),
      });

      req.body = { name: 'test' };

      const middleware = validateRequest(schema);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.validated).toBeDefined();
      expect(req.validatedBody).toEqual({ name: 'test' });
    });

    test('should reject invalid request', async () => {
      const schema = z.object({
        params: z.object({}),
        body: z.object({
          name: z.string().min(1),
        }),
        query: z.object({}),
      });

      req.body = { name: '' };

      const middleware = validateRequest(schema);
      
      await expect(middleware(req, res, next)).rejects.toThrow(ValidationError);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should sanitize path parameters', async () => {
      const schema = z.object({
        params: z.object({
          name: z.string().min(1),
        }),
        body: z.object({}),
        query: z.object({}),
      });

      req.params = { name: 'WEB-ITM-0002' };

      const middleware = validateRequest(schema);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.validatedParams.name).toBe('WEB-ITM-0002');
    });

    test('should sanitize body data', async () => {
      const schema = z.object({
        params: z.object({}),
        body: z.object({
          text: z.string().min(1),
        }),
        query: z.object({}),
      });

      req.body = { text: '<script>alert("xss")</script>' };

      const middleware = validateRequest(schema);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.validatedBody.text).toContain('&lt;script&gt;');
    });

    test('should handle validation errors with multiple fields', async () => {
      const schema = z.object({
        params: z.object({}),
        body: z.object({
          name: z.string().min(1),
          age: z.number().min(0),
        }),
        query: z.object({}),
      });

      req.body = { name: '', age: -1 };

      const middleware = validateRequest(schema);
      
      await expect(middleware(req, res, next)).rejects.toThrow(ValidationError);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle missing params/body/query', async () => {
      const schema = z.object({
        params: z.object({}),
        body: z.object({}),
        query: z.object({}),
      });

      req.params = undefined;
      req.body = undefined;
      req.query = undefined;

      const middleware = validateRequest(schema);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should handle middleware errors gracefully', async () => {
      // Create a schema that will cause an error
      const invalidSchema = null;

      const middleware = validateRequest(invalidSchema);
      
      await expect(middleware(req, res, next)).rejects.toThrow(InternalServerError);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

