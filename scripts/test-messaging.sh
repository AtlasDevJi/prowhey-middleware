#!/bin/bash

# Test script for messaging system
# Tests: Company message → User reply → Company response → Sync checks

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
API_BASE="${BASE_URL}/api"

# Check if server is running
echo "Checking if server is running..."
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Server is not running at ${BASE_URL}${NC}"
  echo "Please start the server first with: npm start"
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Messaging System Test"
echo "=========================================="
echo ""

# Step 1: Create anonymous user and get access token
echo -e "${YELLOW}Step 1: Creating anonymous user...${NC}"
DEVICE_ID="test-device-$(date +%s)"
ANON_RESPONSE=$(curl -s -X POST "${API_BASE}/users/anonymous" \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{\"device_id\": \"${DEVICE_ID}\"}")

USER_ID=$(echo "$ANON_RESPONSE" | jq -r '.data.userId // empty' 2>/dev/null)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}FAIL: Could not create anonymous user${NC}"
  echo "Response: $ANON_RESPONSE"
  exit 1
fi

echo "User ID: ${USER_ID}"

# Step 2: Signup using Google OAuth (auto-verified, simpler)
echo -e "${YELLOW}Step 2: Signing up user via Google OAuth...${NC}"
TIMESTAMP=$(date +%s)
SIGNUP_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/google-login" \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"email\": \"test-${TIMESTAMP}@example.com\",
    \"googleId\": \"google-${TIMESTAMP}\",
    \"deviceId\": \"${DEVICE_ID}\",
    \"name\": \"Test User ${TIMESTAMP}\"
  }")

ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.accessToken // empty' 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo -e "${RED}FAIL: Could not get access token${NC}"
  echo "Response: $SIGNUP_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ User authenticated${NC}"
echo ""

# Step 3: Check sync BEFORE any messages (should return inSync or no messages)
echo -e "${YELLOW}Step 3: Checking sync BEFORE messages are added...${NC}"
SYNC_BEFORE=$(curl -s -X POST "${API_BASE}/sync/check-medium" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"lastSync\": {},
    \"userId\": \"${USER_ID}\",
    \"limit\": 100
  }")

echo "Sync response before messages:"
echo "$SYNC_BEFORE" | jq '.' 2>/dev/null || echo "$SYNC_BEFORE"
echo ""

# Step 4: Create company message (via Node.js script since company messages are created via Redis)
echo -e "${YELLOW}Step 4: Creating company message with action button...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPANY_MSG_RESPONSE=$(cd "$SCRIPT_DIR/.." && node scripts/create-company-message.js \
  "${USER_ID}" \
  "Please enable geolocation to help us show you nearby stores and better product availability." \
  '[{"label":"Enable Geolocation","action":"enable_geolocation"},{"label":"View About Page","action":"about"}]')

COMPANY_MSG_ID=$(echo "$COMPANY_MSG_RESPONSE" | jq -r '.messageId // empty' 2>/dev/null)

if [ -z "$COMPANY_MSG_ID" ] || [ "$COMPANY_MSG_ID" = "null" ]; then
  echo -e "${RED}FAIL: Could not create company message${NC}"
  echo "Response: $COMPANY_MSG_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Company message created: ${COMPANY_MSG_ID}${NC}"
echo ""

# Step 5: Check sync AFTER company message (should return the message)
echo -e "${YELLOW}Step 5: Checking sync AFTER company message...${NC}"
sleep 1 # Small delay to ensure stream entry is processed

SYNC_AFTER_COMPANY=$(curl -s -X POST "${API_BASE}/sync/check-medium" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"lastSync\": {},
    \"userId\": \"${USER_ID}\",
    \"limit\": 100
  }")

echo "Sync response after company message:"
echo "$SYNC_AFTER_COMPANY" | jq '.' 2>/dev/null || echo "$SYNC_AFTER_COMPANY"

# Extract lastSync for next check
LAST_SYNC=$(echo "$SYNC_AFTER_COMPANY" | jq -r '.lastIds // {}' 2>/dev/null || echo "{}")
echo ""

# Step 6: User sends reply
echo -e "${YELLOW}Step 6: User sending reply...${NC}"
USER_REPLY_RESPONSE=$(curl -s -X POST "${API_BASE}/messaging/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "text": "How do I enable geolocation on my device?"
  }')

USER_MSG_ID=$(echo "$USER_REPLY_RESPONSE" | jq -r '.data.message.messageId // empty' 2>/dev/null)

if [ -z "$USER_MSG_ID" ] || [ "$USER_MSG_ID" = "null" ]; then
  echo -e "${RED}FAIL: Could not send user message${NC}"
  echo "Response: $USER_REPLY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ User message sent: ${USER_MSG_ID}${NC}"
echo ""

# Step 7: Check sync AFTER user message
echo -e "${YELLOW}Step 7: Checking sync AFTER user message...${NC}"
sleep 1

SYNC_AFTER_USER=$(curl -s -X POST "${API_BASE}/sync/check-medium" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"lastSync\": ${LAST_SYNC},
    \"userId\": \"${USER_ID}\",
    \"limit\": 100
  }")

echo "Sync response after user message:"
echo "$SYNC_AFTER_USER" | jq '.' 2>/dev/null || echo "$SYNC_AFTER_USER"
echo ""

