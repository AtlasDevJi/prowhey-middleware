# ERPNext Customer Integration

## Overview

This document outlines the current and future implementation of ERPNext customer integration for the Prowhey Middleware.

## Current Implementation

### Fields Added

Two fields have been added to the user model:

1. **`erpnextCustomerId`** (string, optional)
   - Stores the ERPNext customer ID when a customer account is created in ERPNext
   - Initially set from Redis/admin
   - Used to link app users with ERPNext customer records

2. **`approvedCustomer`** (boolean, default: false)
   - Indicates whether the customer is approved for placing orders, checking payments, and viewing purchase history
   - Initially set from Redis/admin
   - Controls access to order-related features

### Storage

Both fields are stored in the user JSON object in Redis:
```
Key: user:usr_abc123
Value: {
  ...
  "erpnextCustomerId": "CUST-001" or null,
  "approvedCustomer": true or false,
  ...
}
```

### API Endpoints

#### Signup
- `POST /api/auth/signup` - Accepts `erpnext_customer_id` and `approved_customer` in request body (optional)

#### Profile Update
- `PUT /api/auth/profile` - Can update `erpnext_customer_id` and `approved_customer` fields

#### Get Profile
- `GET /api/auth/me` - Returns `erpnextCustomerId` and `approvedCustomer` in response

### Setting Fields from Redis

**Manual Setup (Current):**
```bash
# Get user data
GET user:usr_abc123

# Update user with ERPNext customer ID and approval
# (Use admin endpoint or direct Redis update)
```

**Node.js Example:**
```javascript
const { updateUser } = require('./src/services/auth/user-storage');

// Set ERPNext customer ID and approve customer
await updateUser('usr_abc123', {
  erpnextCustomerId: 'CUST-001',
  approvedCustomer: true,
});
```

## Future Implementation (Next Version)

### Planned Features

1. **Automatic Customer Creation in ERPNext**
   - When user registers and meets criteria (e.g., ID verified, trust score > threshold)
   - Create customer record in ERPNext via API
   - Store returned customer ID in `erpnextCustomerId`
   - Set `approvedCustomer` to `true`

2. **Order Placement**
   - Endpoint: `POST /api/orders/create`
   - Requires: `approvedCustomer: true` and `erpnextCustomerId` must be set
   - Creates sales order in ERPNext
   - Returns order details

3. **Payment Checking**
   - Endpoint: `GET /api/payments/:orderId` or `GET /api/payments/status`
   - Requires: `approvedCustomer: true`
   - Fetches payment status from ERPNext
   - Shows outstanding invoices, payment history

4. **Purchase History**
   - Endpoint: `GET /api/orders/history`
   - Requires: `approvedCustomer: true`
   - Fetches past orders from ERPNext
   - Returns order list with details (items, dates, status, totals)

5. **Customer Approval Workflow**
   - Admin endpoint to approve customers
   - Automatic approval based on criteria (ID verified, trust score, etc.)
   - Notification when customer is approved

### Integration Points

**ERPNext API Endpoints to Use:**
- `POST /api/resource/Customer` - Create customer
- `GET /api/resource/Customer/:name` - Get customer details
- `POST /api/resource/Sales Order` - Create sales order
- `GET /api/resource/Sales Invoice` - Get invoices/payments
- `GET /api/resource/Sales Order` - Get order history

### Security Considerations

1. **Approval Required**: Only approved customers can place orders
2. **ID Verification**: May require ID verification before approval
3. **Trust Score**: May require minimum trust score for approval
4. **Credit Limits**: Link to ERPNext credit limits
5. **Rate Limiting**: Limit order creation frequency

### Data Flow (Future)

```
User Registers → ID Verification → Trust Score Check
  ↓
If Approved:
  → Create Customer in ERPNext
  → Store erpnextCustomerId
  → Set approvedCustomer: true
  ↓
User Can:
  → Place Orders (POST /api/orders/create)
  → Check Payments (GET /api/payments/*)
  → View History (GET /api/orders/history)
```

## Current Usage

### Setting Customer ID and Approval (Admin/Redis)

**Via API (if admin endpoints exist):**
```javascript
PUT /api/admin/users/:userId
{
  "erpnext_customer_id": "CUST-001",
  "approved_customer": true
}
```

**Direct Redis Update:**
```bash
# Get current user
GET user:usr_abc123

# Update with new data (merge with existing)
# Use Redis SET with complete JSON object
```

**Node.js Script:**
```javascript
const { updateUser } = require('./src/services/auth/user-storage');

async function approveCustomer(userId, erpnextCustomerId) {
  await updateUser(userId, {
    erpnextCustomerId: erpnextCustomerId,
    approvedCustomer: true,
  });
}

// Usage
await approveCustomer('usr_abc123', 'CUST-001');
```

### Checking Customer Status

**Via API:**
```javascript
GET /api/auth/me
// Returns:
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "erpnextCustomerId": "CUST-001",
      "approvedCustomer": true,
      ...
    }
  }
}
```

**Direct Redis:**
```bash
GET user:usr_abc123
# Parse JSON and check erpnextCustomerId and approvedCustomer fields
```

## Validation

### Schema Validation

- `erpnext_customer_id`: Optional string, max 100 characters
- `approved_customer`: Optional boolean, defaults to `false`

### Business Logic (Future)

- `approvedCustomer` can only be `true` if `erpnextCustomerId` is set
- Order endpoints should check both fields
- Admin approval workflow should validate user eligibility

## Testing

### Test Customer Approval

```javascript
// 1. Create/update user with ERPNext customer ID
PUT /api/auth/profile
{
  "erpnext_customer_id": "CUST-001",
  "approved_customer": true,
  "passwordConfirmed": true
}

// 2. Verify in profile
GET /api/auth/me
// Should return erpnextCustomerId and approvedCustomer: true
```

## Notes

- Fields are optional and can be set at any time
- `approvedCustomer` defaults to `false` for security
- Both fields can be updated via profile endpoint (with authentication)
- In future versions, these will be managed automatically through ERPNext integration

---

**Last Updated:** 2025-01-20  
**Version:** 1.0 (Current: Manual setup, Future: Full ERPNext integration)
