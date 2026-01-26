# Backend Registration Flow Change

## Change Summary

**Remove phone/email verification requirement from user registration. Verification will only be required when users become customers (erpnext_customer status).**

## Current Behavior (from plan)

The current `/api/auth/signup` endpoint:
- Requires verification for all users with phone or email
- Sets `needsVerification: true` when phone/email is provided
- Only returns tokens if user is verified (Google OAuth users)
- Sends OTP codes for phone/email verification

## Required Change

### 1. Remove Verification Requirement from Signup

**File**: `src/routes/auth.js` (or equivalent signup route)

**Change**: Modify the signup endpoint to:
- **NOT require verification** for regular user registration
- **Always return tokens** after successful registration (no `needsVerification` check)
- **Do NOT send OTP codes** during registration
- Set `isVerified: true` for all registered users (verification happens later at customer stage)

**Code Change**:
```javascript
// BEFORE (current):
const needsVerification = !googleId && (phone || email);
const user = await createUser({
  // ...
  isVerified: !needsVerification, // Only Google OAuth users are verified
  verificationMethod: method,
});

// Send verification code if needed
if (needsVerification && phone && method) {
  await sendVerificationCode(user.id, phone, method);
}

// Generate tokens if verified
let tokens = null;
if (user.isVerified) {
  tokens = { accessToken, refreshToken };
}

return res.json({
  success: true,
  data: {
    user: { ... },
    ...(tokens || {}),
    needsVerification: !user.isVerified,
  },
});

// AFTER (required):
// Remove verification requirement - all registered users are verified
const user = await createUser({
  // ...
  isVerified: true, // All registered users are verified (no verification at registration)
  // Remove verificationMethod - not needed at registration
});

// DO NOT send verification codes during registration
// Verification will happen later when user becomes a customer

// Always generate tokens for registered users
const tokens = {
  accessToken: generateAccessToken(payload),
  refreshToken: generateRefreshToken(payload),
};

return res.json({
  success: true,
  data: {
    user: { ... },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    // Remove needsVerification - not needed
  },
});
```

### 2. Move Verification to Customer Registration

**Note**: Phone/email verification should be implemented in the customer registration/upgrade flow (when `userStatus` changes from `registered` to `erpnext_customer`), not during initial user registration.

### 3. Accept Profile Fields in Signup

The signup endpoint should accept and store these profile fields (in snake_case):
- `first_name` (required)
- `surname` (required)
- `phone` (required)
- `province` (required)
- `city` (required)
- `district` (optional)
- `town` (optional)
- `gender` (required)
- `age` (optional, number)

These fields should be:
- Stored in the user profile
- Returned in the signup response user object
- Preserved when converting anonymous user to registered user

## Testing

After implementing these changes, the signup endpoint should:
1. ✅ Accept registration without requiring verification
2. ✅ Return `accessToken` and `refreshToken` in response
3. ✅ Return full user object with all profile fields
4. ✅ Set `isVerified: true` for all registered users
5. ✅ NOT send OTP codes during registration

## Summary

- **Registration**: No verification required, always returns tokens
- **Customer Upgrade**: Verification required (to be implemented in customer registration flow)
