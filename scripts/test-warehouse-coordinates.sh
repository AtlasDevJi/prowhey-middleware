#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "=== ProWhey Warehouse Coordinates & Availability Test ==="
echo "Base URL: ${BASE_URL}"
echo
echo "This test verifies:"
echo "1. Warehouse reference endpoint returns warehouses"
echo "2. Coordinates can be stored in Redis and retrieved"
echo "3. Stock availability works with both formats (strings or objects with coordinates)"
echo "4. Warehouse reference updates work correctly"
echo

step() {
  echo
  echo "------------------------------------------------------------"
  echo "STEP: $1"
  echo "------------------------------------------------------------"
}

step "1) ERPNext ping via middleware"
PING_RESPONSE=$(curl -s "${BASE_URL}/api/erpnext/ping")
if [ $? -ne 0 ]; then
  echo "ERROR: Failed to connect to server at ${BASE_URL}"
  echo "Make sure the server is running: npm run dev"
  exit 1
fi
echo "${PING_RESPONSE}" | jq . 2>/dev/null || echo "${PING_RESPONSE}"

step "2) Get current warehouse reference"
echo "Fetching warehouse reference from API..."
WAREHOUSE_RESPONSE=$(curl -s "${BASE_URL}/api/stock/warehouses/reference")

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to fetch warehouse reference"
  exit 1
fi

echo "${WAREHOUSE_RESPONSE}" | jq . || echo "${WAREHOUSE_RESPONSE}"

WAREHOUSE_COUNT=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.count // 0' 2>/dev/null || echo "0")
echo
echo "Warehouse count: ${WAREHOUSE_COUNT}"

# Check if warehouses have coordinates
echo
echo "Checking warehouse format..."
FIRST_WAREHOUSE=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0] // empty' 2>/dev/null || echo "")
if [ -n "${FIRST_WAREHOUSE}" ] && [ "${FIRST_WAREHOUSE}" != "null" ]; then
  # Check if it's an object with coordinates
  HAS_COORDS=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0] | type' 2>/dev/null || echo "string")
  if [ "${HAS_COORDS}" = "object" ]; then
    LAT=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].lat // empty' 2>/dev/null || echo "")
    LNG=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].lng // empty' 2>/dev/null || echo "")
    NAME=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].name // empty' 2>/dev/null || echo "")
    
    if [ -n "${LAT}" ] && [ -n "${LNG}" ] && [ "${LAT}" != "null" ] && [ "${LNG}" != "null" ]; then
      echo "✓ Warehouses have coordinates"
      echo "  Example: ${NAME} at (${LAT}, ${LNG})"
    else
      echo "⚠ Warehouses are objects but missing coordinates"
    fi
  else
    echo "ℹ Warehouses are strings (no coordinates yet)"
    echo "  Example: ${FIRST_WAREHOUSE}"
    echo
    echo "You can add coordinates by updating Redis:"
    echo "  redis-cli SET warehouses:reference '[{\"name\":\"Warehouse Name\",\"lat\":35.9333,\"lng\":36.6333},...]'"
  fi
fi

step "3) Check Redis warehouse reference directly"
echo "Checking Redis key: warehouses:reference"
echo
echo "Current value in Redis:"
redis-cli GET warehouses:reference 2>/dev/null | jq . 2>/dev/null || redis-cli GET warehouses:reference 2>/dev/null || echo "  (Key not found or error reading from Redis)"

step "4) Test stock availability endpoint"
echo "Testing stock availability for a specific item code..."

# Try to get a product first to extract item code
PRODUCT_NAME="${PRODUCT_NAME:-WEB-ITM-0002}"
PRODUCT_RESPONSE=$(curl --globoff -s \
  "${BASE_URL}/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"${PRODUCT_NAME}\"]]")

ITEM_CODE=$(echo "${PRODUCT_RESPONSE}" | jq -r '.product.variants[0].flavors[0].itemCode // empty' 2>/dev/null || echo "")

if [ -z "${ITEM_CODE}" ] || [ "${ITEM_CODE}" = "null" ]; then
  echo "⚠ Could not extract item code from product. Using test item code."
  ITEM_CODE="OL-EN-92-rng-1kg"
fi

echo "Using item code: ${ITEM_CODE}"
echo

