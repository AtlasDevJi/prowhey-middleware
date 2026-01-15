#!/usr/bin/env bash

set -euo pipefail

ENTITY_TYPE="${1:-product}"  # First argument, default to product
BASE_URL="${BASE_URL:-http://localhost:3001}"
PRODUCT_NAME="${PRODUCT_NAME:-WEB-ITM-0002}"

echo "=== ProWhey Sync Test ==="
echo "Entity Type   : ${ENTITY_TYPE}"
echo "Base URL      : ${BASE_URL}"
echo "Product (name): ${PRODUCT_NAME}"
echo

step() {
  echo
  echo "------------------------------------------------------------"
  echo "STEP: $1"
  echo "------------------------------------------------------------"
}

if [ "${ENTITY_TYPE}" = "product" ]; then
  # Product sync test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch Website Item via cache middleware (populate product cache)"
  curl --globoff -s \
    "${BASE_URL}/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"${PRODUCT_NAME}\"]]" \
    | jq . || curl --globoff -s \
    "${BASE_URL}/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"${PRODUCT_NAME}\"]]"

  step "3) Trigger unified product webhook (hash + stream)"
  curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"product\",\"erpnextName\":\"${PRODUCT_NAME}\"}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"product\",\"erpnextName\":\"${PRODUCT_NAME}\"}"

  step "4) Sync check (first call, expect updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"product\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

  LAST_ID=$(echo "${SYNC_RESPONSE}" | jq -r '.lastIds.product_changes // .lastIds.product // empty' 2>/dev/null || true)

  if [ -z "${LAST_ID}" ] || [ "${LAST_ID}" = "null" ]; then
    echo
    echo "WARNING: Could not extract lastIds.product from sync response."
    echo "Skipping Step 5 (second sync check)."
    exit 0
  fi

  echo
  echo "Extracted last product stream ID: ${LAST_ID}"

  step "5) Sync check (second call, expect inSync: true)"
  curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"product\":\"${LAST_ID}\"},\"entityTypes\":[\"product\"],\"limit\":100}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"product\":\"${LAST_ID}\"},\"entityTypes\":[\"product\"],\"limit\":100}"

elif [ "${ENTITY_TYPE}" = "stock" ]; then
  # Stock sync test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch Website Item to get item codes from variants"
  PRODUCT_RESPONSE=$(curl --globoff -s \
    "${BASE_URL}/api/resource/Website%20Item?filters=[[\"name\",\"=\",\"${PRODUCT_NAME}\"]]")

  echo "${PRODUCT_RESPONSE}" | jq . || echo "${PRODUCT_RESPONSE}"

  # Extract first item code from variants
  ITEM_CODE=$(echo "${PRODUCT_RESPONSE}" | jq -r '.product.variants[0].flavors[0].itemCode // empty' 2>/dev/null || true)

  if [ -z "${ITEM_CODE}" ] || [ "${ITEM_CODE}" = "null" ]; then
    echo
    echo "ERROR: Could not extract itemCode from product variants."
    echo "Product response:"
    echo "${PRODUCT_RESPONSE}" | jq . || echo "${PRODUCT_RESPONSE}"
    exit 1
  fi

  echo
  echo "Extracted item code: ${ITEM_CODE}"

  step "3) Trigger unified stock webhook (hash + stream)"
  curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"stock\",\"itemCode\":\"${ITEM_CODE}\"}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"stock\",\"itemCode\":\"${ITEM_CODE}\"}"

  step "4) Sync check (first call, expect updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"stock\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

  LAST_ID=$(echo "${SYNC_RESPONSE}" | jq -r '.lastIds.stock_changes // .lastIds.stock // empty' 2>/dev/null || true)

  if [ -z "${LAST_ID}" ] || [ "${LAST_ID}" = "null" ]; then
    echo
    echo "WARNING: Could not extract lastIds.stock from sync response."
    echo "Skipping Step 5 (second sync check)."
    exit 0
  fi

  echo
  echo "Extracted last stock stream ID: ${LAST_ID}"

  step "5) Sync check (second call, expect inSync: true)"
  curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"stock\":\"${LAST_ID}\"},\"entityTypes\":[\"stock\"],\"limit\":100}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"stock\":\"${LAST_ID}\"},\"entityTypes\":[\"stock\"],\"limit\":100}"

