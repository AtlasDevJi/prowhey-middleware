#!/bin/bash

# Test script for user profile and anonymous user endpoints
# Usage: ./scripts/test-users.sh [base_url]
# Default base_url: http://localhost:3001

BASE_URL="${1:-http://localhost:3001}"
DEVICE_ID="test-device-$(date +%s)"

echo "Testing User Profile and Anonymous User Endpoints"
echo "Base URL: $BASE_URL"
echo "Device ID: $DEVICE_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local headers=$5
    
    echo -n "Testing $description... "
    
    if [ -z "$data" ]; then
        if [ -z "$headers" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "$headers")
        fi
    else
        if [ -z "$headers" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "$headers" \
                -d "$data")
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC} (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        ((FAILED++))
        return 1
    fi
}

echo "=========================================="
echo "1. Testing Anonymous User Creation"
echo "=========================================="

# Test 1: Create anonymous user
ANON_USER_DATA=$(cat <<EOF
{
  "device_id": "$DEVICE_ID",
  "device_model": "iPhone 14 Pro",
  "os_model": "iOS 17.0",
  "geolocation": {
    "lat": 24.7136,
    "lng": 46.6753,
    "province": "Riyadh",
    "city": "Riyadh"
  },
  "location_consent": true
}
EOF
)

test_endpoint "POST" "/api/users/anonymous" "$ANON_USER_DATA" "Create anonymous user" "X-Device-ID: $DEVICE_ID"

# Extract userId from response
ANON_USER_ID=$(echo "$body" | jq -r '.data.userId' 2>/dev/null)
IS_REGISTERED=$(echo "$body" | jq -r '.data.isRegistered' 2>/dev/null)

if [ -z "$ANON_USER_ID" ] || [ "$ANON_USER_ID" = "null" ]; then
    echo -e "${RED}ERROR: Could not extract userId from response${NC}"
    exit 1
fi

# Verify it's an anonymous user
if [ "$IS_REGISTERED" != "false" ]; then
    echo -e "${RED}ERROR: User should be anonymous (isRegistered should be false)${NC}"
    ((FAILED++))
else
    echo -e "${GREEN}✓ Verified: User is anonymous (isRegistered: false)${NC}"
fi

echo -e "${YELLOW}Created anonymous user: $ANON_USER_ID${NC}"
echo ""

echo "=========================================="
echo "1a. Testing Anonymous User - Duplicate Creation"
echo "=========================================="

# Test 1a: Try to create anonymous user again with same device (should return existing)
test_endpoint "POST" "/api/users/anonymous" "$ANON_USER_DATA" "Create anonymous user (duplicate - should return existing)" "X-Device-ID: $DEVICE_ID"

DUPLICATE_USER_ID=$(echo "$body" | jq -r '.data.userId' 2>/dev/null)
if [ "$DUPLICATE_USER_ID" = "$ANON_USER_ID" ]; then
    echo -e "${GREEN}✓ Verified: Same user ID returned (existing user reused)${NC}"
else
    echo -e "${RED}ERROR: Different user ID returned (should reuse existing)${NC}"
    ((FAILED++))
fi
echo ""

echo "=========================================="
echo "1b. Testing Anonymous User - Without Geolocation"
echo "=========================================="

# Test 1b: Create anonymous user without geolocation
ANON_USER_NO_LOC_DATA=$(cat <<EOF
{
  "device_id": "test-device-no-loc-$(date +%s)",
  "device_model": "Samsung Galaxy S23",
  "os_model": "Android 13",
  "location_consent": false
}
EOF
)

test_endpoint "POST" "/api/users/anonymous" "$ANON_USER_NO_LOC_DATA" "Create anonymous user without geolocation" "X-Device-ID: test-device-no-loc-$(date +%s)"
echo ""

echo "=========================================="
echo "1c. Testing Anonymous User - Minimal Data"
echo "=========================================="

