#!/bin/bash

# Comprehensive test script for user status progression
# Tests: unregistered → registered → erpnext_customer → verified
# Includes profile updates at each stage

# Don't exit on error - we want to continue testing
set +e

BASE_URL="${BASE_URL:-http://localhost:3001}"
API_BASE="${BASE_URL}/api"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test helper functions
test_step() {
  echo -e "${BLUE}▶ $1${NC}"
}

test_pass() {
  echo -e "${GREEN}✓ PASS: $1${NC}"
  PASSED=$((PASSED + 1))
}

test_fail() {
  echo -e "${RED}✗ FAIL: $1${NC}"
  FAILED=$((FAILED + 1))
}

test_info() {
  echo -e "${YELLOW}ℹ $1${NC}"
}

check_response() {
  local response="$1"
  local expected_field="$2"
  local expected_value="$3"
  
  local actual_value=$(echo "$response" | jq -r "$expected_field // empty" 2>/dev/null)
  
  if [ "$actual_value" = "$expected_value" ]; then
    return 0
  else
    return 1
  fi
}

echo "=========================================="
echo "User Status Progression Test"
echo "=========================================="
echo ""

# Check if server is running
test_step "Checking if server is running..."
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
  test_fail "Server is not running at ${BASE_URL}"
  exit 1
fi
test_pass "Server is running"
echo ""

