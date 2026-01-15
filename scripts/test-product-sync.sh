#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PRODUCT_NAME="${PRODUCT_NAME:-WEB-ITM-0002}"

echo "=== ProWhey Product Sync Test ==="
echo "Base URL      : ${BASE_URL}"
echo "Product (name): ${PRODUCT_NAME}"
echo

step() {
  echo
  echo "------------------------------------------------------------"
  echo "STEP: $1"
  echo "------------------------------------------------------------"
}

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
  echo "WARNING: Could not extract lastIds.product_changes from sync response."
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

echo
echo "=== Test complete ==="