elif [ "${ENTITY_TYPE}" = "hero" ]; then
  # Hero sync test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch hero images via API (populate cache)"
  curl -s "${BASE_URL}/api/hero" | jq . || curl -s "${BASE_URL}/api/hero"

  step "3) Trigger unified hero webhook (hash + stream)"
  curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"hero\"}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"hero\"}"

  step "4) Sync check (first call, expect updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"hero\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

  LAST_ID=$(echo "${SYNC_RESPONSE}" | jq -r '.lastIds.hero_changes // .lastIds.hero // empty' 2>/dev/null || true)

  if [ -z "${LAST_ID}" ] || [ "${LAST_ID}" = "null" ]; then
    echo
    echo "WARNING: Could not extract lastIds.hero from sync response."
    echo "Skipping Step 5 (second sync check)."
    exit 0
  fi

  echo
  echo "Extracted last hero stream ID: ${LAST_ID}"

  step "5) Sync check (second call, expect inSync: true)"
  curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"hero\":\"${LAST_ID}\"},\"entityTypes\":[\"hero\"],\"limit\":100}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"hero\":\"${LAST_ID}\"},\"entityTypes\":[\"hero\"],\"limit\":100}"

elif [ "${ENTITY_TYPE}" = "bundle" ]; then
  # Bundle sync test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch bundle images via API (populate cache)"
  curl -s "${BASE_URL}/api/bundle" | jq . || curl -s "${BASE_URL}/api/bundle"

  step "3) Trigger unified bundle webhook (hash + stream)"
  curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"bundle\"}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"bundle\"}"

  step "4) Sync check (first call, expect updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"bundle\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

  LAST_ID=$(echo "${SYNC_RESPONSE}" | jq -r '.lastIds.bundle_changes // .lastIds.bundle // empty' 2>/dev/null || true)

  if [ -z "${LAST_ID}" ] || [ "${LAST_ID}" = "null" ]; then
    echo
    echo "WARNING: Could not extract lastIds.bundle from sync response."
    echo "Skipping Step 5 (second sync check)."
    exit 0
  fi

  echo
  echo "Extracted last bundle stream ID: ${LAST_ID}"

  step "5) Sync check (second call, expect inSync: true)"
  curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"bundle\":\"${LAST_ID}\"},\"entityTypes\":[\"bundle\"],\"limit\":100}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"bundle\":\"${LAST_ID}\"},\"entityTypes\":[\"bundle\"],\"limit\":100}"