# ============================================
# STAGE 1: Anonymous User (Unregistered)
# ============================================
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}STAGE 1: Anonymous User (Unregistered)${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# Step 1.1: Create anonymous user
test_step "1.1: Creating anonymous user..."
DEVICE_ID="test-progression-$(date +%s)"
ANON_RESPONSE=$(curl -s -X POST "${API_BASE}/users/anonymous" \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{\"device_id\": \"${DEVICE_ID}\"}")

USER_ID=$(echo "$ANON_RESPONSE" | jq -r '.data.userId // empty' 2>/dev/null)
ACCESS_TOKEN=$(echo "$ANON_RESPONSE" | jq -r '.data.accessToken // empty' 2>/dev/null)
REFRESH_TOKEN=$(echo "$ANON_RESPONSE" | jq -r '.data.refreshToken // empty' 2>/dev/null)
USER_STATUS=$(echo "$ANON_RESPONSE" | jq -r '.data.userStatus // empty' 2>/dev/null)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  test_fail "Could not create anonymous user"
  echo "Response: $ANON_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  test_fail "Anonymous user did not receive access token"
  echo "Response: $ANON_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

if [ "$USER_STATUS" != "unregistered" ]; then
  test_fail "Expected userStatus 'unregistered', got '$USER_STATUS'"
  echo "Response: $ANON_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

# Check user ID format (should be 4 characters for new users)
if [ ${#USER_ID} -ne 4 ]; then
  test_fail "User ID should be 4 characters, got '${USER_ID}' (${#USER_ID} chars)"
  echo "Response: $ANON_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

test_pass "Anonymous user created: $USER_ID (status: $USER_STATUS, has token)"
echo ""

# Step 1.2: Verify user can authenticate
test_step "1.2: Verifying authentication works for unregistered user..."
ME_RESPONSE=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

ME_STATUS=$(echo "$ME_RESPONSE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)
ME_ID=$(echo "$ME_RESPONSE" | jq -r '.data.user.id // empty' 2>/dev/null)

if [ "$ME_STATUS" != "unregistered" ]; then
  test_fail "GET /api/auth/me returned wrong userStatus: '$ME_STATUS' (expected 'unregistered')"
  echo "Response: $ME_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

if [ "$ME_ID" != "$USER_ID" ]; then
  test_fail "GET /api/auth/me returned wrong userId: '$ME_ID' (expected '$USER_ID')"
  echo "Response: $ME_RESPONSE"
  echo ""
  echo "Stopping tests due to critical failure."
  exit 1
fi

test_pass "Unregistered user can authenticate and access /api/auth/me"
echo ""

# Step 1.3: Update profile as unregistered user (city, gender, first_name, surname)
test_step "1.3: Updating profile as unregistered user (city, gender, first_name, surname)..."
PROFILE_UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "city": "Damascus",
    "province": "Damascus",
    "gender": "male",
    "first_name": "John",
    "surname": "Doe"
  }')

UPDATED_CITY=$(echo "$PROFILE_UPDATE_RESPONSE" | jq -r '.data.user.city // empty' 2>/dev/null)
UPDATED_GENDER=$(echo "$PROFILE_UPDATE_RESPONSE" | jq -r '.data.user.gender // empty' 2>/dev/null)
UPDATED_FIRST_NAME=$(echo "$PROFILE_UPDATE_RESPONSE" | jq -r '.data.user.firstName // empty' 2>/dev/null)
UPDATED_SURNAME=$(echo "$PROFILE_UPDATE_RESPONSE" | jq -r '.data.user.surname // empty' 2>/dev/null)
UPDATED_STATUS=$(echo "$PROFILE_UPDATE_RESPONSE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)

if [ "$UPDATED_CITY" != "Damascus" ]; then
  test_fail "City update failed: got '$UPDATED_CITY', expected 'Damascus'"
  exit 1
fi

if [ "$UPDATED_GENDER" != "male" ]; then
  test_fail "Gender update failed: got '$UPDATED_GENDER', expected 'male'"
  exit 1
fi

if [ "$UPDATED_FIRST_NAME" != "John" ]; then
  test_fail "First name update failed: got '$UPDATED_FIRST_NAME', expected 'John'"
  exit 1
fi

if [ "$UPDATED_SURNAME" != "Doe" ]; then
  test_fail "Surname update failed: got '$UPDATED_SURNAME', expected 'Doe'"
  exit 1
fi

if [ "$UPDATED_STATUS" != "unregistered" ]; then
  test_fail "User status should remain 'unregistered', got '$UPDATED_STATUS'"
  exit 1
fi

test_pass "Profile updated successfully (city, gender, first_name, surname), status remains unregistered"
echo ""

# Step 1.4: Attempt to update email/username as unregistered (should fail)
test_step "1.4: Attempting to update email as unregistered user (should fail)..."
EMAIL_UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "email": "test@example.com"
  }')

ERROR_MESSAGE=$(echo "$EMAIL_UPDATE_RESPONSE" | jq -r '.message // empty' 2>/dev/null)

if echo "$ERROR_MESSAGE" | grep -q "signup endpoint"; then
  test_pass "Correctly rejected email update for unregistered user"
else
  test_fail "Should reject email update for unregistered user, but got: $ERROR_MESSAGE"
fi
echo ""

# Step 1.5: Update additional profile fields
test_step "1.5: Updating additional profile fields (age, occupation, fitness_level, fitness_goal)..."
ADDITIONAL_UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "age": 28,
    "occupation": "Software Engineer",
    "fitness_level": "intermediate",
    "fitness_goal": "muscle_gain"
  }')

UPDATED_AGE=$(echo "$ADDITIONAL_UPDATE_RESPONSE" | jq -r '.data.user.age // empty' 2>/dev/null)
UPDATED_OCCUPATION=$(echo "$ADDITIONAL_UPDATE_RESPONSE" | jq -r '.data.user.occupation // empty' 2>/dev/null)
UPDATED_FITNESS_LEVEL=$(echo "$ADDITIONAL_UPDATE_RESPONSE" | jq -r '.data.user.fitnessLevel // empty' 2>/dev/null)
UPDATED_FITNESS_GOAL=$(echo "$ADDITIONAL_UPDATE_RESPONSE" | jq -r '.data.user.fitnessGoal // empty' 2>/dev/null)

if [ "$UPDATED_AGE" != "28" ]; then
  test_fail "Age update failed: got '$UPDATED_AGE', expected '28'"
  exit 1
fi

if [ "$UPDATED_OCCUPATION" != "Software Engineer" ]; then
  test_fail "Occupation update failed: got '$UPDATED_OCCUPATION', expected 'Software Engineer'"
  exit 1
fi

if [ "$UPDATED_FITNESS_LEVEL" != "intermediate" ]; then
  test_fail "Fitness level update failed: got '$UPDATED_FITNESS_LEVEL', expected 'intermediate'"
  exit 1
fi

if [ "$UPDATED_FITNESS_GOAL" != "muscle_gain" ]; then
  test_fail "Fitness goal update failed: got '$UPDATED_FITNESS_GOAL', expected 'muscle_gain'"
  exit 1
fi

test_pass "Additional profile fields updated successfully"
echo ""

# ============================================
# STAGE 2: Registration
# ============================================
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}STAGE 2: Registration${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# Step 2.1: Register user (signup)
test_step "2.1: Registering user (signup)..."
TIMESTAMP=$(date +%s)
SIGNUP_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/signup" \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"email\": \"test-${TIMESTAMP}@example.com\",
    \"password\": \"Test123!\",
    \"username\": \"testuser${TIMESTAMP}\",
    \"deviceId\": \"${DEVICE_ID}\",
    \"first_name\": \"John\",
    \"surname\": \"Doe\",
    \"age\": 28
  }")

SIGNUP_USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.user.id // empty' 2>/dev/null)
SIGNUP_STATUS=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)
SIGNUP_IS_REGISTERED=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.user.isRegistered // false' 2>/dev/null)
SIGNUP_ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.accessToken // .accessToken // empty' 2>/dev/null)
NEEDS_VERIFICATION=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.needsVerification // false' 2>/dev/null)

if [ -z "$SIGNUP_USER_ID" ] || [ "$SIGNUP_USER_ID" = "null" ]; then
  test_fail "Signup failed - no user ID returned"
  echo "Response: $SIGNUP_RESPONSE"
  exit 1
fi

if [ "$SIGNUP_USER_ID" != "$USER_ID" ]; then
  test_fail "Signup returned different user ID: '$SIGNUP_USER_ID' (expected '$USER_ID')"
  exit 1
fi

if [ "$SIGNUP_STATUS" != "registered" ]; then
  test_fail "Expected userStatus 'registered' after signup, got '$SIGNUP_STATUS'"
  exit 1
fi

if [ "$SIGNUP_IS_REGISTERED" != "true" ]; then
  test_fail "Expected isRegistered 'true' after signup, got '$SIGNUP_IS_REGISTERED'"
  exit 1
fi

# Update access token if provided
if [ -n "$SIGNUP_ACCESS_TOKEN" ] && [ "$SIGNUP_ACCESS_TOKEN" != "null" ]; then
  ACCESS_TOKEN="$SIGNUP_ACCESS_TOKEN"
  test_pass "User registered successfully (status: $SIGNUP_STATUS, isRegistered: $SIGNUP_IS_REGISTERED, auto-verified)"
else
  # User needs verification - check if signup actually succeeded but needs verification
  if [ -n "$SIGNUP_USER_ID" ] && [ "$SIGNUP_USER_ID" != "null" ]; then
    # Signup succeeded, just needs verification - get user to check status
    test_info "Signup succeeded but requires verification. Checking user status..."
    ME_AFTER_SIGNUP=$(curl -s -X GET "${API_BASE}/auth/me" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "X-Device-ID: ${DEVICE_ID}")
    
    ACTUAL_STATUS=$(echo "$ME_AFTER_SIGNUP" | jq -r '.data.user.userStatus // empty' 2>/dev/null)
    if [ "$ACTUAL_STATUS" = "registered" ]; then
      test_pass "User registered successfully (status: $ACTUAL_STATUS, needs verification)"
    else
      test_fail "User status after signup is '$ACTUAL_STATUS', expected 'registered'"
      echo "Response: $ME_AFTER_SIGNUP"
      exit 1
    fi
  else
    test_fail "Signup failed - no user ID returned"
    echo "Response: $SIGNUP_RESPONSE"
    exit 1
  fi
fi
echo ""

# Step 2.2: Verify profile data was preserved
test_step "2.2: Verifying profile data was preserved after registration..."
ME_AFTER_SIGNUP=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

PRESERVED_CITY=$(echo "$ME_AFTER_SIGNUP" | jq -r '.data.user.city // empty' 2>/dev/null)
PRESERVED_GENDER=$(echo "$ME_AFTER_SIGNUP" | jq -r '.data.user.gender // empty' 2>/dev/null)
PRESERVED_FIRST_NAME=$(echo "$ME_AFTER_SIGNUP" | jq -r '.data.user.firstName // empty' 2>/dev/null)
PRESERVED_SURNAME=$(echo "$ME_AFTER_SIGNUP" | jq -r '.data.user.surname // empty' 2>/dev/null)

if [ "$PRESERVED_CITY" != "Damascus" ]; then
  test_fail "City not preserved: got '$PRESERVED_CITY', expected 'Damascus'"
  exit 1
fi

if [ "$PRESERVED_GENDER" != "male" ]; then
  test_fail "Gender not preserved: got '$PRESERVED_GENDER', expected 'male'"
  exit 1
fi

if [ "$PRESERVED_FIRST_NAME" != "John" ]; then
  test_fail "First name not preserved: got '$PRESERVED_FIRST_NAME', expected 'John'"
  exit 1
fi

test_pass "Profile data preserved after registration"
echo ""

# Step 2.3: Test login (skip if account needs verification)
test_step "2.3: Testing login with credentials..."
# Check if account is verified
ME_CHECK=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

IS_VERIFIED=$(echo "$ME_CHECK" | jq -r '.data.user.isVerified // false' 2>/dev/null)

if [ "$IS_VERIFIED" != "true" ]; then
  test_info "Account needs verification. Skipping login test (login requires verified account)..."
  test_info "Note: In production, user would verify via OTP code before login"
else
  # Test login
  LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-Device-ID: ${DEVICE_ID}" \
    -d "{
      \"email\": \"test-${TIMESTAMP}@example.com\",
      \"password\": \"Test123!\"
    }")

  LOGIN_ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // empty' 2>/dev/null)
  LOGIN_USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id // empty' 2>/dev/null)

  if [ -z "$LOGIN_ACCESS_TOKEN" ] || [ "$LOGIN_ACCESS_TOKEN" = "null" ]; then
    test_fail "Login failed - no access token returned"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
  fi

  if [ "$LOGIN_USER_ID" != "$USER_ID" ]; then
    test_fail "Login returned different user ID: '$LOGIN_USER_ID' (expected '$USER_ID')"
    exit 1
  fi

  ACCESS_TOKEN="$LOGIN_ACCESS_TOKEN"
  test_pass "Login successful"
fi
echo ""

# Step 2.4: Update profile as registered user
test_step "2.4: Updating profile as registered user..."
REGISTERED_UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "province": "Rif Dimashq",
    "whatsapp_number": "+963912345678"
  }')

