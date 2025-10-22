# Order System

This document covers the order lifecycle, status management, expiration system, and data structure.

## Order Status System

Orders follow a comprehensive lifecycle with automatic expiration:

### Order Statuses

- **`PENDING`**: Order created, waiting for payment
- **`PROCESSING`**: Payment initiated, transaction in progress
- **`COMPLETED`**: Payment successful, order fulfilled
- **`FAILED`**: Payment failed or refunded
- **`EXPIRED`**: Order expired without payment (after 5 minutes)
- **`DISCREPANCY`**: Payment bounced or validation issues

### Status Transition Flow

```mermaid
graph TD
    A[PENDING] --> B[PROCESSING]
    B --> C[COMPLETED]
    B --> D[FAILED]
    B --> E[DISCREPANCY]
    A --> F[EXPIRED]
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#9f9,stroke:#333,stroke-width:2px
    style D fill:#f99,stroke:#333,stroke-width:2px
    style E fill:#ff9,stroke:#333,stroke-width:2px
    style F fill:#f90,stroke:#333,stroke-width:2px
```

### Status Hierarchy

```typescript
const STATUS_HIERARCHY = {
  PENDING: 0,
  PROCESSING: 1,
  COMPLETED: 2,
  FAILED: 2,
  EXPIRED: 2,
  DISCREPANCY: 2,
};
```

## Order Expiration System

### Expiration Logic

- **Expiration Time**: 5 minutes from creation (`expired_at` field)
- **Automatic Processing**: Cron job runs every 5 minutes
- **Fallback Logic**: Orders without `expired_at` expire after 5 minutes from `created_at`
- **Status Transition**: Expired orders automatically become `EXPIRED`

### Expiration Implementation

```typescript
// Order creation with expiration
const now = new Date();
const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes

const orderToInsert = {
  // ... other fields
  created_at: now.toISOString(),
  expired_at: expiresAt.toISOString(),
  status: "PENDING",
};
```

### Cron Job Processing

```typescript
// Find expired orders
const now = new Date().toISOString();
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

const { data: expiredOrders } = await supabase
  .from("orders")
  .select("order_id, number, merchant_id, created_at, expired_at")
  .eq("status", "PENDING")
  .or(`expired_at.lt.${now},and(expired_at.is.null,created_at.lt.${fiveMinutesAgo})`);
```

## Order Data Structure

### Core Fields

- **`order_id`**: Unique identifier (UUID)
- **`merchant_id`**: Reference to merchant (UUID)
- **`payment_id`**: Daimo payment identifier
- **`number`**: Human-readable order number
- **`status`**: Current order status
- **`created_at`**: Order creation timestamp
- **`updated_at`**: Last update timestamp

### New Enhanced Fields

- **`expired_at`**: Timestamp when order expires
- **`payment_data`**: Complete Daimo payment response (jsonb)
- **`required_amount_usd`**: USD amount after currency conversion
- **`merchant_chain_id`**: Blockchain network for payment
- **`merchant_address`**: Merchant wallet address
- **`required_token`**: Token address for payment

### Payment Integration Fields

- **`display_currency`**: Currency shown to customer
- **`display_amount`**: Amount shown to customer
- **`description`**: Order description
- **`redirect_uri`**: Post-payment redirect URL

### Webhook Processing Fields

- **`callback_payload`**: Complete webhook data (jsonb)
- **`source_txn_hash`**: Source transaction hash
- **`source_chain_name`**: Source blockchain
- **`source_token_address`**: Source token address
- **`source_token_amount`**: Source token amount

## Order Creation Process

### Step-by-Step Flow

1. **Merchant Validation**: Verify merchant exists and is active
2. **Currency Conversion**: Convert display currency to USD using cache
3. **Order Number Generation**: Generate unique order number
4. **Payment Link Creation**: Create Daimo payment link
5. **Database Insertion**: Save order with expiration timestamp
6. **Response Generation**: Return order details and QR code

### Performance Optimizations

```typescript
// Modular function structure
async function createOrder(supabase, userProviderId, isPrivyAuth, orderData) {
  const startTime = Date.now();
  
  // Step 1: Validate merchant
  const merchantResult = await validateMerchant(supabase, userProviderId, isPrivyAuth);
  if (!merchantResult.success) return merchantResult;

  // Step 2: Convert currency using cache
  const conversionResult = await convertCurrencyToUSD(
    supabase, orderData.display_currency, orderData.display_amount
  );
  if (!conversionResult.success) return conversionResult;

  // Step 3: Generate order number
  const orderNumber = generateOrderNumber();

  // Step 4: Create payment link
  const paymentResult = await createPaymentLink(
    merchantResult.merchant, orderData, orderNumber, conversionResult.usdAmount
  );
  if (!paymentResult.success) return paymentResult;

  // Step 5: Insert order record
  const insertResult = await insertOrderRecord(
    supabase, orderData, merchantResult.merchant, orderNumber,
    paymentResult.paymentDetail, conversionResult.usdAmount
  );
  if (!insertResult.success) return insertResult;

  // Log performance metrics
  const processingTime = Date.now() - startTime;
  console.log(`Order creation completed in ${processingTime}ms for order ${orderNumber}`);

  return {
    success: true,
    paymentDetail: paymentResult.paymentDetail,
    order_id: insertResult.order.order_id,
    order_number: insertResult.order.number,
  };
}
```