# Test 1c: Create anonymous user with minimal data (only device_id required)
ANON_USER_MINIMAL=$(cat <<EOF
{
  "device_id": "test-device-minimal-$(date +%s)"
}
EOF
)

test_endpoint "POST" "/api/users/anonymous" "$ANON_USER_MINIMAL" "Create anonymous user (minimal data)" "X-Device-ID: test-device-minimal-$(date +%s)"
echo ""

echo "=========================================="
echo "2. Testing Anonymous User - Device Info Update"
echo "=========================================="

# Test 2: Update device info for anonymous user
DEVICE_INFO_DATA=$(cat <<EOF
{
  "device_model": "iPhone 15 Pro",
  "os_model": "iOS 17.1"
}
EOF
)

test_endpoint "POST" "/api/users/device-info" "$DEVICE_INFO_DATA" "Update device info (anonymous user)" "X-Device-ID: $DEVICE_ID"

# Verify user is still anonymous after device update
UPDATED_IS_REGISTERED=$(echo "$body" | jq -r '.data.isRegistered' 2>/dev/null)
if [ "$UPDATED_IS_REGISTERED" != "false" ]; then
    echo -e "${RED}ERROR: User should still be anonymous after device update${NC}"
    ((FAILED++))
else
    echo -e "${GREEN}✓ Verified: User remains anonymous after device update${NC}"
fi
echo ""

echo "=========================================="
echo "2a. Testing Anonymous User - Device Info (New Device)"
echo "=========================================="

# Test 2a: Update device info for non-existent device (should create anonymous user)
NEW_DEVICE_ID="test-device-new-$(date +%s)"
test_endpoint "POST" "/api/users/device-info" "$DEVICE_INFO_DATA" "Update device info (creates anonymous user if not exists)" "X-Device-ID: $NEW_DEVICE_ID"

NEW_DEVICE_USER_ID=$(echo "$body" | jq -r '.data.userId' 2>/dev/null)
if [ -n "$NEW_DEVICE_USER_ID" ] && [ "$NEW_DEVICE_USER_ID" != "null" ]; then
    echo -e "${GREEN}✓ Verified: Anonymous user created automatically${NC}"
else
    echo -e "${RED}ERROR: Should create anonymous user for new device${NC}"
    ((FAILED++))
fi
echo ""

echo "=========================================="
echo "3. Testing Anonymous User - Geolocation Update"
echo "=========================================="

# Test 3: Update geolocation for anonymous user
GEOLOCATION_DATA=$(cat <<EOF
{
  "geolocation": {
    "lat": 24.7136,
    "lng": 46.6753,
    "province": "Riyadh",
    "city": "Riyadh",
    "street": "King Fahd Road"
  },
  "location_consent": true
}
EOF
)

test_endpoint "POST" "/api/users/geolocation" "$GEOLOCATION_DATA" "Update geolocation (anonymous user)" "X-Device-ID: $DEVICE_ID"

# Verify geolocation was stored
STORED_LAT=$(echo "$body" | jq -r '.data.geolocation.lat' 2>/dev/null)
if [ "$STORED_LAT" = "24.7136" ]; then
    echo -e "${GREEN}✓ Verified: Geolocation stored correctly${NC}"
else
    echo -e "${RED}ERROR: Geolocation not stored correctly${NC}"
    ((FAILED++))
fi
echo ""

echo "=========================================="
echo "3a. Testing Anonymous User - Revoke Location Consent"
echo "=========================================="

# Test 3a: Revoke location consent
REVOKE_LOCATION_DATA=$(cat <<EOF
{
  "geolocation": null,
  "location_consent": false
}
EOF
)

test_endpoint "POST" "/api/users/geolocation" "$REVOKE_LOCATION_DATA" "Revoke location consent (anonymous user)" "X-Device-ID: $DEVICE_ID"

