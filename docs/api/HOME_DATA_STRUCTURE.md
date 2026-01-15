# Home Data Structure Documentation

This document describes the data structure for App Home and Hero Images, and provides instructions for adding new fields.

## App Home Data Structure

The App Home entity contains product lists and HTML content for the home page.

### Current Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `top_sellers` | Array<string> | ERPNext (JSON string) | Array of item codes for top-selling products |
| `new_arrivals` | Array<string> | ERPNext (JSON string) | Array of item codes for newly arrived products |
| `most_viewed` | Array<string> | ERPNext (JSON string) | Array of item codes for most viewed products |
| `top_offers` | Array<string> | ERPNext (JSON string) | Array of item codes for top offers |
| `html1` | string | ERPNext (text field) | HTML content for section 1 |
| `html2` | string | ERPNext (text field) | HTML content for section 2 |
| `html3` | string | ERPNext (text field) | HTML content for section 3 |
| `modified` | string | ERPNext (timestamp) | Timestamp of last modification |

### Data Flow

```
ERPNext App Home Doctype
  ↓
Webhook Trigger
  ↓
Middleware Fetch (/api/resource/App Home)
  ↓
Transform (parse JSON strings)
  ↓
Hash Computation
  ↓
Redis Cache (hash:home:home)
  ↓
Sync Stream (home_changes)
  ↓
API Response (GET /api/home)
```

## Hero Images Data Structure

The Hero entity contains base64-encoded hero images for the home page.

### Current Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `heroImages` | Array<string> | ERPNext File (is_hero=1) | Array of base64-encoded data URLs |

### Data Flow

```
ERPNext File Doctype (is_hero=1)
  ↓
Webhook Trigger
  ↓
Middleware Fetch (/api/resource/File?filters=[["is_hero", "=", 1]])
  ↓
Download Images
  ↓
Convert to Base64
  ↓
Transform
  ↓
Hash Computation
  ↓
Redis Cache (hash:hero:hero)
  ↓
Sync Stream (hero_changes)
  ↓
API Response (GET /api/hero)
```

## Adding New Fields to App Home

To add a new field to App Home, follow these steps:

### Step 1: Add Field to ERPNext App Home Doctype

1. Go to ERPNext → Customize → DocType → App Home
2. Add the new field:
   - **For JSON arrays** (like `top_sellers`): Use a "Small Text" or "Long Text" field, and store JSON string format: `["item1", "item2"]`
   - **For HTML content** (like `html1`): Use a "HTML Editor" or "Long Text" field
   - **For simple strings**: Use a "Data" or "Small Text" field
   - **For numbers**: Use a "Int" or "Float" field

### Step 2: Update Transformer Function

Edit `src/services/cache/transformer.js` and update the `transformAppHome()` function:

```javascript
async function transformAppHome(erpnextData) {
  // ... existing code ...

  // Parse JSON string fields helper
  const parseJsonField = (fieldValue) => {
    if (!fieldValue) {
      return [];
    }
    try {
      return JSON.parse(fieldValue);
    } catch (error) {
      logger.warn('Failed to parse JSON field in App Home', {
        field: fieldValue,
        error: error.message,
      });
      return [];
    }
  };

  // Build transformed object
  const transformed = {
    // ... existing fields ...
    top_sellers: parseJsonField(data.top_sellers),
    new_arrivals: parseJsonField(data.new_arrivals),
    most_viewed: parseJsonField(data.most_viewed),
    top_offers: parseJsonField(data.top_offers),
    html1: data.html1 || '',
    html2: data.html2 || '',
    html3: data.html3 || '',
    
    // ADD YOUR NEW FIELD HERE:
    // For JSON array fields:
    new_product_list: parseJsonField(data.new_product_list),
    // For string fields:
    new_html_content: data.new_html_content || '',
    // For number fields:
    new_number_field: data.new_number_field || 0,
    
    modified: data.modified || data.creation || null,
  };

  return transformed;
}
```

### Step 3: Update API Documentation

Update `docs/api/API.md` to include the new field in the response format:

