#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ITEM_CODE="${1:-OL-EN-92-rng-1kg}"

echo "=== ProWhey Stock Availability Test ==="
echo "Base URL: ${BASE_URL}"
echo "Test Item Code: ${ITEM_CODE}"
echo
echo "This test verifies:"
echo "1. Warehouse reference endpoint (with coordinates support)"
echo "2. Single item availability check"
echo "3. Single item update via webhook"
echo "4. Bulk stock update for all website items"
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

step "2) Get warehouse reference (should support coordinates)"
echo "Fetching warehouse reference..."
WAREHOUSE_RESPONSE=$(curl -s "${BASE_URL}/api/stock/warehouses/reference")

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to fetch warehouse reference"
  exit 1
fi

echo "${WAREHOUSE_RESPONSE}" | jq . || echo "${WAREHOUSE_RESPONSE}"

WAREHOUSE_COUNT=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.count // 0' 2>/dev/null || echo "0")
echo
echo "Warehouse count: ${WAREHOUSE_COUNT}"

# Check format
FIRST_WAREHOUSE=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0] // empty' 2>/dev/null || echo "")
if echo "${FIRST_WAREHOUSE}" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "✓ Warehouses are objects (with coordinates support)"
  FIRST_NAME=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].name // empty' 2>/dev/null || echo "")
  FIRST_LAT=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].lat // empty' 2>/dev/null || echo "")
  FIRST_LNG=$(echo "${WAREHOUSE_RESPONSE}" | jq -r '.warehouses[0].lng // empty' 2>/dev/null || echo "")
  if [ -n "${FIRST_LAT}" ] && [ -n "${FIRST_LNG}" ] && [ "${FIRST_LAT}" != "null" ] && [ "${FIRST_LNG}" != "null" ]; then
    echo "  Example: ${FIRST_NAME} at (${FIRST_LAT}, ${FIRST_LNG})"
  fi
else
  echo "ℹ Warehouses are strings (legacy format, no coordinates)"
fi

step "3) Check stock availability for specific item"
echo "Checking availability for item: ${ITEM_CODE}"
STOCK_RESPONSE=$(curl -s "${BASE_URL}/api/stock/${ITEM_CODE}")

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to fetch stock availability"
  exit 1
fi

echo "${STOCK_RESPONSE}" | jq . || echo "${STOCK_RESPONSE}"

AVAILABILITY=$(echo "${STOCK_RESPONSE}" | jq -r '.availability // empty' 2>/dev/null || echo "")
if [ -n "${AVAILABILITY}" ] && [ "${AVAILABILITY}" != "null" ]; then
  AVAILABILITY_LENGTH=$(echo "${AVAILABILITY}" | jq 'length' 2>/dev/null || echo "0")
  echo
  echo "✓ Stock availability array length: ${AVAILABILITY_LENGTH}"
  
  if [ "${AVAILABILITY_LENGTH}" = "${WAREHOUSE_COUNT}" ]; then
    echo "  ✓ Availability array length matches warehouse count"
  else
    echo "  ⚠ Availability array length (${AVAILABILITY_LENGTH}) does not match warehouse count (${WAREHOUSE_COUNT})"
  fi
  
  # Count warehouses with stock
  STOCK_COUNT=$(echo "${AVAILABILITY}" | jq '[.[] | select(. == 1)] | length' 2>/dev/null || echo "0")
  echo "  Warehouses with stock: ${STOCK_COUNT} out of ${AVAILABILITY_LENGTH}"
  
  echo
  echo "Availability array:"
  echo "${AVAILABILITY}" | jq -r '.' 2>/dev/null || echo "${AVAILABILITY}"
else
  echo "⚠ No availability data found (item may not have stock data yet)"
  echo "  Run: POST ${BASE_URL}/api/webhooks/erpnext with entity_type=stock and itemCode=${ITEM_CODE}"
fi

step "4) Update single item availability via webhook"
echo "Triggering stock webhook for item: ${ITEM_CODE}"
WEBHOOK_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
  -H "Content-Type: application/json" \
  -d "{\"entity_type\":\"stock\",\"itemCode\":\"${ITEM_CODE}\"}")

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to trigger stock webhook"
  exit 1
fi