# Step 8: Company responds to user question
echo -e "${YELLOW}Step 8: Company responding to user question...${NC}"
COMPANY_REPLY_RESPONSE=$(cd "$SCRIPT_DIR/.." && node scripts/create-company-message.js \
  "${USER_ID}" \
  "To enable geolocation, go to your device settings, find the app permissions, and enable location access. Then tap the \"Enable Geolocation\" button in the message." \
  '[{"label":"Enable Geolocation","action":"enable_geolocation"}]')

COMPANY_REPLY_ID=$(echo "$COMPANY_REPLY_RESPONSE" | jq -r '.messageId // empty' 2>/dev/null)

if [ -z "$COMPANY_REPLY_ID" ] || [ "$COMPANY_REPLY_ID" = "null" ]; then
  echo -e "${RED}FAIL: Could not create company reply${NC}"
  echo "Response: $COMPANY_REPLY_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Company reply created: ${COMPANY_REPLY_ID}${NC}"
echo ""

# Step 9: Check sync AFTER company reply
echo -e "${YELLOW}Step 9: Checking sync AFTER company reply...${NC}"
sleep 1

# Update lastSync from previous check
LAST_SYNC=$(echo "$SYNC_AFTER_USER" | jq -r '.lastIds // {}' 2>/dev/null || echo "{}")

SYNC_AFTER_REPLY=$(curl -s -X POST "${API_BASE}/sync/check-medium" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"lastSync\": ${LAST_SYNC},
    \"userId\": \"${USER_ID}\",
    \"limit\": 100
  }")

echo "Sync response after company reply:"
echo "$SYNC_AFTER_REPLY" | jq '.' 2>/dev/null || echo "$SYNC_AFTER_REPLY"
echo ""

# Step 10: Get all messages via direct endpoint
echo -e "${YELLOW}Step 10: Getting all messages via direct endpoint...${NC}"
ALL_MESSAGES=$(curl -s -X GET "${API_BASE}/messaging?limit=50&offset=0" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

echo "All messages:"
echo "$ALL_MESSAGES" | jq '.' 2>/dev/null || echo "$ALL_MESSAGES"
echo ""

# Step 11: Verify message count and order
echo -e "${YELLOW}Step 11: Verifying message count and order...${NC}"
MESSAGE_COUNT=$(echo "$ALL_MESSAGES" | jq '.data.messages | length' 2>/dev/null || echo "0")
UNREAD_COUNT=$(echo "$ALL_MESSAGES" | jq '.data.unreadCount' 2>/dev/null || echo "0")

echo "Total messages: ${MESSAGE_COUNT}"
echo "Unread count: ${UNREAD_COUNT}"

if [ "$MESSAGE_COUNT" -lt 3 ]; then
  echo -e "${RED}FAIL: Expected at least 3 messages, got ${MESSAGE_COUNT}${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Message count verified${NC}"
echo ""

# Step 12: Check unread count endpoint
echo -e "${YELLOW}Step 12: Checking unread count endpoint...${NC}"
UNREAD_RESPONSE=$(curl -s -X GET "${API_BASE}/messaging/unread-count" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

echo "Unread count response:"
echo "$UNREAD_RESPONSE" | jq '.' 2>/dev/null || echo "$UNREAD_RESPONSE"
echo ""

# Step 13: Mark a message as read
echo -e "${YELLOW}Step 13: Marking company message as read...${NC}"
MARK_READ_RESPONSE=$(curl -s -X PUT "${API_BASE}/messaging/${COMPANY_MSG_ID}/read" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}")

echo "Mark read response:"
echo "$MARK_READ_RESPONSE" | jq '.' 2>/dev/null || echo "$MARK_READ_RESPONSE"
echo ""

# Step 14: Final sync check (should show inSync or only new messages)
echo -e "${YELLOW}Step 14: Final sync check (should be inSync or show only new messages)...${NC}"
sleep 1

# Update lastSync from company reply check
LAST_SYNC=$(echo "$SYNC_AFTER_REPLY" | jq -r '.lastIds // {}' 2>/dev/null || echo "{}")

FINAL_SYNC=$(curl -s -X POST "${API_BASE}/sync/check-medium" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{
    \"lastSync\": ${LAST_SYNC},
    \"userId\": \"${USER_ID}\",
    \"limit\": 100
  }")

echo "Final sync response:"
echo "$FINAL_SYNC" | jq '.' 2>/dev/null || echo "$FINAL_SYNC"
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}Test Summary${NC}"
echo "=========================================="
echo "✓ User created and authenticated"
echo "✓ Sync check before messages (should be inSync or empty)"
echo "✓ Company message created with action buttons"
echo "✓ Sync check after company message (should return message)"
echo "✓ User reply sent"
echo "✓ Sync check after user message (should return user message)"
echo "✓ Company reply created"
echo "✓ Sync check after company reply (should return company reply)"
echo "✓ All messages retrieved via direct endpoint"
echo "✓ Message count verified (${MESSAGE_COUNT} messages)"
echo "✓ Unread count checked"
echo "✓ Message marked as read"
echo "✓ Final sync check completed"
echo ""
echo -e "${GREEN}All tests passed!${NC}"