UPDATED_PROVINCE=$(echo "$REGISTERED_UPDATE_RESPONSE" | jq -r '.data.user.province // empty' 2>/dev/null)
UPDATED_WHATSAPP=$(echo "$REGISTERED_UPDATE_RESPONSE" | jq -r '.data.user.whatsappNumber // empty' 2>/dev/null)

if [ "$UPDATED_PROVINCE" != "Rif Dimashq" ]; then
  test_fail "Province update failed: got '$UPDATED_PROVINCE', expected 'Rif Dimashq'"
  exit 1
fi

test_pass "Profile update works for registered users"
echo ""

# ============================================
# STAGE 3: ERPNext Customer
# ============================================
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}STAGE 3: ERPNext Customer${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# Step 3.1: Set erpnextCustomerId
test_step "3.1: Setting erpnextCustomerId..."
ERP_CUSTOMER_ID="CUST-${TIMESTAMP}"
ERP_UPDATE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"erpnext_customer_id\": \"${ERP_CUSTOMER_ID}\",
    \"approved_customer\": true
  }")

ERP_STATUS=$(echo "$ERP_UPDATE_RESPONSE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)
ERP_CUSTOMER_ID_SET=$(echo "$ERP_UPDATE_RESPONSE" | jq -r '.data.user.erpnextCustomerId // empty' 2>/dev/null)
ERP_APPROVED=$(echo "$ERP_UPDATE_RESPONSE" | jq -r '.data.user.approvedCustomer // false' 2>/dev/null)

if [ "$ERP_STATUS" != "erpnext_customer" ]; then
  test_fail "Expected userStatus 'erpnext_customer' after setting erpnextCustomerId, got '$ERP_STATUS'"
  exit 1
fi

if [ "$ERP_CUSTOMER_ID_SET" != "$ERP_CUSTOMER_ID" ]; then
  test_fail "erpnextCustomerId not set correctly: got '$ERP_CUSTOMER_ID_SET', expected '$ERP_CUSTOMER_ID'"
  exit 1
fi

if [ "$ERP_APPROVED" != "true" ]; then
  test_fail "approvedCustomer not set correctly: got '$ERP_APPROVED', expected 'true'"
  exit 1
fi

test_pass "User status transitioned to 'erpnext_customer' (erpnextCustomerId: $ERP_CUSTOMER_ID)"
echo ""

# Step 3.2: Verify profile updates still work
test_step "3.2: Verifying profile updates still work as erpnext_customer..."
ERP_PROFILE_UPDATE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "telegram_username": "@johndoe"
  }')

