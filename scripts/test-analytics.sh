#!/bin/bash

# Test script for analytics endpoints
# Usage: ./scripts/test-analytics.sh [base_url]
# Default base_url: http://localhost:3001

BASE_URL="${1:-http://localhost:3001}"
PRODUCT_NAME="WEB-ITM-0002"

echo "Testing Analytics Endpoints"
echo "Base URL: $BASE_URL"
echo "Product Name: $PRODUCT_NAME"
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
    
    echo -n "Testing $description... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC} (HTTP $http_code)"
        echo "  Response: $body"
        ((FAILED++))
        return 1
    fi
}

# Public Endpoints - Views
echo "=== Public Endpoints - Views ==="
test_endpoint "POST" "/api/analytics/product/$PRODUCT_NAME/view" '{"duration": 5000, "source": "home"}' "POST view (with metadata)"
test_endpoint "GET" "/api/analytics/product/$PRODUCT_NAME/view" "" "GET view count"

# Public Endpoints - Comments
echo ""
echo "=== Public Endpoints - Comments ==="
test_endpoint "POST" "/api/analytics/product/$PRODUCT_NAME/comment" '{"text": "Great product!", "author": "Test User"}' "POST comment"
test_endpoint "GET" "/api/analytics/product/$PRODUCT_NAME/comment" "" "GET comments"

# Public Endpoints - Ratings
echo ""
echo "=== Public Endpoints - Ratings ==="
test_endpoint "POST" "/api/analytics/product/$PRODUCT_NAME/rating" '{"starRating": 5}' "POST rating"
test_endpoint "GET" "/api/analytics/product/$PRODUCT_NAME/rating" "" "GET ratings"

# Analytics-Only Endpoints - Batch
echo ""
echo "=== Analytics-Only Endpoints - Batch ==="
BATCH_DATA='{
  "events": [
    {
      "type": "view",
      "entity_id": "'$PRODUCT_NAME'",
      "metadata": {"duration": 3000, "source": "search"}
    },
    {
      "type": "search",
      "term": "protein powder",
      "filters": {"category": "supplements"},
      "results_count": 10
    }
  ],
  "device_id": "test-device-123"
}'
test_endpoint "POST" "/api/analytics/batch" "$BATCH_DATA" "POST batch events"

# Analytics-Only Endpoints - Search
echo ""
echo "=== Analytics-Only Endpoints - Search ==="
SEARCH_DATA='{
  "term": "whey protein",
  "filters": {"category": "supplements", "price_range": "20-50"},
  "results_count": 15,
  "clicked_results": ["'$PRODUCT_NAME'"]
}'
test_endpoint "POST" "/api/analytics/search" "$SEARCH_DATA" "POST search"

# Analytics-Only Endpoints - Session
echo ""
echo "=== Analytics-Only Endpoints - Session ==="
SESSION_ID=$(uuidgen 2>/dev/null || echo "test-session-$(date +%s)")
test_endpoint "POST" "/api/analytics/session/open" "{\"session_id\": \"$SESSION_ID\"}" "POST session open"
sleep 1
test_endpoint "POST" "/api/analytics/session/heartbeat" "{\"session_id\": \"$SESSION_ID\"}" "POST session heartbeat"
sleep 1
test_endpoint "POST" "/api/analytics/session/close" "{\"session_id\": \"$SESSION_ID\"}" "POST session close"

# Analytics-Only Endpoints - Interaction
echo ""
echo "=== Analytics-Only Endpoints - Interaction ==="
INTERACTION_DATA='{
  "type": "image_view",
  "product_name": "'$PRODUCT_NAME'",
  "metadata": {"image_index": 2}
}'
test_endpoint "POST" "/api/analytics/interaction" "$INTERACTION_DATA" "POST interaction"

# Summary
echo ""
echo "=== Test Summary ==="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "Total: $((PASSED + FAILED))"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
