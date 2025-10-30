# Rozo Backend API

This project implements the backend services for Rozo, leveraging the power and
scalability of Supabase Edge Functions, written in TypeScript and running on
Deno. This serverless architecture allows for efficient, globally distributed
functions that execute close to your users and your Supabase PostgreSQL
database, ensuring low latency and high performance.

## Tech Stack

- **Database**: PostgreSQL (Supabase)
- **Compute**: Supabase Edge Functions (Deno Runtime, TypeScript)
- **Authentication**: Dual provider support
  - [Dynamic](https://www.dynamic.xyz/) (Wallet-based JWT authentication)
  - [Privy](https://privy.io/) (Wallet authentication and user management)
- **Web Framework**: [Hono](https://hono.dev/) (for deposits function)
- **Payments**: [Daimo Pay](https://pay.daimo.com/) (Payment processing and
  webhooks)
- **Real-time Notifications**: [Pusher](https://pusher.com/) (For instant
  updates on payment status)

## Project Structure

```
├── example.env            # Environment variable template
├── supabase/
│   ├── _shared/           # Shared utilities and middleware
│   │   ├── daimo-pay.ts   # Daimo payment integration
│   │   ├── dynamic-middleware.ts # Dynamic auth middleware (legacy)
│   │   ├── privy-middleware.ts   # Privy auth middleware (Hono)
│   │   └── utils.ts       # Common utility functions
│   ├── functions/         # Core application logic as Edge Functions
│   │   ├── merchants/     # Merchant profiles and settings management
│   │   │   ├── index.ts   # Main entry point (supports both auth providers)
│   │   │   ├── utils.ts   # JWT verification for Dynamic & Privy
│   │   │   └── deno.json  # Deno configuration
│   │   ├── orders/        # Order lifecycle management
│   │   │   ├── index.ts   # Main entry point (dual auth support)
│   │   │   ├── utils.ts   # Order utilities & JWT verification
│   │   │   └── deno.json  # Deno configuration
│   │   ├── deposits/      # Deposit management (Hono-based)
│   │   │   ├── index.ts   # Main entry point using Hono framework
│   │   │   ├── utils.ts   # Deposit creation and validation
│   │   │   └── deno.json  # Deno configuration
│   │   ├── withdrawals/   # Merchant withdrawal processing
│   │   │   ├── index.ts   # Main entry point (dual auth support)
│   │   │   ├── utils.ts   # Withdrawal utilities & JWT verification
│   │   │   └── deno.json  # Deno configuration
│   │   ├── payment-callback/  # Payment webhook processing
│   │   │   ├── index.ts   # Webhook handler (no auth required)
│   │   │   ├── pusher.ts  # Pusher notifications integration
│   │   │   └── deno.json  # Deno configuration
│   │   └── update-currencies/ # Currency rate updates (cron job)
│   │       ├── index.ts   # Currency update logic
│   │       ├── cron.json  # Cron schedule configuration
│   │       └── README.md  # Function documentation
│   ├── migrations/        # Database schema migrations
│   │   ├── 20250618174036_initial_setup.sql
│   │   ├── 20250621085630_withdrawals.sql
│   │   ├── 20250623074412_order_number.sql
│   │   ├── 20250630142432_deposits.sql
│   │   └── 20250914172728_add_privy_id.sql # Privy integration
│   └── seed.sql           # Initial data for development
```

## Supabase Edge Functions

Core backend logic is handled by these Supabase Edge Functions:

### 1. `/merchants`

- **Manages**: Merchant profiles (create, read, update)
- **Auth**: Dual JWT support (Dynamic or Privy)
- **Features**: Profile management, logo upload, merchant settings
- **Database**: Uses OR logic for `dynamic_id` and `privy_id` columns

### 2. `/orders`

- **Manages**: Order lifecycle (creation, retrieval, status tracking)
- **Auth**: Dual JWT support (Dynamic or Privy)
- **Features**: Order creation with currency conversion, pagination, status filtering
- **Integrates with**: Daimo Pay for payment processing

### 3. `/deposits`

- **Framework**: Built with Hono for modern routing and middleware
- **Manages**: Merchant deposit requests and tracking
- **Auth**: Privy middleware with Dynamic fallback
- **Features**: Deposit creation, history retrieval, status tracking
- **Integrates with**: Daimo Pay for payment processing

### 4. `/withdrawals`

- **Manages**: Merchant withdrawal requests and processing
- **Auth**: Dual JWT support (Dynamic or Privy)
- **Features**: Withdrawal creation, history retrieval

### 5. `/payment-callback`

- **Handles**: Incoming webhooks from Daimo Pay
- **Actions**: Updates order/deposit status, validates payment data
- **Auth**: Webhook secret authentication
- **Features**: Status transition validation, duplicate webhook handling
- **Integrates with**: Pusher for real-time notifications

### 6. `/update-currencies`

- **Type**: Cron job function
- **Manages**: Currency exchange rate updates
- **Schedule**: Automated updates via cron
- **Features**: Fetches rates from ExchangeRate-API, updates database

## Setup

### Prerequisites

- [Deno](https://deno.land/) (latest version)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### 1. **Install Supabase CLI**

```bash
npm install -g supabase
```

### 2. **Environment Configuration**

```bash
cp example.env .env.local
```

Configure the following required variables:

- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
- `DYNAMIC_ENV_ID` (for Dynamic authentication)
- `PRIVY_APP_ID` & `PRIVY_APP_SECRET` (for Privy authentication)
- `DAIMO_*` variables (for payment processing)
- `PUSHER_*` variables (for real-time notifications)

### 3. **Local Development**

```bash
# Start Supabase local stack
npx supabase start

# Apply database migrations
npx supabase db push --include-seed

# Start Edge Functions locally
npx supabase functions serve --env-file .env.local
```

### 4. **Deploy to Production**

```bash
# Link to your Supabase project
npx supabase link --project-ref <project-ref>

# Push database schema
npx supabase db push --include-seed

# Deploy all functions
npx supabase functions deploy

# Or deploy specific function
npx supabase functions deploy merchants
```

## Authentication Architecture

The system supports dual authentication providers:

### Dynamic Authentication

- Wallet-based JWT authentication
- Uses `dynamic_id` column in merchants table
- Supports embedded wallet addresses

### Privy Authentication

- Modern wallet authentication and user management
- Uses `privy_id` column in merchants table
- Enhanced user experience with better wallet support

### Implementation Pattern

All functions (except webhooks) follow this pattern:

1. Try Privy JWT verification first
2. Fallback to Dynamic JWT verification if Privy fails
3. Extract `userProviderId` from successful verification
4. Use OR logic in database queries: `privy_id.eq.${userProviderId},dynamic_id.eq.${userProviderId}`

## Environment Variables

See `example.env` for required configuration including:

- **Supabase**: Database and service credentials
- **Dynamic**: Environment ID for wallet authentication
- **Privy**: App ID and secret for authentication
- **Daimo**: Payment processing configuration
- **Pusher**: Real-time notification credentials

## Development Guidelines

### Code Quality

This project uses `deno lint` and `deno fmt` to enforce code quality and consistency:

```bash
# Format code
deno fmt

# Lint code
deno lint

# Type check
deno check **/*.ts
```

### Function Development Patterns

1. **Authentication**: Always use dual auth pattern (Privy → Dynamic fallback)
2. **Database Queries**: Use OR logic for merchant lookups with both ID types
3. **Error Handling**: Consistent error response structure across all functions
4. **CORS**: All functions include proper CORS headers
5. **TypeScript**: Strict typing with proper interfaces

### Testing

```bash
# Test functions locally
curl -X GET "http://localhost:54321/functions/v1/merchants" \
  -H "Authorization: Bearer <jwt-token>"
```

### Database Migrations

When adding new features that require database changes:

```bash
# Generate new migration
npx supabase migration new <migration_name>

# Apply migrations locally
npx supabase db reset

# Push to production
npx supabase db push
```
