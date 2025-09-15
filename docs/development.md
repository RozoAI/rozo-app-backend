# Development Guide

This document covers development patterns, coding standards, testing procedures, and best practices for the Rozo Backend API.

## Development Patterns

### Function Development Patterns

1. **Authentication**: Always use dual auth pattern (Privy → Dynamic fallback)
2. **Database Queries**: Use OR logic for merchant lookups with both ID types
3. **Error Handling**: Consistent error response structure across all functions
4. **CORS**: All functions include proper CORS headers
5. **TypeScript**: Strict typing with proper interfaces
6. **Performance Monitoring**: Include timing metrics for critical operations
7. **Status Validation**: Always check merchant status before processing
8. **Currency Conversion**: Use cached currency rates for better performance
9. **Order Expiration**: Set `expired_at` field for all new orders
10. **Cron Jobs**: Include health checks and manual trigger endpoints

### Authentication Pattern

```typescript
// Standard dual authentication pattern
const authHeader = req.headers.get("Authorization");
const token = extractBearerToken(authHeader);

if (!token) {
  return Response.json(
    { error: "Missing or invalid authorization header" },
    { status: 401, headers: corsHeaders }
  );
}

// Verify with Privy first
const privy = await verifyPrivyJWT(token, PRIVY_APP_ID, PRIVY_APP_SECRET);

// Fallback to Dynamic
const tokenVerification = await verifyDynamicJWT(token, DYNAMIC_ENV_ID);

if (!tokenVerification.success && !privy.success) {
  return Response.json(
    { error: "Invalid or expired token" },
    { status: 401, headers: corsHeaders }
  );
}

let userProviderId = null;
let isPrivyAuth = false;

if (tokenVerification.success) {
  userProviderId = tokenVerification.payload.sub;
}

if (privy.success) {
  userProviderId = privy.payload?.id;
  isPrivyAuth = true;
}
```

### Database Query Pattern

```typescript
// Use appropriate column based on auth provider
const { data: merchant, error: merchantError } = isPrivyAuth
  ? await merchantQuery.eq("privy_id", userProviderId).single()
  : await merchantQuery.eq("dynamic_id", userProviderId).single();
```

### Error Handling Pattern

```typescript
// Consistent error response structure
return {
  success: false,
  error: "Error message",
  code: "ERROR_CODE" // Optional
};

// HTTP response with CORS headers
return Response.json(
  { success: false, error: "Error message" },
  { status: 400, headers: corsHeaders }
);
```

## Code Quality Standards

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Code Formatting

```bash
# Format code
deno fmt

# Lint code
deno lint

# Type check
deno check **/*.ts
```

### Interface Definitions

```typescript
// Comprehensive interface definitions
interface CreateOrderRequest {
  display_currency: string;
  display_amount: number;
  description?: string;
  redirect_uri?: string;
}

interface OrderData {
  number: string;
  merchant_id: string;
  payment_id: string;
  required_amount_usd: number;
  merchant_chain_id: string;
  merchant_address: string;
  display_currency: string;
  display_amount: number;
  required_token: string;
  status: string;
  expired_at: string;
  payment_data: unknown;
  created_at: string;
  updated_at: string;
}

interface ValidationResult {
  success: boolean;
  error?: string;
  code?: string;
}
```

## Testing Procedures

### Local Testing

```bash
# Test functions locally
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer <jwt-token>"

# Test order creation
curl -X POST "http://localhost:54321/functions/v1/orders" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"display_currency": "USD", "display_amount": 10.00}'

# Test expired orders cron manually
curl -X POST "http://localhost:54321/functions/v1/expired-orders/trigger"

# Test health check
curl -X GET "http://localhost:54321/functions/v1/expired-orders/health"
```

### Authentication Testing

```bash
# Test with Privy token
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer <privy-jwt-token>"

# Test with Dynamic token
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer <dynamic-jwt-token>"

# Test invalid token
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer invalid-token"
```

### Error Testing

```bash
# Test missing authorization
curl -X GET "http://localhost:54321/functions/v1/merchants"

# Test invalid order data
curl -X POST "http://localhost:54321/functions/v1/orders" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

## Database Migrations

### Creating Migrations

```bash
# Generate new migration
npx supabase migration new <migration_name>

# Apply migrations locally
npx supabase db reset

# Push to production
npx supabase db push
```

### Migration Best Practices

1. **Always Backup**: Backup production data before migrations
2. **Test Locally**: Test migrations on local database first
3. **Rollback Plan**: Have rollback strategy for complex migrations
4. **Index Creation**: Add indexes after data migration
5. **Constraint Addition**: Add constraints after data validation

### Example Migration

```sql
-- Migration: Add expired_at and payment_data to orders
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Add columns (nullable for backfill compatibility)
ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone;

ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "payment_data" jsonb;

-- Backfill expired_at for existing PENDING orders to created_at + 5 minutes
UPDATE "public"."orders"
SET "expired_at" = ("created_at" + interval '5 minutes')
WHERE "expired_at" IS NULL 
  AND "status" = 'PENDING';

-- Indexes to improve queries by expiration and status
CREATE INDEX IF NOT EXISTS "orders_expired_at_idx" ON "public"."orders" USING "btree" ("expired_at");
CREATE INDEX IF NOT EXISTS "orders_status_expired_idx" ON "public"."orders" USING "btree" ("status", "expired_at");