```markdown
**Response:**
```json
{
  "success": true,
  "top_sellers": [...],
  "new_arrivals": [...],
  "most_viewed": [...],
  "top_offers": [...],
  "html1": "...",
  "html2": "...",
  "html3": "...",
  "new_product_list": [...],  // NEW FIELD
  "new_html_content": "...",   // NEW FIELD
  "modified": "..."
}
```

**Data Structure:**

| Field | Type | Description |
|-------|------|-------------|
| ... existing fields ... |
| `new_product_list` | Array<string> | Description of new field |
| `new_html_content` | string | Description of new field |
```

### Step 4: Update Sync API Documentation

Update `docs/api/SYNC_API.md` to include the new field in the Home entity type section:

```markdown
**Data Structure:**
```typescript
{
  // ... existing fields ...
  new_product_list: Array<string>;  // NEW FIELD
  new_html_content: string;         // NEW FIELD
}
```
```

### Step 5: Automatic Inclusion

Once you've updated the transformer, the new field will automatically be included in:

- ✅ Hash computation (change detection)
- ✅ Cache storage
- ✅ Sync streams
- ✅ API responses (`GET /api/home`)
- ✅ Sync API responses (`POST /api/sync/check`)

**No additional code changes needed!** The hash-based sync system will automatically detect changes to the new field.

## Field Type Patterns

### JSON Array Fields (like `top_sellers`)

**ERPNext:** Store as JSON string: `["item1", "item2", "item3"]`

**Transformer:**
```javascript
new_field: parseJsonField(data.new_field),
```

**Result:** Array of strings

### HTML/String Fields (like `html1`)

**ERPNext:** Store as text or HTML field

**Transformer:**
```javascript
new_field: data.new_field || '',
```

**Result:** String

### Number Fields

**ERPNext:** Store as Int or Float field

**Transformer:**
```javascript
new_field: data.new_field || 0,
```

**Result:** Number

### Boolean Fields

**ERPNext:** Store as Check field (0 or 1)

**Transformer:**
```javascript
new_field: data.new_field === 1 || data.new_field === true,
```

**Result:** Boolean

## Examples

### Example 1: Adding a "Featured Products" List

1. **ERPNext:** Add field `featured_products` as "Small Text", store: `["ITEM-001", "ITEM-002"]`
2. **Transformer:**
   ```javascript
   featured_products: parseJsonField(data.featured_products),
   ```
3. **Documentation:** Add to API docs as `Array<string>`

### Example 2: Adding a "Banner HTML" Field

1. **ERPNext:** Add field `banner_html` as "HTML Editor"
2. **Transformer:**
   ```javascript
   banner_html: data.banner_html || '',
   ```
3. **Documentation:** Add to API docs as `string`

### Example 3: Adding a "Promotion Count" Field

1. **ERPNext:** Add field `promotion_count` as "Int"
2. **Transformer:**
   ```javascript
   promotion_count: data.promotion_count || 0,
   ```
3. **Documentation:** Add to API docs as `number`

## Testing

After adding a new field:

1. **Update ERPNext:** Create/update an App Home record with the new field
2. **Trigger Webhook:** Call `POST /api/webhooks/erpnext` with `{"entity_type": "home"}`
3. **Verify API:** Call `GET /api/home` and verify the new field appears
4. **Verify Sync:** Call `POST /api/sync/check` with `{"entityTypes": ["home"]}` and verify the new field appears in sync response
5. **Verify Hash:** Update the field in ERPNext, trigger webhook again, verify `changed: true` in response

## Notes

- **Multiple Records:** If multiple App Home records exist, the middleware selects the latest one (by `modified` timestamp). Ensure your new field is included in the latest record.
- **Backward Compatibility:** If a field doesn't exist in older App Home records, the transformer will use default values (empty array, empty string, 0, etc.).
- **Hash Changes:** Any change to a field will trigger a hash change, which will cause the sync system to return the updated data to clients.

## Support

For questions or issues:
1. Check middleware logs: `/logs/error.log`
2. Verify ERPNext App Home record has the new field
3. Verify transformer includes the new field
4. Check API response includes the new field
