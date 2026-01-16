#!/bin/bash

# Quick verification script to check:
# 1. Messages have no TTL (persist indefinitely)
# 2. User messages are being recorded

set -e

echo "=========================================="
echo "Message Verification"
echo "=========================================="
echo ""

# Get a user ID from Redis (first user with messages)
echo "Finding a user with messages..."
USER_ID=$(redis-cli --scan --pattern "user:*:messages" | head -1 | sed 's/user:\(.*\):messages/\1/')

if [ -z "$USER_ID" ]; then
  echo "No users with messages found. Please run the test script first."
  exit 1
fi

echo "Using user: $USER_ID"
echo ""

# Get all message IDs for this user
echo "Getting all message IDs for user..."
MESSAGE_IDS=$(redis-cli SMEMBERS "user:${USER_ID}:messages")

if [ -z "$MESSAGE_IDS" ]; then
  echo "No messages found for this user."
  exit 1
fi

echo "Found $(echo "$MESSAGE_IDS" | wc -l | tr -d ' ') messages"
echo ""

# Check each message
echo "=========================================="
echo "Checking Messages:"
echo "=========================================="
echo ""

USER_MSG_COUNT=0
COMPANY_MSG_COUNT=0

for MSG_ID in $MESSAGE_IDS; do
  echo "--- Message: $MSG_ID ---"
  
  # Get message data
  MSG_DATA=$(redis-cli HGET "hash:message:${MSG_ID}" data)
  
  if [ -z "$MSG_DATA" ]; then
    echo "  ❌ Message data not found!"
    continue
  fi
  
  # Parse sender
  SENDER=$(echo "$MSG_DATA" | jq -r '.sender // "unknown"')
  TEXT=$(echo "$MSG_DATA" | jq -r '.text // ""' | cut -c1-50)
  TIMESTAMP=$(echo "$MSG_DATA" | jq -r '.timestamp // ""')
  DELETED=$(echo "$MSG_DATA" | jq -r '.deleted // false')
  
  echo "  Sender: $SENDER"
  echo "  Text: ${TEXT}..."
  echo "  Timestamp: $TIMESTAMP"
  echo "  Deleted: $DELETED"
  
  # Check TTL
  TTL=$(redis-cli TTL "hash:message:${MSG_ID}")
  if [ "$TTL" = "-1" ]; then
    echo "  ✅ TTL: No expiration (persistent)"
  elif [ "$TTL" = "-2" ]; then
    echo "  ❌ TTL: Key does not exist"
  else
    echo "  ⚠️  TTL: $TTL seconds (WARNING: Should be -1 for persistent)"
  fi
  
  # Count by sender
  if [ "$SENDER" = "user" ]; then
    USER_MSG_COUNT=$((USER_MSG_COUNT + 1))
  elif [ "$SENDER" = "company" ]; then
    COMPANY_MSG_COUNT=$((COMPANY_MSG_COUNT + 1))
  fi
  
  echo ""
done

echo "=========================================="
echo "Summary:"
echo "=========================================="
echo "Total messages: $(echo "$MESSAGE_IDS" | wc -l | tr -d ' ')"
echo "User messages: $USER_MSG_COUNT"
echo "Company messages: $COMPANY_MSG_COUNT"
echo ""

# Check if we have user messages
if [ $USER_MSG_COUNT -eq 0 ]; then
  echo "⚠️  WARNING: No user messages found!"
  echo "   This might mean user replies are not being recorded."
else
  echo "✅ User messages are being recorded correctly"
fi

# Check TTL for all messages
echo ""
echo "Checking TTL for all messages..."
ALL_MSGS=$(redis-cli --scan --pattern "hash:message:*")
TTL_ISSUES=0
for MSG_KEY in $ALL_MSGS; do
  TTL=$(redis-cli TTL "$MSG_KEY")
  if [ "$TTL" != "-1" ] && [ "$TTL" != "-2" ]; then
    TTL_ISSUES=$((TTL_ISSUES + 1))
    echo "  ⚠️  $MSG_KEY has TTL: $TTL seconds"
  fi
done

if [ $TTL_ISSUES -eq 0 ]; then
  echo "✅ All messages have no TTL (persistent)"
else
  echo "❌ Found $TTL_ISSUES messages with TTL (should be persistent)"
fi

echo ""
echo "=========================================="
echo "Sample User Messages:"
echo "=========================================="
for MSG_ID in $MESSAGE_IDS; do
  MSG_DATA=$(redis-cli HGET "hash:message:${MSG_ID}" data)
  SENDER=$(echo "$MSG_DATA" | jq -r '.sender // "unknown"')
  if [ "$SENDER" = "user" ]; then
    echo "Message ID: $MSG_ID"
    echo "$MSG_DATA" | jq .
    echo ""
  fi
done
