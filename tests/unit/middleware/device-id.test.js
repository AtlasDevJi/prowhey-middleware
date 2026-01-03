// Mock uuid before requiring device-id
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

const { extractDeviceId } = require('../../../src/middleware/device-id');

describe('Device ID Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/test',
    };

    res = {
      setHeader: jest.fn(),
    };

    next = jest.fn();
  });

  test('should extract device ID from X-Device-ID header', () => {
    req.headers['x-device-id'] = 'device-abc123';

    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('device-abc123');
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('should extract device ID from X-Client-ID header if X-Device-ID missing', () => {
    req.headers['x-client-id'] = 'client-xyz789';

    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('client-xyz789');
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('should generate client ID if both headers missing', () => {
    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('client-mock-uuid-12345');
    expect(res.setHeader).toHaveBeenCalledWith('X-Client-ID', 'client-mock-uuid-12345');
    expect(next).toHaveBeenCalled();
  });

  test('should prefer X-Device-ID over X-Client-ID', () => {
    req.headers['x-device-id'] = 'device-abc123';
    req.headers['x-client-id'] = 'client-xyz789';

    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('device-abc123');
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  test('should handle case-insensitive headers', () => {
    req.headers['X-Device-ID'] = 'device-ABC123';

    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('device-ABC123');
  });

  test('should sanitize device ID (trim and limit length)', () => {
    const longId = 'a'.repeat(300);
    req.headers['x-device-id'] = `  ${longId}  `;

    extractDeviceId(req, res, next);

    expect(req.deviceId.length).toBeLessThanOrEqual(200);
    expect(req.deviceId).not.toMatch(/^\s|\s$/); // No leading/trailing whitespace
  });

  test('should handle empty string as missing', () => {
    req.headers['x-device-id'] = '   ';

    extractDeviceId(req, res, next);

    expect(req.deviceId).toBe('client-mock-uuid-12345');
    expect(res.setHeader).toHaveBeenCalledWith('X-Client-ID', 'client-mock-uuid-12345');
  });
});