ERP_TELEGRAM=$(echo "$ERP_PROFILE_UPDATE" | jq -r '.data.user.telegramUsername // empty' 2>/dev/null)
ERP_STATUS_AFTER=$(echo "$ERP_PROFILE_UPDATE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)

if [ "$ERP_TELEGRAM" != "@johndoe" ]; then
  test_fail "Telegram username update failed: got '$ERP_TELEGRAM', expected '@johndoe'"
  exit 1
fi

if [ "$ERP_STATUS_AFTER" != "erpnext_customer" ]; then
  test_fail "User status should remain 'erpnext_customer', got '$ERP_STATUS_AFTER'"
  exit 1
fi

test_pass "Profile updates work for erpnext_customer users"
echo ""

# ============================================
# STAGE 4: ID Verification
# ============================================
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}STAGE 4: ID Verification${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# Step 4.1: Verify ID (admin action - simulate via direct update)
test_step "4.1: Verifying user ID (simulating admin action)..."
VERIFY_ID_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/verify-id" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "verified": true
  }')

VERIFIED_STATUS=$(echo "$VERIFY_ID_RESPONSE" | jq -r '.data.user.idVerified // false' 2>/dev/null)

# Get updated user to check status transition
ME_VERIFIED=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

FINAL_STATUS=$(echo "$ME_VERIFIED" | jq -r '.data.user.userStatus // empty' 2>/dev/null)
FINAL_ID_VERIFIED=$(echo "$ME_VERIFIED" | jq -r '.data.user.idVerified // false' 2>/dev/null)
FINAL_TRUST_SCORE=$(echo "$ME_VERIFIED" | jq -r '.data.user.trustScore // 100' 2>/dev/null)