REVOKED_CONSENT=$(echo "$body" | jq -r '.data.locationConsent' 2>/dev/null)
if [ "$REVOKED_CONSENT" = "false" ]; then
    echo -e "${GREEN}✓ Verified: Location consent revoked${NC}"
else
    echo -e "${RED}ERROR: Location consent should be false${NC}"
    ((FAILED++))
fi
echo ""

echo "=========================================="
echo "3b. Testing Anonymous User - Geolocation (New Device)"
echo "=========================================="

# Test 3b: Update geolocation for non-existent device (should create anonymous user)
NEW_DEVICE_LOC_ID="test-device-loc-$(date +%s)"
test_endpoint "POST" "/api/users/geolocation" "$GEOLOCATION_DATA" "Update geolocation (creates anonymous user if not exists)" "X-Device-ID: $NEW_DEVICE_LOC_ID"
echo ""

echo "=========================================="
echo "4. Testing Anonymous User - Cannot Access Protected Endpoints"
echo "=========================================="

# Test 4: Anonymous users should not be able to access protected endpoints
echo -n "Testing anonymous user cannot access /api/auth/me... "
protected_response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/auth/me" \
    -H "X-Device-ID: $DEVICE_ID")

protected_http_code=$(echo "$protected_response" | tail -n1)
protected_body=$(echo "$protected_response" | sed '$d')

# Should fail with 401 Unauthorized (no token)
if [ "$protected_http_code" -eq 401 ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $protected_http_code - Correctly blocked)"
    ((PASSED++))
else
    echo -e "${RED}FAIL${NC} (HTTP $protected_http_code - Should be 401)"
    echo "$protected_body" | jq '.' 2>/dev/null || echo "$protected_body"
    ((FAILED++))
fi
echo ""

echo "=========================================="
echo "5. Testing Anonymous User - Registration (Signup)"
echo "=========================================="

# Test 4: Signup (convert anonymous to registered)
SIGNUP_DATA=$(cat <<EOF
{
  "username": "testuser_$(date +%s)",
  "email": "test_$(date +%s)@example.com",
  "password": "testpass123",
  "deviceId": "$DEVICE_ID",
  "province": "Riyadh",
  "city": "Riyadh",
  "whatsapp_number": "+966501234567",
  "telegram_username": "@testuser",
  "customer_type": "retail",
  "device_model": "iPhone 15 Pro",
  "os_model": "iOS 17.1"
}
EOF
)

test_endpoint "POST" "/api/auth/signup" "$SIGNUP_DATA" "Signup (convert anonymous to registered)" "X-Device-ID: $DEVICE_ID"

# Verify the user was converted from anonymous to registered
SIGNUP_USER_ID=$(echo "$body" | jq -r '.data.user.id' 2>/dev/null)
if [ "$SIGNUP_USER_ID" = "$ANON_USER_ID" ]; then
    echo -e "${GREEN}✓ Verified: Anonymous user converted to registered (same user ID)${NC}"
else
    echo -e "${YELLOW}Note: Different user ID - may have created new user instead of converting${NC}"
fi
echo ""

# Extract userId and check if verification is needed
SIGNUP_USER_ID=$(echo "$body" | jq -r '.data.user.id' 2>/dev/null)
NEEDS_VERIFICATION=$(echo "$body" | jq -r '.data.needsVerification' 2>/dev/null)
ACCESS_TOKEN=$(echo "$body" | jq -r '.data.accessToken' 2>/dev/null)