elif [ "${ENTITY_TYPE}" = "home" ]; then
  # Home sync test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch App Home via API (populate cache)"
  HOME_RESPONSE=$(curl -s "${BASE_URL}/api/home")
  echo "${HOME_RESPONSE}" | jq . || echo "${HOME_RESPONSE}"

  # Verify JSON parsing
  echo
  echo "Verifying JSON parsing..."
  echo "${HOME_RESPONSE}" | jq -r '.top_sellers // empty' | head -1
  echo "${HOME_RESPONSE}" | jq -r '.new_arrivals // empty' | head -1
  echo "${HOME_RESPONSE}" | jq -r '.most_viewed // empty' | head -1
  echo "${HOME_RESPONSE}" | jq -r '.top_offers // empty' | head -1

  step "3) Trigger unified home webhook (hash + stream)"
  curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"home\"}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/webhooks/erpnext" \
    -H "Content-Type: application/json" \
    -d "{\"entity_type\":\"home\"}"

  step "4) Sync check (first call, expect updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"home\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

  LAST_ID=$(echo "${SYNC_RESPONSE}" | jq -r '.lastIds.home_changes // .lastIds.home // empty' 2>/dev/null || true)

  if [ -z "${LAST_ID}" ] || [ "${LAST_ID}" = "null" ]; then
    echo
    echo "WARNING: Could not extract lastIds.home from sync response."
    echo "Skipping Step 5 (second sync check)."
    exit 0
  fi

  echo
  echo "Extracted last home stream ID: ${LAST_ID}"

  step "5) Sync check (second call, expect inSync: true)"
  curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"home\":\"${LAST_ID}\"},\"entityTypes\":[\"home\"],\"limit\":100}" \
    | jq . || curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{\"home\":\"${LAST_ID}\"},\"entityTypes\":[\"home\"],\"limit\":100}"

elif [ "${ENTITY_TYPE}" = "products" ] || [ "${ENTITY_TYPE}" = "all-products" ]; then
  # Fetch all products test flow
  step "1) ERPNext ping via middleware"
  curl -s "${BASE_URL}/api/erpnext/ping" | jq . || curl -s "${BASE_URL}/api/erpnext/ping"

  step "2) Fetch all Website Items (populate cache and individual product hashes)"
  PRODUCTS_RESPONSE=$(curl --globoff -s "${BASE_URL}/api/resource/Website%20Item")
  
  # Check if response is valid JSON
  if echo "${PRODUCTS_RESPONSE}" | jq empty 2>/dev/null; then
    PRODUCT_COUNT=$(echo "${PRODUCTS_RESPONSE}" | jq '.data | length' 2>/dev/null || echo "0")
    echo "✅ Successfully fetched ${PRODUCT_COUNT} products"
    echo
    echo "Product names:"
    echo "${PRODUCTS_RESPONSE}" | jq -r '.data[]?.name // .data[]?.erpnext_name // empty' 2>/dev/null | head -20
    
    if [ "${PRODUCT_COUNT}" -gt 20 ]; then
      echo "... and $((PRODUCT_COUNT - 20)) more"
    fi
    
    echo
    echo "Full response (first 3 products):"
    echo "${PRODUCTS_RESPONSE}" | jq '.data[0:3]' 2>/dev/null || echo "${PRODUCTS_RESPONSE}" | head -50
  else
    echo "❌ Failed to fetch products or invalid JSON response:"
    echo "${PRODUCTS_RESPONSE}"
    exit 1
  fi

  step "3) Verify product hashes in Redis"
  echo "Checking Redis for cached product hashes..."
  echo "Run this command to see all product hash keys:"
  echo "  redis-cli KEYS 'hash:product:*'"
  echo
  echo "Checking first few product hashes..."
  
  # Extract product names and check their hashes
  PRODUCT_NAMES=$(echo "${PRODUCTS_RESPONSE}" | jq -r '.data[]?.name // .data[]?.erpnext_name // empty' 2>/dev/null | head -5)
  for name in ${PRODUCT_NAMES}; do
    if [ -n "${name}" ] && [ "${name}" != "null" ]; then
      echo "Checking hash:product:${name}"
      redis-cli HGETALL "hash:product:${name}" 2>/dev/null | head -6 || echo "  (not found or error)"
    fi
  done

  step "4) Optional: Trigger webhooks for all products"
  echo "To trigger webhooks for all products, run:"
  echo "  echo \"${PRODUCTS_RESPONSE}\" | jq -r '.data[]?.name // .data[]?.erpnext_name // empty' | while read name; do"
  echo "    curl -X POST ${BASE_URL}/api/webhooks/erpnext \\"
  echo "      -H 'Content-Type: application/json' \\"
  echo "      -d \"{\\\"entity_type\\\":\\\"product\\\",\\\"erpnextName\\\":\\\"\${name}\\\"}\""
  echo "  done"
  echo
  echo "Skipping automatic webhook triggers (use above command if needed)"

  step "5) Sync check (check for product updates)"
  SYNC_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/sync/check" \
    -H "Content-Type: application/json" \
    -d "{\"lastSync\":{},\"entityTypes\":[\"product\"],\"limit\":100}")

  echo "${SYNC_RESPONSE}" | jq . || echo "${SYNC_RESPONSE}"

else
  echo "ERROR: Unknown entity type '${ENTITY_TYPE}'"
  echo "Supported types: product, products (or all-products), stock, hero, home"
  exit 1
fi

echo
echo "=== Test complete ==="