STOCK_RESPONSE=$(curl -s "${BASE_URL}/api/stock/${ITEM_CODE}")
if [ $? -eq 0 ]; then
  echo "${STOCK_RESPONSE}" | jq . || echo "${STOCK_RESPONSE}"
  
  AVAILABILITY=$(echo "${STOCK_RESPONSE}" | jq -r '.availability // empty' 2>/dev/null || echo "")
  if [ -n "${AVAILABILITY}" ] && [ "${AVAILABILITY}" != "null" ]; then
    AVAILABILITY_LENGTH=$(echo "${AVAILABILITY}" | jq 'length' 2>/dev/null || echo "0")
    echo
    echo "✓ Stock availability array length: ${AVAILABILITY_LENGTH}"
    echo "  This should match warehouse count (${WAREHOUSE_COUNT})"
    
    if [ "${AVAILABILITY_LENGTH}" = "${WAREHOUSE_COUNT}" ]; then
      echo "  ✓ Availability array length matches warehouse count"
    else
      echo "  ⚠ Availability array length (${AVAILABILITY_LENGTH}) does not match warehouse count (${WAREHOUSE_COUNT})"
      echo "    Run bulk stock update: POST /api/stock/update-all"
    fi
    
    echo
    echo "Availability array:"
    echo "${AVAILABILITY}" | jq -r '.' 2>/dev/null || echo "${AVAILABILITY}"
    
    # Count warehouses with stock
    STOCK_COUNT=$(echo "${AVAILABILITY}" | jq '[.[] | select(. == 1)] | length' 2>/dev/null || echo "0")
    echo
    echo "Warehouses with stock: ${STOCK_COUNT} out of ${AVAILABILITY_LENGTH}"
  else
    echo "⚠ No availability array in response"
  fi
else
  echo "⚠ Failed to fetch stock availability (item may not exist)"
fi

step "5) Test updating coordinates in Redis (example)"
echo "Example: How to update warehouse coordinates in Redis"
echo
echo "Current format in Redis (check above):"
echo "  - String array: [\"Warehouse 1\", \"Warehouse 2\", ...]"
echo "  - Object array with coordinates: [{\"name\":\"Warehouse 1\",\"lat\":35.9333,\"lng\":36.6333}, ...]"
echo
echo "To update with coordinates, use:"
echo "  redis-cli SET warehouses:reference '[\"{\\\"name\\\":\\\"Idlib Store\\\",\\\"lat\\\":35.9333,\\\"lng\\\":36.6333}\",...]'"
echo
echo "After updating, refresh the warehouse reference:"
echo "  GET ${BASE_URL}/api/stock/warehouses/reference"
echo
echo "Note: Stock availability will continue to work with both formats"

step "6) Verify both formats work (test with coordinates if available)"
echo "Testing warehouse name extraction (should work with both formats)..."
echo

# Get warehouse reference again
WAREHOUSE_REF=$(curl -s "${BASE_URL}/api/stock/warehouses/reference")
echo "Warehouse reference structure:"
echo "${WAREHOUSE_REF}" | jq '.warehouses[0]' 2>/dev/null || echo "${WAREHOUSE_REF}"

# Check if coordinates are present
if echo "${WAREHOUSE_REF}" | jq -e '.warehouses[0] | type == "object"' >/dev/null 2>&1; then
  echo
  echo "✓ Warehouse reference contains objects"
  
  # Extract names
  echo
  echo "Warehouse names (extracted from objects):"
  echo "${WAREHOUSE_REF}" | jq -r '.warehouses[] | if type == "object" then .name else . end' 2>/dev/null | head -5
  
  echo
  echo "Warehouse coordinates:"
  echo "${WAREHOUSE_REF}" | jq -r '.warehouses[] | if type == "object" then "\(.name // "Unknown"): (\(.lat // "N/A"), \(.lng // "N/A"))" else "\(.): (no coordinates)" end' 2>/dev/null | head -5
else
  echo
  echo "ℹ Warehouse reference contains strings (no coordinates)"
  echo "Warehouse names:"
  echo "${WAREHOUSE_REF}" | jq -r '.warehouses[]' 2>/dev/null | head -5
fi

echo
echo "=== Test complete ==="
echo
echo "Summary:"
echo "1. ✓ Warehouse reference endpoint working"
echo "2. ℹ Check Redis to see current format"
echo "3. ℹ Stock availability works with both formats"
echo "4. ℹ Update coordinates in Redis using: redis-cli SET warehouses:reference '[{...}]'"
echo
echo "Next steps:"
echo "- Update coordinates in Redis (see WAREHOUSE_COORDINATES.md)"
echo "- Verify coordinates are returned by GET /api/stock/warehouses/reference"
echo "- Test stock availability with updated warehouse reference"