RESET ALL;
```

## Function Development

### Standard Function Structure

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, PUT, OPTIONS",
};

// Main serve function
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authentication logic
    const authHeader = req.headers.get("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Dual authentication
    const privy = await verifyPrivyJWT(token, PRIVY_APP_ID, PRIVY_APP_SECRET);
    const tokenVerification = await verifyDynamicJWT(token, DYNAMIC_ENV_ID);

    if (!tokenVerification.success && !privy.success) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: corsHeaders }
      );
    }

    let userProviderId = null;
    let isPrivyAuth = false;

    if (tokenVerification.success) {
      userProviderId = tokenVerification.payload.sub;
    }

    if (privy.success) {
      userProviderId = privy.payload?.id;
      isPrivyAuth = true;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Route handling
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Route: POST / - Main endpoint
    if (req.method === "POST") {
      return await handleMainEndpoint(req, supabase, userProviderId, isPrivyAuth);
    }

    // Route not found
    return Response.json(
      { error: "Route not found" },
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
```

### Hono Function Structure

```typescript
import { Hono } from "https://deno.land/x/hono@v3.12.8/mod.ts";
import { cors } from "https://deno.land/x/hono@v3.12.8/middleware.ts";
import { dualAuthMiddleware } from "../../_shared/dual-auth-middleware.ts";

const app = new Hono().basePath(`/deposits`);

// Configure CORS
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
    allowMethods: ["POST", "GET", "PUT", "OPTIONS"],
  })
);

// Use dual auth middleware
app.use(dualAuthMiddleware);

// Routes
app.post("/", handleCreate);
app.get("/", handleGetAll);

export default app;
```

## Performance Best Practices

### Caching Implementation

```typescript
// Use currency cache for conversions
const result = await currencyCache.convertToUSD(supabase, currency, amount);

if (!result.success || result.usdAmount === undefined) {
  return { success: false, error: result.error };
}
```

### Performance Monitoring

```typescript
// Include timing metrics
const startTime = Date.now();

try {
  // ... function logic
  
  const processingTime = Date.now() - startTime;
  console.log(`Operation completed in ${processingTime}ms`);
  
  return { success: true, ...result };
} catch (error) {
  const processingTime = Date.now() - startTime;
  console.error(`Operation failed after ${processingTime}ms:`, error);
  
  return { success: false, error: error.message };
}
```

### Database Optimization

```typescript
// Use parallel operations where possible
const [merchantResult, conversionResult] = await Promise.all([
  validateMerchant(supabase, userProviderId, isPrivyAuth),
  convertCurrencyToUSD(supabase, currency, amount)
]);

// Use efficient queries with proper indexes
const { data: orders } = await supabase
  .from("orders")
  .select("*")
  .eq("merchant_id", merchantId)
  .order("created_at", { ascending: false })
  .range(offset, offset + limit - 1);
```

## Security Best Practices

### Input Validation

```typescript
// Validate required fields
const requiredFields = ["display_currency", "display_amount"];

for (const field of requiredFields) {
  if (!orderData[field as keyof CreateOrderRequest]) {
    return Response.json(
      { success: false, error: `Missing required field: ${field}` },
      { status: 400, headers: corsHeaders }
    );
  }
}

// Validate numeric fields
if (typeof orderData.display_amount !== "number" || orderData.display_amount <= 0) {
  return Response.json(
    { success: false, error: "display_amount must be a positive number" },
    { status: 400, headers: corsHeaders }
  );
}
```

### Status Validation

```typescript
// Always check merchant status
if (merchant.status === 'PIN_BLOCKED') {
  return {
    success: false,
    error: 'Account blocked due to PIN security violations',
    code: 'PIN_BLOCKED'
  };
}

if (merchant.status === 'INACTIVE') {
  return {
    success: false,
    error: 'Account is inactive',
    code: 'INACTIVE'
  };
}
```

## Deployment Guidelines

### Environment Variables

```bash
# Required environment variables
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DYNAMIC_ENV_ID=your_dynamic_env_id
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
DAIMO_API_KEY=your_daimo_api_key
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
ROZO_PAY_URL=your_rozo_pay_url
```

### Deployment Process

```bash
# Link to Supabase project
npx supabase link --project-ref <project-ref>

# Push database schema
npx supabase db push --include-seed

# Deploy all functions
npx supabase functions deploy

# Deploy specific function
npx supabase functions deploy orders
```

### Health Checks

```bash
# Check function health
curl -X GET "https://your-project.supabase.co/functions/v1/expired-orders/health"

# Manual trigger for testing
curl -X POST "https://your-project.supabase.co/functions/v1/expired-orders/trigger"
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Check JWT token validity and environment variables
2. **Database Errors**: Verify Supabase connection and permissions
3. **Performance Issues**: Check cache hit rates and database indexes
4. **Cron Job Issues**: Verify cron configuration and function deployment

### Debugging

```typescript
// Enable detailed logging
console.log("Debug info:", { userProviderId, isPrivyAuth, merchantId });

// Check environment variables
console.log("Environment check:", {
  hasSupabaseUrl: !!Deno.env.get("SUPABASE_URL"),
  hasServiceKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  hasDynamicId: !!Deno.env.get("DYNAMIC_ENV_ID"),
  hasPrivyId: !!Deno.env.get("PRIVY_APP_ID"),
});
```

### Error Analysis

```typescript
// Comprehensive error logging
catch (error) {
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    userProviderId,
    isPrivyAuth,
  });
  
  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}
```
