# Deployment Guide

This document covers the complete setup, configuration, and deployment process for the Rozo Backend API.

## Prerequisites

- [Deno](https://deno.land/) (latest version)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Node.js and npm (for Supabase CLI)

## Installation

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Install Deno

```bash
# macOS
brew install deno

# Windows
iwr https://deno.land/install.ps1 -useb | iex

# Linux
curl -fsSL https://deno.land/install.sh | sh
```

## Environment Configuration

### 1. Copy Environment Template

```bash
cp example.env .env.local
```

### 2. Required Environment Variables

Configure the following variables in `.env.local`:

#### Supabase Configuration

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

#### Authentication Providers

```bash
# Dynamic Authentication
DYNAMIC_ENV_ID=your_dynamic_environment_id

# Privy Authentication
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

#### Payment Processing

```bash
# Daimo Pay Configuration
DAIMO_API_KEY=your_daimo_api_key
ROZO_PAY_URL=your_rozo_pay_url
```

#### Real-time Notifications

```bash
# Pusher Configuration
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster
```

### 3. Environment Variable Sources

- **Supabase**: Get from your Supabase project dashboard
- **Dynamic**: Get from Dynamic dashboard
- **Privy**: Get from Privy dashboard
- **Daimo**: Get from Daimo Pay dashboard
- **Pusher**: Get from Pusher dashboard

## Local Development Setup

### 1. Start Supabase Local Stack

```bash
# Initialize Supabase (first time only)
npx supabase init

# Start local Supabase stack
npx supabase start
```

This will start:
- PostgreSQL database
- Supabase API
- Edge Functions runtime
- Local dashboard

### 2. Apply Database Migrations

```bash
# Apply all migrations and seed data
npx supabase db push --include-seed

# Or reset database (if needed)
npx supabase db reset
```

### 3. Start Edge Functions Locally

```bash
# Start all functions with environment variables
npx supabase functions serve --env-file .env.local
```

Functions will be available at:
- `http://localhost:54321/functions/v1/merchants`
- `http://localhost:54321/functions/v1/orders`
- `http://localhost:54321/functions/v1/deposits`
- `http://localhost:54321/functions/v1/withdrawals`
- `http://localhost:54321/functions/v1/payment-callback`
- `http://localhost:54321/functions/v1/expired-orders`
- `http://localhost:54321/functions/v1/update-currencies`

### 4. Verify Local Setup

```bash
# Test health check
curl -X GET "http://localhost:54321/functions/v1/expired-orders/health"

# Test merchants endpoint (requires valid JWT)
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer <jwt-token>"
```

## Production Deployment

### 1. Link to Supabase Project

```bash
# Link to your production Supabase project
npx supabase link --project-ref <your-project-ref>
```

### 2. Set Production Environment Variables

In your Supabase project dashboard, go to Settings > Edge Functions and set:

```bash
# Supabase (automatically available)
SUPABASE_URL=your_production_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Authentication
DYNAMIC_ENV_ID=your_production_dynamic_env_id
PRIVY_APP_ID=your_production_privy_app_id
PRIVY_APP_SECRET=your_production_privy_app_secret

# Payments
DAIMO_API_KEY=your_production_daimo_api_key
ROZO_PAY_URL=your_production_rozo_pay_url

# Notifications
PUSHER_APP_ID=your_production_pusher_app_id
PUSHER_KEY=your_production_pusher_key
PUSHER_SECRET=your_production_pusher_secret
PUSHER_CLUSTER=your_production_pusher_cluster
```

### 3. Deploy Database Schema

```bash
# Push database migrations to production
npx supabase db push --include-seed
```

### 4. Deploy Edge Functions

```bash
# Deploy all functions
npx supabase functions deploy

# Deploy specific function
npx supabase functions deploy orders
npx supabase functions deploy merchants
npx supabase functions deploy deposits
npx supabase functions deploy withdrawals
npx supabase functions deploy payment-callback
npx supabase functions deploy expired-orders
npx supabase functions deploy update-currencies
```

### 5. Verify Production Deployment

```bash
# Test production endpoints
curl -X GET "https://your-project.supabase.co/functions/v1/expired-orders/health"

# Test with production JWT
curl -X GET "https://your-project.supabase.co/functions/v1/merchants" \
  -H "Authorization: Bearer <production-jwt-token>"
```

## Cron Job Configuration

### 1. Expired Orders Cron

The expired orders cron runs automatically every 5 minutes:

```json
{
  "cron": "*/5 * * * *",
  "description": "Process expired orders every 5 minutes"
}
```

### 2. Currency Updates Cron

The currency update cron runs on a schedule defined in its configuration:

```json
{
  "cron": "0 */6 * * *",
  "description": "Update currency rates every 6 hours"
}
```

### 3. Manual Cron Testing

```bash
# Test expired orders cron manually
curl -X POST "https://your-project.supabase.co/functions/v1/expired-orders/trigger"

# Test currency updates manually
curl -X POST "https://your-project.supabase.co/functions/v1/update-currencies"
```

## Webhook Configuration

### 1. Daimo Pay Webhooks

Configure webhook URL in Daimo Pay dashboard:

```
https://your-project.supabase.co/functions/v1/payment-callback
```

### 2. Webhook Security

The webhook endpoint validates incoming requests:

```typescript
// Webhook authentication (currently disabled for testing)
const authHeader = req.headers.get('Authorization');
const expectedToken = Deno.env.get('DAIMO_WEBHOOK_SECRET');

if (providedToken !== expectedToken) {
  return new Response('Unauthorized: Invalid token', { status: 401 });
}
```

## Monitoring & Logging

### 1. Function Logs

```bash
# View function logs
npx supabase functions logs orders
npx supabase functions logs expired-orders
npx supabase functions logs payment-callback
```

### 2. Database Monitoring

Monitor database performance in Supabase dashboard:
- Query performance
- Connection usage
- Index usage
- Error rates

### 3. Performance Metrics

Key metrics to monitor:
- Order creation time (<200ms target)
- Currency cache hit rate (>80% target)
- Database query count (minimize)
- Error rates (<1% target)

## Security Considerations

### 1. Environment Variables

- Never commit `.env.local` to version control
- Use Supabase dashboard for production secrets
- Rotate API keys regularly
- Use least privilege principle

### 2. Database Security

- Use service role key only for server-side operations
- Implement Row Level Security (RLS) policies
- Regular security audits
- Monitor for suspicious activity

### 3. Function Security

- Validate all inputs
- Implement rate limiting
- Use proper CORS configuration
- Monitor for abuse

## Troubleshooting

### Common Deployment Issues

#### 1. Environment Variables Not Set

```bash
# Check if variables are set
npx supabase functions logs orders | grep "Missing environment variables"
```

**Solution**: Set variables in Supabase dashboard

#### 2. Database Connection Issues

```bash
# Check database status
npx supabase status
```

**Solution**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

#### 3. Function Deployment Failures

```bash
# Check deployment logs
npx supabase functions deploy orders --debug
```

**Solution**: Check function syntax and dependencies

#### 4. Cron Jobs Not Running

```bash
# Check cron configuration
npx supabase functions logs expired-orders
```

**Solution**: Verify cron.json configuration and function deployment

### Debug Commands

```bash
# Check Supabase status
npx supabase status

# Check function health
curl -X GET "https://your-project.supabase.co/functions/v1/expired-orders/health"

# Test database connection
npx supabase db ping

# View recent logs
npx supabase functions logs --follow
```

## Maintenance

### 1. Regular Updates

- Update Deno and Supabase CLI regularly
- Monitor for security updates
- Update dependencies as needed

### 2. Database Maintenance

- Monitor database size and performance
- Regular backup verification
- Index optimization
- Query performance analysis

### 3. Function Maintenance

- Monitor function performance
- Update error handling
- Optimize for better performance
- Regular security reviews

## Scaling Considerations

### 1. Horizontal Scaling

- Supabase Edge Functions auto-scale
- Database connection pooling
- CDN for static assets
- Load balancing for high traffic

### 2. Performance Optimization

- Database indexing
- Query optimization
- Caching strategies
- Function optimization

### 3. Monitoring

- Set up alerts for critical metrics
- Monitor error rates
- Track performance trends
- Capacity planning