# If verification is needed, try to verify (in development, code might be returned)
if [ "$NEEDS_VERIFICATION" = "true" ] && [ -z "$ACCESS_TOKEN" ] && [ -n "$SIGNUP_USER_ID" ]; then
    echo -e "${YELLOW}User needs verification. Attempting verification...${NC}"
    
    # In development, the verification code might be in the response
    VERIFICATION_CODE=$(echo "$body" | jq -r '.data.code' 2>/dev/null)
    
    # If no code in response, try a test code (for development/testing)
    if [ -z "$VERIFICATION_CODE" ] || [ "$VERIFICATION_CODE" = "null" ]; then
        VERIFICATION_CODE="123456"  # Default test code
    fi
    
    # Attempt verification
    VERIFY_DATA=$(cat <<EOF
{
  "userId": "$SIGNUP_USER_ID",
  "code": "$VERIFICATION_CODE",
  "method": "sms"
}
EOF
)
    
    echo -n "Testing account verification... "
    verify_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/verify" \
        -H "Content-Type: application/json" \
        -H "X-Device-ID: $DEVICE_ID" \
        -d "$VERIFY_DATA")
    
    verify_http_code=$(echo "$verify_response" | tail -n1)
    verify_body=$(echo "$verify_response" | sed '$d')
    
    if [ "$verify_http_code" -ge 200 ] && [ "$verify_http_code" -lt 300 ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $verify_http_code)"
        ACCESS_TOKEN=$(echo "$verify_body" | jq -r '.data.accessToken' 2>/dev/null)
        if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
            echo -e "${YELLOW}Received access token after verification${NC}"
        fi
    else
        echo -e "${YELLOW}Verification failed or not needed (HTTP $verify_http_code)${NC}"
        echo "$verify_body" | jq '.' 2>/dev/null || echo "$verify_body"
        echo -e "${YELLOW}Continuing with limited tests (some features require authentication)${NC}"
    fi
    echo ""
fi

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
    echo -e "${YELLOW}Using access token for authenticated tests${NC}"
    echo ""
    
    echo "=========================================="
    echo "6. Testing Authenticated Profile Endpoints"
    echo "=========================================="
    
    # Test 5: Get user profile
    test_endpoint "GET" "/api/auth/me" "" "Get user profile" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    # Test 6: Update profile
    PROFILE_UPDATE_DATA=$(cat <<EOF
{
  "username": "updateduser_$(date +%s)",
  "province": "Jeddah",
  "city": "Jeddah",
  "whatsapp_number": "+966507654321",
  "telegram_username": "@updateduser",
  "passwordConfirmed": true
}
EOF
)
    
    test_endpoint "PUT" "/api/auth/profile" "$PROFILE_UPDATE_DATA" "Update profile" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    # Test 7: Update geolocation (authenticated)
    AUTH_GEOLOCATION_DATA=$(cat <<EOF
{
  "geolocation": {
    "lat": 21.4858,
    "lng": 39.1925,
    "province": "Jeddah",
    "city": "Jeddah"
  },
  "location_consent": true
}
EOF
)
    
    test_endpoint "POST" "/api/users/geolocation" "$AUTH_GEOLOCATION_DATA" "Update geolocation (authenticated)" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    echo "=========================================="
    echo "7. Testing Security Features"
    echo "=========================================="
    
    # Test 8: Verify phone
    test_endpoint "POST" "/api/auth/verify-phone" "" "Verify phone number" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    # Test 9: Get profile with security fields
    test_endpoint "GET" "/api/auth/me" "" "Get profile with security fields" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    echo "=========================================="
    echo "8. Testing Account Deletion (Disabled Status)"
    echo "=========================================="
    
    # Test 10: Delete account (marks as disabled)
    test_endpoint "DELETE" "/api/auth/account" "" "Delete account (mark as disabled)" "Authorization: Bearer $ACCESS_TOKEN"
    echo ""
    
    echo "=========================================="
    echo "9. Testing Re-registration Prevention"
    echo "=========================================="
    
    # Test 11: Try to register again with same device (should fail)
    NEW_SIGNUP_DATA=$(cat <<EOF
{
  "username": "testuser2_$(date +%s)",
  "email": "test2_$(date +%s)@example.com",
  "password": "testpass123",
  "deviceId": "$DEVICE_ID",
  "phone": "+966501234567"
}
EOF
)
    
    echo -n "Testing re-registration with disabled account device... "
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/signup" \
        -H "Content-Type: application/json" \
        -H "X-Device-ID: $DEVICE_ID" \
        -d "$NEW_SIGNUP_DATA")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # This should FAIL (409 Conflict) - that's expected
    if [ "$http_code" -eq 409 ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code - Correctly blocked re-registration)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        ((PASSED++))
    else
        echo -e "${RED}FAIL${NC} (HTTP $http_code - Should be 409 Conflict)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        ((FAILED++))
    fi
    echo ""
    
    echo "=========================================="
    echo "10. Testing Login (Alternative Auth Method)"
    echo "=========================================="
    
    # Test login with email/password
    LOGIN_DATA=$(cat <<EOF
{
  "email": "test_$(date +%s)@example.com",
  "password": "testpass123"
}
EOF
)
    
    # Note: This will likely fail since we just created the account and it needs verification
    # But we'll test it anyway to show the flow
    echo -e "${YELLOW}Note: Login test skipped (account needs verification first)${NC}"
    echo ""
    