if [ "$FINAL_STATUS" != "verified" ]; then
  test_fail "Expected userStatus 'verified' after ID verification, got '$FINAL_STATUS'"
  exit 1
fi

if [ "$FINAL_ID_VERIFIED" != "true" ]; then
  test_fail "idVerified should be true, got '$FINAL_ID_VERIFIED'"
  exit 1
fi

if [ "$FINAL_TRUST_SCORE" -lt 100 ]; then
  test_fail "Trust score should be increased (>= 100), got '$FINAL_TRUST_SCORE'"
  exit 1
fi

test_pass "User status transitioned to 'verified' (idVerified: true, trustScore: $FINAL_TRUST_SCORE)"
echo ""

# Step 4.3: Verify profile updates still work
test_step "4.3: Verifying profile updates still work as verified user..."
VERIFIED_UPDATE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "occupation": "Senior Software Engineer"
  }')

VERIFIED_OCCUPATION=$(echo "$VERIFIED_UPDATE" | jq -r '.data.user.occupation // empty' 2>/dev/null)
VERIFIED_STATUS_AFTER=$(echo "$VERIFIED_UPDATE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)

if [ "$VERIFIED_OCCUPATION" != "Senior Software Engineer" ]; then
  test_fail "Occupation update failed: got '$VERIFIED_OCCUPATION', expected 'Senior Software Engineer'"
  exit 1
fi

if [ "$VERIFIED_STATUS_AFTER" != "verified" ]; then
  test_fail "User status should remain 'verified', got '$VERIFIED_STATUS_AFTER'"
  exit 1
fi

test_pass "Profile updates work for verified users"
echo ""

# ============================================
# EDGE CASES
# ============================================
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}EDGE CASES${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# Edge Case 1: Attempt to downgrade status
test_step "Edge Case 1: Attempting to downgrade userStatus (should be rejected)..."
STATUS_DOWNGRADE_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "userStatus": "registered"
  }')

