# Messaging System Test Guide

This guide explains how to test the complete messaging flow: Company message → User reply → Company response → Sync verification.

## Prerequisites

1. **Start the server:**
   ```bash
   npm start
   # or
   node src/server.js
   ```

2. **Ensure Redis is running:**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

## Test Flow

The test script (`scripts/test-messaging.sh`) performs the following steps:

### Step 1: Create Anonymous User
- Creates an anonymous user with a unique device ID
- Extracts `userId` from response

### Step 2: Signup User
- Signs up the user with email/password
- Gets `accessToken` for authenticated requests

### Step 3: Check Sync BEFORE Messages
- Calls `/api/sync/check-medium` with empty `lastSync`
- **Expected:** Should return `inSync: true` or empty updates (no messages yet)

### Step 4: Create Company Message
- Uses `scripts/create-company-message.js` to create a company message
- Message includes action buttons (Enable Geolocation, View About Page)
- **Expected:** Message created successfully with `messageId`

### Step 5: Check Sync AFTER Company Message
- Calls `/api/sync/check-medium` again
- **Expected:** Should return the company message in `updates` array
- Message should have `actionButtons` array

### Step 6: User Sends Reply
- User sends message via `POST /api/messaging/send`
- **Expected:** Message created successfully

### Step 7: Check Sync AFTER User Message
- Calls `/api/sync/check-medium` with updated `lastSync`
- **Expected:** Should return the user message in `updates` array

### Step 8: Company Responds
- Company creates reply message with action button
- **Expected:** Reply message created successfully

### Step 9: Check Sync AFTER Company Reply
- Calls `/api/sync/check-medium` with updated `lastSync`
- **Expected:** Should return the company reply in `updates` array

### Step 10: Get All Messages
- Calls `GET /api/messaging` to retrieve all messages
- **Expected:** Should return all 3 messages (company initial, user reply, company response)

### Step 11: Verify Message Count
- Verifies total message count is at least 3
- Checks unread count

### Step 12: Check Unread Count
- Calls `GET /api/messaging/unread-count`
- **Expected:** Returns unread message count

### Step 13: Mark Message as Read
- Calls `PUT /api/messaging/:messageId/read`
- **Expected:** Message marked as read successfully

### Step 14: Final Sync Check
- Calls `/api/sync/check-medium` with final `lastSync`
- **Expected:** Should return `inSync: true` or no new updates (all messages already synced)

## Running the Test

```bash
# Make sure server is running first
npm start

# In another terminal, run the test
./scripts/test-messaging.sh
```

## Expected Output

The test script will output:
- ✓ Green checkmarks for successful steps
- ✗ Red errors for failures
- JSON responses from API calls
- Final summary of all tests

## Manual Testing

You can also test manually using the helper script:

### Create Company Message
```bash
node scripts/create-company-message.js \
  "0001" \
  "Please enable geolocation" \
  '[{"label":"Enable Geolocation","action":"enable_geolocation"}]'
```

### Send User Message (via API)
```bash
curl -X POST http://localhost:3001/api/messaging/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: device-123" \
  -d '{"text": "How do I enable geolocation?"}'
```

### Check Sync
```bash
curl -X POST http://localhost:3001/api/sync/check-medium \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: device-123" \
  -d '{
    "lastSync": {},
    "userId": "0001",
    "limit": 100
  }'
```

## Troubleshooting

### Server Not Running
- Error: `Server is not running at http://localhost:3001`
- Solution: Start the server with `npm start`

### Redis Connection Error
- Error: `Redis connection failed`
- Solution: Ensure Redis is running: `redis-cli ping`

### Authentication Errors
- Error: `401 Unauthorized`
- Solution: Check that signup/login completed successfully and access token is valid

### Messages Not Appearing in Sync
- Check that `userId` is being passed correctly in sync requests
- Verify messages are being added to `message_changes` stream
- Check Redis: `redis-cli XRANGE message_changes - +`

### Action Buttons Not Showing
- Verify company messages have `actionButtons` array
- Check that action buttons are only in company messages (not user messages)

## Key Test Points

1. **Sync Before Messages:** Should return `inSync: true` or empty updates
2. **Sync After Each Message:** Should return the new message in updates
3. **Message Filtering:** Only user's messages should appear (filtered by userId)
4. **Action Buttons:** Only company messages should have action buttons
5. **Read Status:** Messages can be marked as read
6. **Unread Count:** Correctly counts unread messages
7. **Final Sync:** Should be inSync after all messages are synced
