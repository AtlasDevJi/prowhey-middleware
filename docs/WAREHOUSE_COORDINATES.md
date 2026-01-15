# Warehouse Coordinates Management

## Overview

Warehouse coordinates (latitude and longitude) are stored in Redis, not in code. This allows you to update store locations without changing code.

## Storage Location

**Redis Key:** `warehouses:reference`

## Default Format (Strings Only)

By default, the warehouse reference is an array of strings (warehouse names only):

```json
["Idlib Store", "Aleppo Store", "Hama Store", "Homs Store", "Tartus Store", "Latakia Store", "Damascus Store"]
```

## Adding Coordinates

To add coordinates to warehouses, update the Redis key with objects containing `name`, `lat`, and `lng`:

### Example with Coordinates

```bash
redis-cli SET warehouses:reference '[{"name":"Idlib Store","lat":35.9333,"lng":36.6333},{"name":"Aleppo Store","lat":36.2021,"lng":37.1343},{"name":"Hama Store","lat":35.1318,"lng":36.7578},{"name":"Homs Store","lat":34.7268,"lng":36.7234},{"name":"Tartus Store","lat":34.8886,"lng":35.8869},{"name":"Latakia Store","lat":35.5241,"lng":35.7874},{"name":"Damascus Store","lat":33.5138,"lng":36.2765}]'
```

### Format Requirements

Each warehouse object must have:
- `name` (string, required): Warehouse name (must match ERPNext warehouse names)
- `lat` (number, optional): Latitude
- `lng` (number, optional): Longitude

**Important:** The `name` field must exactly match the warehouse name in ERPNext (case-insensitive matching is used).

## Updating Coordinates

### If Store Moves

Simply update the coordinates in Redis:

```bash
# Get current reference
redis-cli GET warehouses:reference

# Update with new coordinates (example: Idlib Store moved)
redis-cli SET warehouses:reference '[{"name":"Idlib Store","lat":35.9500,"lng":36.6500},...]'
```

### Partial Updates

You can mix formats - some warehouses can have coordinates, others can be strings:

```json
[
  {"name":"Idlib Store","lat":35.9333,"lng":36.6333},
  "Aleppo Store",
  {"name":"Hama Store","lat":35.1318,"lng":36.7578}
]
```

## Viewing Current Reference

```bash
# Get current warehouse reference
redis-cli GET warehouses:reference

# Pretty print (requires jq)
redis-cli GET warehouses:reference | jq '.'
```

## API Endpoint

The `GET /api/stock/warehouses/reference` endpoint returns whatever is stored in Redis:

**Response with coordinates:**
```json
{
  "success": true,
  "warehouses": [
    {"name": "Idlib Store", "lat": 35.9333, "lng": 36.6333},
    {"name": "Aleppo Store", "lat": 36.2021, "lng": 37.1343}
  ],
  "count": 2
}
```

**Response without coordinates (legacy format):**
```json
{
  "success": true,
  "warehouses": [
    "Idlib Store",
    "Aleppo Store"
  ],
  "count": 2
}
```

## Backward Compatibility

The system supports both formats:
- **String format:** `["Warehouse 1", "Warehouse 2"]` (no coordinates)
- **Object format:** `[{"name":"Warehouse 1","lat":35.9333,"lng":36.6333}, ...]` (with coordinates)

Stock availability checks work with both formats. The system extracts warehouse names automatically for matching.

## Important Notes

1. **No code changes needed:** All coordinate updates are done in Redis
2. **Name matching:** Warehouse names must match ERPNext warehouse names (case-insensitive)
3. **Order matters:** The order of warehouses determines the index in availability arrays
4. **After updating:** The changes take effect immediately - no restart needed
5. **Stock checks:** Stock availability arrays still work the same way regardless of format

## Example: Updating Coordinates for One Store

If "Idlib Store" moves to a new location:

1. Get current reference:
```bash
redis-cli GET warehouses:reference
```

2. Update the specific warehouse's coordinates in the JSON array

3. Set the updated reference:
```bash
redis-cli SET warehouses:reference '[{"name":"Idlib Store","lat":NEW_LAT,"lng":NEW_LNG},...]'
```

4. Changes are immediately available via the API endpoint

---

**Last Updated:** 2025-01-20  
**Key:** `warehouses:reference` in Redis  
**Supported Formats:** String array or object array with `{name, lat, lng}`