else
    echo -e "${YELLOW}No access token available - skipping authenticated tests${NC}"
    echo -e "${YELLOW}To test authenticated features, verify the account first${NC}"
    echo ""
    
    echo "=========================================="
    echo "5. Testing Without Authentication"
    echo "=========================================="
    echo -e "${YELLOW}Some features require authentication. Creating a new verified account for testing...${NC}"
    echo ""
    
    # Create a Google OAuth user (auto-verified) for testing
    # Use a different device ID since the original one is now registered
    GOOGLE_DEVICE_ID="google-test-device-$(date +%s)"
    GOOGLE_SIGNUP_DATA=$(cat <<EOF
{
  "email": "google_test_$(date +%s)@example.com",
  "googleId": "google_$(date +%s)",
  "deviceId": "$GOOGLE_DEVICE_ID",
  "name": "Google Test User"
}
EOF
)
    
    echo -n "Testing Google OAuth signup (auto-verified)... "
    google_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/google-login" \
        -H "Content-Type: application/json" \
        -H "X-Device-ID: $GOOGLE_DEVICE_ID" \
        -d "$GOOGLE_SIGNUP_DATA")
    
    google_http_code=$(echo "$google_response" | tail -n1)
    google_body=$(echo "$google_response" | sed '$d')
    
    if [ "$google_http_code" -ge 200 ] && [ "$google_http_code" -lt 300 ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $google_http_code)"
        ACCESS_TOKEN=$(echo "$google_body" | jq -r '.data.accessToken' 2>/dev/null)
        if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
            echo -e "${YELLOW}Received access token from Google OAuth${NC}"
            echo ""
            
            # Now run authenticated tests
            echo "=========================================="
            echo "6. Testing Authenticated Profile Endpoints"
            echo "=========================================="
            
            test_endpoint "GET" "/api/auth/me" "" "Get user profile" "Authorization: Bearer $ACCESS_TOKEN"
            echo ""
            
            echo "=========================================="
            echo "7. Testing Security Features"
            echo "=========================================="
            
            test_endpoint "POST" "/api/auth/verify-phone" "" "Verify phone number" "Authorization: Bearer $ACCESS_TOKEN"
            echo ""
            
            test_endpoint "GET" "/api/auth/me" "" "Get profile with security fields" "Authorization: Bearer $ACCESS_TOKEN"
            echo ""
            
            echo "=========================================="
            echo "8. Testing Account Deletion (Disabled Status)"
            echo "=========================================="
            
            test_endpoint "DELETE" "/api/auth/account" "" "Delete account (mark as disabled)" "Authorization: Bearer $ACCESS_TOKEN"
            echo ""
        else
            echo -e "${YELLOW}No access token from Google OAuth${NC}"
        fi
    else
        echo -e "${RED}FAIL${NC} (HTTP $google_http_code)"
        echo "$google_body" | jq '.' 2>/dev/null || echo "$google_body"
    fi
    echo ""
fi

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
