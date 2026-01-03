const {
  sanitizeHtml,
  sanitizeString,
  sanitizeStringWithHtml,
  sanitizePathParam,
  sanitizeNumber,
  sanitizeObject,
} = require('../../../src/utils/sanitize');

describe('Sanitization Utilities', () => {
  describe('sanitizeHtml', () => {
    test('should encode HTML entities', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });

    test('should handle ampersand', () => {
      expect(sanitizeHtml('A & B')).toBe('A &amp; B');
    });

    test('should handle quotes', () => {
      expect(sanitizeHtml('"hello"')).toBe('&quot;hello&quot;');
      expect(sanitizeHtml("'hello'")).toBe('&#x27;hello&#x27;');
    });

    test('should return non-string values as-is', () => {
      expect(sanitizeHtml(123)).toBe(123);
      expect(sanitizeHtml(null)).toBe(null);
      expect(sanitizeHtml(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeString', () => {
    test('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    test('should remove null bytes', () => {
      expect(sanitizeString('hello\0world')).toBe('helloworld');
    });

    test('should enforce length limit', () => {
      expect(sanitizeString('hello world', 5)).toBe('hello');
    });

    test('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    test('should return non-string values as-is', () => {
      expect(sanitizeString(123)).toBe(123);
    });
  });

  describe('sanitizeStringWithHtml', () => {
    test('should trim and encode HTML', () => {
      expect(sanitizeStringWithHtml('  <script>  ')).toBe('&lt;script&gt;');
    });

    test('should enforce length limit', () => {
      // Length limit is applied before HTML encoding
      // Note: After encoding, length may be longer due to HTML entities
      const result = sanitizeStringWithHtml('<script>alert("xss")</script>', 7);
      // Original string truncated to 7 chars: "<script"
      // After encoding: "&lt;script" (9 chars, but original was limited to 7)
      expect(result).toBe('&lt;script');
    });
  });

  describe('sanitizePathParam', () => {
    test('should URL decode parameter', () => {
      expect(sanitizePathParam('WEB-ITM-0002')).toBe('WEB-ITM-0002');
      expect(sanitizePathParam('WEB%2DITM%2D0002')).toBe('WEB-ITM-0002');
    });

    test('should remove null bytes', () => {
      expect(sanitizePathParam('WEB-ITM\0-0002')).toBe('WEB-ITM-0002');
    });

    test('should remove dangerous characters', () => {
      expect(sanitizePathParam('WEB<ITM>0002')).toBe('WEBITM0002');
    });

    test('should trim whitespace', () => {
      expect(sanitizePathParam('  WEB-ITM-0002  ')).toBe('WEB-ITM-0002');
    });

    test('should handle invalid URL encoding', () => {
      expect(sanitizePathParam('%invalid')).toBe('');
    });

    test('should return empty string for non-string input', () => {
      expect(sanitizePathParam(123)).toBe('');
    });
  });

  describe('sanitizeNumber', () => {
    test('should parse string to number', () => {
      expect(sanitizeNumber('123')).toBe(123);
      expect(sanitizeNumber('123.45')).toBe(123.45);
    });

    test('should validate range', () => {
      expect(sanitizeNumber(5, { min: 1, max: 10 })).toBe(5);
      expect(sanitizeNumber(0, { min: 1, max: 10 })).toBe(null);
      expect(sanitizeNumber(15, { min: 1, max: 10 })).toBe(null);
    });

    test('should round to decimal places', () => {
      expect(sanitizeNumber(123.456, { decimals: 2 })).toBe(123.46);
    });

    test('should return null for invalid input', () => {
      expect(sanitizeNumber('invalid')).toBe(null);
      expect(sanitizeNumber(NaN)).toBe(null);
    });
  });

  describe('sanitizeObject', () => {
    test('should sanitize string fields', () => {
      const obj = {
        text: '  <script>alert("xss")</script>  ',
        number: 123,
        boolean: true,
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized.text).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(sanitized.number).toBe(123);
      expect(sanitized.boolean).toBe(true);
    });

    test('should handle nested objects', () => {
      const obj = {
        user: {
          name: '<script>alert("xss")</script>',
          age: 25,
        },
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized.user.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(sanitized.user.age).toBe(25);
    });

    test('should handle arrays', () => {
      const obj = {
        items: ['<script>', 'normal', 123],
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized.items[0]).toBe('&lt;script&gt;');
      expect(sanitized.items[1]).toBe('normal');
      expect(sanitized.items[2]).toBe(123);
    });

    test('should handle null and undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    test('should preserve non-object types', () => {
      expect(sanitizeObject('string')).toBe('string');
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });
});