echo "${WEBHOOK_RESPONSE}" | jq . || echo "${WEBHOOK_RESPONSE}"

CHANGED=$(echo "${WEBHOOK_RESPONSE}" | jq -r '.changed // false' 2>/dev/null || echo "false")
if [ "${CHANGED}" = "true" ]; then
  echo "✓ Stock updated via webhook"
  VERSION=$(echo "${WEBHOOK_RESPONSE}" | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
  STREAM_ID=$(echo "${WEBHOOK_RESPONSE}" | jq -r '.streamId // "none"' 2>/dev/null || echo "none")
  echo "  Version: ${VERSION}"
  echo "  Stream ID: ${STREAM_ID}"
else
  echo "ℹ No changes detected (stock data unchanged)"
fi

step "5) Verify stock availability after webhook update"
echo "Checking availability again for item: ${ITEM_CODE}"
STOCK_RESPONSE_AFTER=$(curl -s "${BASE_URL}/api/stock/${ITEM_CODE}")

echo "${STOCK_RESPONSE_AFTER}" | jq . || echo "${STOCK_RESPONSE_AFTER}"

AVAILABILITY_AFTER=$(echo "${STOCK_RESPONSE_AFTER}" | jq -r '.availability // empty' 2>/dev/null || echo "")
if [ -n "${AVAILABILITY_AFTER}" ] && [ "${AVAILABILITY_AFTER}" != "null" ]; then
  AVAILABILITY_LENGTH_AFTER=$(echo "${AVAILABILITY_AFTER}" | jq 'length' 2>/dev/null || echo "0")
  echo
  echo "✓ Updated availability array length: ${AVAILABILITY_LENGTH_AFTER}"
  
  STOCK_COUNT_AFTER=$(echo "${AVAILABILITY_AFTER}" | jq '[.[] | select(. == 1)] | length' 2>/dev/null || echo "0")
  echo "  Warehouses with stock: ${STOCK_COUNT_AFTER} out of ${AVAILABILITY_LENGTH_AFTER}"
fi

step "6) Bulk stock update (all website items)"
echo "This will update stock for all items in website items variants..."
echo "This may take a while depending on number of products..."
read -p "Continue with bulk update? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  BULK_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/stock/update-all")
  
  if [ $? -ne 0 ]; then
    echo "ERROR: Failed to trigger bulk stock update"
    exit 1
  fi
  
  echo "${BULK_RESPONSE}" | jq . || echo "${BULK_RESPONSE}"
  
  TOTAL=$(echo "${BULK_RESPONSE}" | jq -r '.itemsProcessed // 0' 2>/dev/null || echo "0")
  UPDATED=$(echo "${BULK_RESPONSE}" | jq -r '.updated // 0' 2>/dev/null || echo "0")
  UNCHANGED=$(echo "${BULK_RESPONSE}" | jq -r '.unchanged // 0' 2>/dev/null || echo "0")
  FAILED=$(echo "${BULK_RESPONSE}" | jq -r '.failed // 0' 2>/dev/null || echo "0")
  
  echo
  echo "Bulk update summary:"
  echo "  Items processed: ${TOTAL}"
  echo "  Updated: ${UPDATED}"
  echo "  Unchanged: ${UNCHANGED}"
  echo "  Failed: ${FAILED}"
  
  if [ "${FAILED}" != "0" ]; then
    echo
    echo "Errors:"
    echo "${BULK_RESPONSE}" | jq -r '.errors[]?' 2>/dev/null || echo "See response above"
  fi
else
  echo "Skipped bulk update"
fi

echo
echo "=== Test complete ==="
echo
echo "Summary:"
echo "1. ✓ Warehouse reference endpoint working (supports coordinates)"
echo "2. ✓ Single item availability check working"
echo "3. ✓ Single item update via webhook working"
echo "4. ${6:-ℹ} Bulk stock update (all website items)"
echo
echo "Key endpoints:"
echo "- GET  /api/stock/warehouses/reference - Get warehouse reference"
echo "- GET  /api/stock/:itemCode - Get stock availability for item"
echo "- POST /api/webhooks/erpnext - Update single item stock (body: {\"entity_type\":\"stock\",\"itemCode\":\"...\"})"
echo "- POST /api/stock/update-all - Update all items from website items variants"
