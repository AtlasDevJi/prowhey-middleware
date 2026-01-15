#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "=== ProWhey Stock Snapshot Test ==="
echo "Base URL: ${BASE_URL}"
echo
echo "This test verifies the weekly snapshot feature:"
echo "1. Triggers bulk stock update for all website items"
echo "2. Verifies it processes all item codes from variants"
echo "3. Checks that availability arrays are created/updated"
echo "4. Verifies stream entries are created for changed items"
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

step "2) Check if any website items exist (debug)"
echo "Checking for published website items..."
# Try fetching a website item directly to see if any exist
TEST_ITEM=$(curl --globoff -s "${BASE_URL}/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"WEB-ITM-0002\"]]" | jq -r '.product.erpnext_name // empty' 2>/dev/null || echo "")
if [ -n "${TEST_ITEM}" ]; then
  echo "✓ Found test item: ${TEST_ITEM}"
  echo "Note: Snapshot only processes items with published=1 in ERPNext"
else
  echo "⚠ Could not fetch test item - check ERPNext connection"
fi
echo

step "3) Trigger bulk stock snapshot (updates all items from all website items)"
echo "This may take a while depending on number of products..."
SNAPSHOT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/stock/update-all")
if [ $? -ne 0 ]; then
  echo "ERROR: Failed to trigger stock snapshot"
  exit 1
fi

echo "${SNAPSHOT_RESPONSE}" | jq . || echo "${SNAPSHOT_RESPONSE}"

# Extract summary fields
TOTAL_PRODUCTS=$(echo "${SNAPSHOT_RESPONSE}" | jq -r '.totalProductsFetched // 0' 2>/dev/null || echo "0")
PRODUCTS_WITH_VARIANTS=$(echo "${SNAPSHOT_RESPONSE}" | jq -r '.productsWithVariants // 0' 2>/dev/null || echo "0")
ITEMS_PROCESSED=$(echo "${SNAPSHOT_RESPONSE}" | jq -r '.itemsProcessed // 0' 2>/dev/null || echo "0")
UPDATED=$(echo "${SNAPSHOT_RESPONSE}" | jq -r '.updated // 0' 2>/dev/null || echo "0")
FAILED=$(echo "${SNAPSHOT_RESPONSE}" | jq -r '.failed // 0' 2>/dev/null || echo "0")

echo
echo "Snapshot Summary:"
echo "  Total Products Fetched: ${TOTAL_PRODUCTS}"
echo "  Products With Variants: ${PRODUCTS_WITH_VARIANTS}"
echo "  Items Processed: ${ITEMS_PROCESSED}"
echo "  Updated: ${UPDATED}"
echo "  Failed: ${FAILED}"

if [ "${FAILED}" != "0" ]; then
  echo
  echo "Errors encountered:"
  echo "${SNAPSHOT_RESPONSE}" | jq -r '.errors[]?' 2>/dev/null || echo "See response above"
fi

step "4) Verify stock sync endpoint returns updates"
SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
  -H "Content-Type: application/json" \
  -d "{\"lastSync\":{},\"entityTypes\":[\"stock\"],\"limit\":100}")

echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

UPDATE_COUNT=$(echo "${SYNC_RESPONSE}" | jq -r '.updates | length // 0' 2>/dev/null || echo "0")

if [ "${UPDATE_COUNT}" != "0" ]; then
  echo
  echo "✓ Stock sync endpoint returned ${UPDATE_COUNT} update(s)"
  echo "  First update example:"
  echo "${SYNC_RESPONSE}" | jq '.updates[0]' 2>/dev/null || echo "See updates array above"
else
  echo
  echo "⚠ No stock updates in sync response (may be inSync: true if no changes detected)"
fi

step "5) Check warehouse reference"
echo "Warehouse reference should match the updated list:"
echo "Expected: [\"Idlib Store\",\"Aleppo Store\",\"Hama Store\",\"Homs Store\",\"Tartus Store\",\"Latakia Store\",\"Damascus Store\"]"
echo
echo "You can verify in Redis:"
echo "  redis-cli GET warehouses:reference"

echo
echo "=== Test complete ==="
echo
echo "Next steps:"
echo "1. Verify warehouse reference in Redis matches expected list"
echo "2. Check that availability arrays have length 7 (matching warehouse count)"
echo "3. Verify stream entries were created: redis-cli XLEN stock_changes"
echo "4. Test weekly scheduler is running (check server logs for scheduled refresh)"