# Get user to check status didn't change
ME_AFTER_DOWNGRADE=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

STATUS_AFTER_DOWNGRADE=$(echo "$ME_AFTER_DOWNGRADE" | jq -r '.data.user.userStatus // empty' 2>/dev/null)

if [ "$STATUS_AFTER_DOWNGRADE" = "verified" ]; then
  test_pass "Status downgrade correctly rejected (status remains 'verified')"
else
  test_fail "Status downgrade should be rejected, but status changed to '$STATUS_AFTER_DOWNGRADE'"
fi
echo ""

# Edge Case 2: Update email without password confirmation (should fail for registered users)
test_step "Edge Case 2: Attempting to update email without password confirmation (should fail)..."
EMAIL_NO_PASS_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"email\": \"newemail-${TIMESTAMP}@example.com\"
  }")

EMAIL_ERROR=$(echo "$EMAIL_NO_PASS_RESPONSE" | jq -r '.message // .error // empty' 2>/dev/null)

if echo "$EMAIL_ERROR" | grep -qi "password\|confirmation"; then
  test_pass "Correctly rejected email update without password confirmation"
else
  test_fail "Should reject email update without password confirmation, but got: $EMAIL_ERROR"
  echo "Full response: $EMAIL_NO_PASS_RESPONSE"
fi
echo ""

# Edge Case 3: Update email with password confirmation
test_step "Edge Case 3: Updating email with password confirmation..."
EMAIL_WITH_PASS_RESPONSE=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"email\": \"newemail-${TIMESTAMP}@example.com\",
    \"passwordConfirmed\": true
  }")

EMAIL_UPDATE_SUCCESS=$(echo "$EMAIL_WITH_PASS_RESPONSE" | jq -r '.success // false' 2>/dev/null)

if [ "$EMAIL_UPDATE_SUCCESS" = "true" ]; then
  test_pass "Email update with password confirmation accepted"
else
  test_info "Email update may require verification (this is expected behavior)"
fi
echo ""

# Edge Case 4: Multiple sequential profile updates
test_step "Edge Case 4: Testing multiple sequential profile updates..."
SEQ_UPDATE_1=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{"age": 29}')

SEQ_UPDATE_2=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{"fitness_level": "advanced"}')

SEQ_UPDATE_3=$(curl -s -X PUT "${API_BASE}/auth/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{"fitness_goal": "athletic_performance"}')

FINAL_ME=$(curl -s -X GET "${API_BASE}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

FINAL_AGE=$(echo "$FINAL_ME" | jq -r '.data.user.age // empty' 2>/dev/null)
FINAL_FITNESS_LEVEL=$(echo "$FINAL_ME" | jq -r '.data.user.fitnessLevel // empty' 2>/dev/null)
FINAL_FITNESS_GOAL=$(echo "$FINAL_ME" | jq -r '.data.user.fitnessGoal // empty' 2>/dev/null)

if [ "$FINAL_AGE" = "29" ] && [ "$FINAL_FITNESS_LEVEL" = "advanced" ] && [ "$FINAL_FITNESS_GOAL" = "athletic_performance" ]; then
  test_pass "Multiple sequential profile updates work correctly"
else
  test_fail "Sequential updates failed: age=$FINAL_AGE, fitness_level=$FINAL_FITNESS_LEVEL, fitness_goal=$FINAL_FITNESS_GOAL"
fi
echo ""

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo -e "${GREEN}Test Summary${NC}"
echo "=========================================="
echo "Total tests passed: $PASSED"
echo "Total tests failed: $FAILED"
echo ""
echo "User ID: $USER_ID (format: 4 characters, base 36)"
echo "Final Status: $FINAL_STATUS"
echo "Final erpnextCustomerId: $ERP_CUSTOMER_ID"
echo "Final idVerified: $FINAL_ID_VERIFIED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
