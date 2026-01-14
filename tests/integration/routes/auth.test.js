const request = require('supertest');
const express = require('express');

// Mock services before requiring routes
jest.mock('../../../src/services/auth/password');
jest.mock('../../../src/services/auth/user-storage');
jest.mock('../../../src/services/auth/verification');
jest.mock('../../../src/services/auth/password-reset');
jest.mock('../../../src/services/redis/client');

const authRoutes = require('../../../src/routes/auth');
const { hashPassword, verifyPassword } = require('../../../src/services/auth/password');
const {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  softDeleteUser,
  emailExists,
  usernameExists,
} = require('../../../src/services/auth/user-storage');
const {
  sendVerificationCode,
  verifyCode,
  storeEmailVerificationCode,
} = require('../../../src/services/auth/verification');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// Mock error handler
const { errorHandler } = require('../../../src/middleware/error-handler');
app.use(errorHandler);

describe('Auth Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    test('should register new user successfully', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        isVerified: false,
        status: 'pending_verification',
      };

      usernameExists.mockResolvedValue(false);
      emailExists.mockResolvedValue(false);
      hashPassword.mockResolvedValue('hashed_password');
      createUser.mockResolvedValue(userData);
      sendVerificationCode.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          phone: '+1234567890',
          verificationMethod: 'sms',
          deviceId: 'device123',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe('usr_test123');
      expect(response.body.data.needsVerification).toBe(true);
      expect(hashPassword).toHaveBeenCalledWith('password123');
      expect(createUser).toHaveBeenCalled();
    });

    test('should reject duplicate username', async () => {
      usernameExists.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'existinguser',
          email: 'test@example.com',
          password: 'password123',
          deviceId: 'device123',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('CONFLICT_ERROR');
    });

    test('should reject duplicate email', async () => {
      usernameExists.mockResolvedValue(false);
      emailExists.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'testuser',
          email: 'existing@example.com',
          password: 'password123',
          deviceId: 'device123',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('CONFLICT_ERROR');
    });

    test('should require email or phone', async () => {
      usernameExists.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          username: 'testuser',
          password: 'password123',
          deviceId: 'device123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/verify', () => {
    test('should verify user and return tokens', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        isVerified: false,
      };

      verifyCode.mockResolvedValue({ valid: true });
      updateUser.mockResolvedValue({ ...userData, isVerified: true });

      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          userId: 'usr_test123',
          code: '123456',
          method: 'sms',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.isVerified).toBe(true);
    });

    test('should reject invalid code', async () => {
      verifyCode.mockResolvedValue({ valid: false, error: 'Invalid code' });

      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          userId: 'usr_test123',
          code: '000000',
          method: 'sms',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login user successfully', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashed_password',
        isVerified: true,
      };

      getUserByEmail.mockResolvedValue(userData);
      verifyPassword.mockResolvedValue(true);
      updateUser.mockResolvedValue(userData);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(verifyPassword).toHaveBeenCalledWith('password123', 'hashed_password');
    });

    test('should reject invalid credentials', async () => {
      getUserByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED_ERROR');
    });

    test('should reject incorrect password', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashed_password',
        isVerified: true,
      };

      getUserByEmail.mockResolvedValue(userData);
      verifyPassword.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED_ERROR');
    });

    test('should reject unverified account', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashed_password',
        isVerified: false,
      };

      getUserByEmail.mockResolvedValue(userData);
      verifyPassword.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED_ERROR');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current user with valid token', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        phone: '+1234567890',
        isVerified: true,
        createdAt: '2025-01-15T10:00:00Z',
        lastLogin: '2025-01-15T10:00:00Z',
        deleted: false,
      };

      getUserByEmail.mockResolvedValue(userData);

      // Generate a real token for testing
      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      // Mock getUserById to return user when authenticated
      getUserById.mockResolvedValue(userData);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe('usr_test123');
    });

    test('should reject request without token', async () => {
      const response = await request(app).get('/api/auth/me').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED_ERROR');
    });
  });

  describe('PUT /api/auth/profile', () => {
    test('should update profile successfully', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        phone: '+1234567890',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);
      usernameExists.mockResolvedValue(false);
      updateUser.mockResolvedValue({ ...userData, username: 'newusername' });

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'newusername',
          passwordConfirmed: true,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('newusername');
    });

    test('should require password confirmation', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'newusername',
          passwordConfirmed: false,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should trigger email verification for email change', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'old@example.com',
        username: 'testuser',
        phone: '+1234567890',
        verificationMethod: 'sms',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'old@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);
      emailExists.mockResolvedValue(false);
      storeEmailVerificationCode.mockResolvedValue('123456');
      sendVerificationCode.mockResolvedValue({ success: true });

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@example.com',
          passwordConfirmed: true,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.needsEmailVerification).toBe(true);
    });
  });

  describe('PUT /api/auth/password', () => {
    test('should change password successfully', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'old_hash',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);
      verifyPassword.mockResolvedValue(true);
      hashPassword.mockResolvedValue('new_hash');
      updateUser.mockResolvedValue(userData);

      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(verifyPassword).toHaveBeenCalledWith('oldpassword', 'old_hash');
      expect(hashPassword).toHaveBeenCalledWith('newpassword123');
    });

    test('should reject incorrect current password', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'old_hash',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);
      verifyPassword.mockResolvedValue(false);

      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED_ERROR');
    });
  });

  describe('DELETE /api/auth/account', () => {
    test('should soft delete account successfully', async () => {
      const userData = {
        id: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
        isVerified: true,
        deleted: false,
      };

      const { generateAccessToken } = require('../../../src/middleware/auth');
      const token = generateAccessToken({
        userId: 'usr_test123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const { getUserById } = require('../../../src/services/auth/user-storage');
      getUserById.mockResolvedValue(userData);
      softDeleteUser.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(softDeleteUser).toHaveBeenCalledWith('usr_test123');
    });
  });

  describe('GET /api/auth/check-username', () => {
    test('should return available username', async () => {
      usernameExists.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/auth/check-username')
        .query({ username: 'newuser' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.available).toBe(true);
    });

    test('should return unavailable username', async () => {
      usernameExists.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/auth/check-username')
        .query({ username: 'existinguser' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.available).toBe(false);
    });

    test('should require username parameter', async () => {
      const response = await request(app)
        .get('/api/auth/check-username')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});