## Order Retrieval

### Single Order

```typescript
// Get single order by ID
const { data: order } = await supabase
  .from("orders")
  .select("*")
  .eq("order_id", orderId)
  .eq("merchant_id", merchant.merchant_id)
  .single();
```

### Order List with Pagination

```typescript
// Get orders with pagination and filtering
const { data: orders } = await supabase
  .from("orders")
  .select("*")
  .eq("merchant_id", merchant.merchant_id)
  .order("created_at", { ascending: false })
  .range(offset, offset + limit - 1);
```

### Status Filtering

```typescript
// Filter by status
// Valid statuses: pending, completed, failed, expired, discrepancy
const applyStatusFilter = (query) => {
  if (!statusParam) return query;
  
  const status = statusParam.toLowerCase();
  return status === "pending"
    ? query.in("status", ["PENDING", "PROCESSING"])
    : query.eq("status", statusParam.toUpperCase());
};
```

## Webhook Processing

### Payment Status Updates

The `/payment-callback` function handles incoming webhooks from Daimo Pay:

```typescript
// Map webhook events to order status
function mapWebhookTypeToStatus(webhookType: string): PaymentStatus {
  switch (webhookType) {
    case "payment_started":
      return PaymentStatus.PROCESSING;
    case "payment.completed":
      return PaymentStatus.COMPLETED;
    case "payment_bounced":
      return PaymentStatus.DISCREPANCY;
    case "payment_refunded":
      return PaymentStatus.FAILED;
    default:
      throw new Error(`Unknown webhook type: ${webhookType}`);
  }
}
```

### Status Transition Validation

```typescript
// Prevent backward transitions
const currentStatusLevel = STATUS_HIERARCHY[currentStatus];
const newStatusLevel = STATUS_HIERARCHY[newStatus];

if (newStatusLevel < currentStatusLevel) {
  console.log(`Ignoring backward status transition from ${currentStatus} to ${newStatus}`);
  return Response.json("Status transition ignored", { status: 200 });
}
```

## Database Indexes

### Performance Optimization

```sql
-- Index for expiration queries
CREATE INDEX "orders_expired_at_idx" ON "public"."orders" USING "btree" ("expired_at");

-- Index for status + expiration queries
CREATE INDEX "orders_status_expired_idx" ON "public"."orders" USING "btree" ("status", "expired_at");

-- Index for order number lookups
CREATE INDEX "orders_number_idx" ON "public"."orders" USING "btree" ("number");
```

## Error Handling

### Validation Errors

```typescript
// Amount validation
if (required_amount_usd < 0.1) {
  return {
    success: false,
    error: "Cannot create order with amount less than 0.1 USD",
  };
}

// Currency validation
if (error || !currency) {
  return {
    success: false,
    error: "Currency not found",
  };
}
```

### Database Errors

```typescript
// Order insertion error handling
if (orderError) {
  return {
    success: false,
    error: orderError.message,
  };
}
```

## Monitoring & Analytics

### Performance Metrics

- **Order Creation Time**: Logged for each order
- **Currency Conversion**: Cache hit rates tracked
- **Expiration Processing**: Cron job statistics
- **Status Transitions**: Webhook processing metrics

### Business Metrics

- **Order Volume**: Orders created per time period
- **Success Rate**: Percentage of completed orders
- **Expiration Rate**: Percentage of expired orders
- **Average Order Value**: Mean order amount in USD

## Best Practices

### Development

1. **Always Set Expiration**: Include `expired_at` for all new orders
2. **Validate Status Transitions**: Prevent invalid status changes
3. **Handle Edge Cases**: Account for orders without expiration dates
4. **Performance Monitoring**: Log timing for critical operations
5. **Error Handling**: Provide clear error messages

### Operations

1. **Monitor Expiration**: Track expired order rates
2. **Status Validation**: Ensure proper status transitions
3. **Performance Tracking**: Monitor order creation times
4. **Error Analysis**: Analyze failed order patterns
5. **Capacity Planning**: Monitor order volume trends
