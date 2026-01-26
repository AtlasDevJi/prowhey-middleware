# Backend Device Conflict Handling

## Overview

When a user attempts to register with a device that is already associated with another account, the backend should:

1. **Detect the conflict** during signup
2. **Return device conflict information** instead of creating a new account
3. **Provide endpoints** for restoring or deleting the existing account

## Required Backend Changes

### 1. Update Signup Endpoint to Detect Device Conflicts

**File**: `src/routes/auth.js` (or equivalent signup route)

**Change**: Before creating a new user, check if the `deviceId` is already associated with an account.

**Code**:
```javascript
router.post('/signup', authRateLimiter, async (req, res) => {
  try {
    const validated = signupSchema.parse(req.body);
    const { deviceId, username, email, phone } = validated;

    // Check if device is already associated with an account
    const existingUser = await getUserByDeviceId(deviceId);
    
    if (existingUser) {
      // Check if user is a customer - customers cannot be replaced
      if (existingUser.userStatus === 'erpnext_customer' || existingUser.approvedCustomer) {
        return res.status(409).json({
          success: false,
          error: 'Device Conflict',
          message: 'This device is already associated with a customer account. Please use the existing account or contact support.',
          code: 'DEVICE_CONFLICT',
          details: {
            existingAccount: {
              username: existingUser.username,
              email: existingUser.email,
              phone: existingUser.phone,
              userId: existingUser.id,
              userStatus: existingUser.userStatus,
            },
          },
        });
      }

      // For non-customer accounts, return conflict info
      return res.status(409).json({
        success: false,
        error: 'Device Conflict',
        message: 'This device is already associated with an account.',
        code: 'DEVICE_CONFLICT',
        details: {
          existingAccount: {
            username: existingUser.username,
            email: existingUser.email,
            phone: existingUser.phone,
            userId: existingUser.id,
            userStatus: existingUser.userStatus,
          },
        },
      });
    }

    // Continue with normal signup flow...
    // ... rest of signup logic
  } catch (error) {
    // ... error handling
  }
});
```

**Helper Function** (if not exists):
```javascript
async function getUserByDeviceId(deviceId) {
  // Query your database/Redis to find user by deviceId
  // This depends on your data structure
  // Example:
  const user = await redis.get(`device:${deviceId}:user`);
  if (user) {
    return JSON.parse(user);
  }
  return null;
}
```

### 2. Create Restore Account Endpoint

**Endpoint**: `POST /api/auth/restore-account`

**Purpose**: Allow user to restore access to existing account by verifying password.

**Request Body**:
```json
{
  "deviceId": "string (required)",
  "password": "string (required)"
}
```

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "accessToken": "string",
    "refreshToken": "string",
    "user": {
      // Full user object
    }
  }
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "Invalid password",
  "message": "The password you entered is incorrect"
}
```

**Implementation**:
```javascript
router.post('/restore-account', authRateLimiter, async (req, res) => {
  try {
    const { deviceId, password } = req.body;

    if (!deviceId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Device ID and password are required',
      });
    }

    // Find user by deviceId
    const user = await getUserByDeviceId(deviceId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
        message: 'No account found for this device',
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password',
        message: 'The password you entered is incorrect',
      });
    }

    // Generate new tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update last login
    await updateUserLastLogin(user.id);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: sanitizeUser(user), // Remove sensitive data
      },
    });
  } catch (error) {
    logger.error('Restore account error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to restore account',
    });
  }
});
```

### 3. Create Delete Account Endpoint

**Endpoint**: `POST /api/auth/delete-account`

**Purpose**: Delete existing account associated with device. Requires password verification for security.

**Request Body**:
```json
{
  "deviceId": "string (required)",
  "password": "string (required)"
}
```

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Account deleted successfully"
  }
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "Invalid password",
  "message": "The password you entered is incorrect"
}
```

**Implementation**:
```javascript
router.post('/delete-account', authRateLimiter, async (req, res) => {
  try {
    const { deviceId, password } = req.body;

    if (!deviceId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Device ID and password are required',
      });
    }

    // Find user by deviceId
    const user = await getUserByDeviceId(deviceId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
        message: 'No account found for this device',
      });
    }

    // Prevent deletion of customer accounts
    if (user.userStatus === 'erpnext_customer' || user.approvedCustomer) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete customer account',
        message: 'Customer accounts cannot be deleted. Please contact support.',
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password',
        message: 'The password you entered is incorrect',
      });
    }

    // Delete user account
    await deleteUser(user.id);
    
    // Remove device association
    await removeDeviceAssociation(deviceId);

    return res.json({
      success: true,
      data: {
        success: true,
        message: 'Account deleted successfully',
      },
    });
  } catch (error) {
    logger.error('Delete account error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to delete account',
    });
  }
});
```

## Error Codes

Use the following error codes for consistency:

- `DEVICE_CONFLICT`: Device is already associated with an account
- `DEVICE_ALREADY_ASSOCIATED`: Alternative code for device conflict (use one consistently)

## Security Considerations

1. **Password Verification**: Both restore and delete operations require password verification
2. **Customer Protection**: Customer accounts (`erpnext_customer` status or `approvedCustomer: true`) should not be deletable
3. **Rate Limiting**: Apply rate limiting to prevent brute force attacks
4. **Logging**: Log all restore and delete attempts for security auditing

### 4. Create Check Device Status Endpoint

**Endpoint**: `GET /api/auth/check-device?deviceId=<deviceId>`

**Purpose**: Check if a device is already associated with an account before the user starts filling out the signup form.

**Query Parameters**:
- `deviceId` (required): The device identifier

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "hasAccount": true,
    "existingAccount": {
      "username": "pro_whey",
      "email": null,
      "phone": "+963989102744",
      "userId": "000R",
      "userStatus": "registered"
    }
  }
}
```

**Response** (No Account):
```json
{
  "success": true,
  "data": {
    "hasAccount": false
  }
}
```

**Implementation**:
```javascript
router.get('/check-device', async (req, res) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing device ID',
        message: 'Device ID is required',
      });
    }

    // Find user by deviceId
    const user = await getUserByDeviceId(deviceId);
    
    if (!user) {
      return res.json({
        success: true,
        data: {
          hasAccount: false,
        },
      });
    }

    // Return existing account info (without sensitive data)
    return res.json({
      success: true,
      data: {
        hasAccount: true,
        existingAccount: {
          username: user.username,
          email: user.email,
          phone: user.phone,
          userId: user.id,
          userStatus: user.userStatus,
        },
      },
    });
  } catch (error) {
    logger.error('Check device error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to check device status',
    });
  }
});
```

**Security Considerations**:
- This endpoint should be rate-limited to prevent abuse
- It should not require authentication (since user hasn't signed up yet)
- It should only return non-sensitive account information

## Testing

Test the following scenarios:

1. ✅ Signup with new device → Should succeed
2. ✅ Signup with existing device → Should return `DEVICE_CONFLICT`
3. ✅ Restore account with correct password → Should return tokens
4. ✅ Restore account with incorrect password → Should return error
5. ✅ Delete account with correct password → Should delete account
6. ✅ Delete account with incorrect password → Should return error
7. ✅ Delete customer account → Should be prevented
8. ✅ Signup after deleting account → Should succeed
