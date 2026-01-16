#!/bin/bash

# Quick test to send a user message and verify it's recorded

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
API_BASE="${BASE_URL}/api"

echo "=== Testing User Message Creation ==="
echo ""

# Step 1: Create anonymous user
echo "1. Creating anonymous user..."
DEVICE_ID="test-user-msg-$(date +%s)"
ANON_RESPONSE=$(curl -s -X POST "${API_BASE}/users/anonymous" \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d "{\"device_id\": \"${DEVICE_ID}\"}")

USER_ID=$(echo "$ANON_RESPONSE" | jq -r '.data.userId // empty' 2>/dev/null)
echo "User ID: $USER_ID"
echo ""

# Step 2: Signup via Google OAuth
echo "2. Signing up user..."
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
echo "Access token obtained: ${ACCESS_TOKEN:0:20}..."
echo ""

# Step 3: Send user message
echo "3. Sending user message..."
USER_MSG_RESPONSE=$(curl -s -X POST "${API_BASE}/messaging/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Device-ID: ${DEVICE_ID}" \
  -d '{
    "text": "This is a test user message to verify user messages are being recorded correctly."
  }')

USER_MSG_ID=$(echo "$USER_MSG_RESPONSE" | jq -r '.data.message.messageId // empty' 2>/dev/null)

if [ -z "$USER_MSG_ID" ] || [ "$USER_MSG_ID" = "null" ]; then
  echo "❌ FAILED: Could not send user message"
  echo "Response: $USER_MSG_RESPONSE"
  exit 1
fi

echo "✅ User message sent: $USER_MSG_ID"
echo ""

# Step 4: Verify in Redis
echo "4. Verifying message in Redis..."
sleep 1

MSG_KEY="hash:message:${USER_MSG_ID}"
MSG_DATA=$(redis-cli HGET "$MSG_KEY" data 2>/dev/null)

if [ -z "$MSG_DATA" ]; then
  echo "❌ FAILED: Message not found in Redis"
  exit 1
fi

SENDER=$(echo "$MSG_DATA" | jq -r '.sender // "unknown"' 2>/dev/null)
TEXT=$(echo "$MSG_DATA" | jq -r '.text // ""' 2>/dev/null)
MSG_USER_ID=$(echo "$MSG_DATA" | jq -r '.userId // ""' 2>/dev/null)
TTL=$(redis-cli TTL "$MSG_KEY" 2>/dev/null)

echo "Message found in Redis:"
echo "  Key: $MSG_KEY"
echo "  Sender: $SENDER"
echo "  User ID: $MSG_USER_ID"
echo "  Text: ${TEXT:0:60}..."
echo "  TTL: $TTL"

if [ "$SENDER" != "user" ]; then
  echo "❌ FAILED: Sender should be 'user', got '$SENDER'"
  exit 1
fi

if [ "$MSG_USER_ID" != "$USER_ID" ]; then
  echo "❌ FAILED: User ID mismatch. Expected: $USER_ID, Got: $MSG_USER_ID"
  exit 1
fi

if [ "$TTL" != "-1" ]; then
  echo "❌ FAILED: TTL should be -1 (persistent), got $TTL"
  exit 1
fi

echo ""
echo "✅ SUCCESS: User message is correctly recorded with no TTL!"

# Step 5: Check user index
echo ""
echo "5. Checking user message index..."
USER_INDEX=$(redis-cli SMEMBERS "user:${USER_ID}:messages" 2>/dev/null)
if echo "$USER_INDEX" | grep -q "$USER_MSG_ID"; then
  echo "✅ Message ID found in user index"
else
  echo "❌ FAILED: Message ID not found in user index"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ All checks passed!"
echo "=========================================="
echo "User messages are being recorded correctly"
echo "Messages have no TTL (persistent)"
