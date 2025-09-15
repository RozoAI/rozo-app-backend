# System Architecture

This document covers the technical architecture, project structure, and core functions of the Rozo Backend API.

## Tech Stack

- **Database**: PostgreSQL (Supabase)
- **Compute**: Supabase Edge Functions (Deno Runtime, TypeScript)
- **Authentication**: Dual provider support
  - [Dynamic](https://www.dynamic.xyz/) (Wallet-based JWT authentication)
  - [Privy](https://privy.io/) (Wallet authentication and user management)
- **Web Framework**: [Hono](https://hono.dev/) (for deposits function)
- **Payments**: [Daimo Pay](https://pay.daimo.com/) (Payment processing and webhooks)
- **Real-time Notifications**: [Pusher](https://pusher.com/) (For instant updates on payment status)
- **Caching**: In-memory currency rate caching with TTL
- **Cron Jobs**: Automated order expiration and currency updates

## Project Structure

```text
├── docs/                   # Documentation
│   ├── architecture.md    # This file
│   ├── merchant-status.md # Merchant and PIN system
│   ├── order-system.md    # Order lifecycle and status
│   ├── performance.md     # Caching and monitoring
│   ├── development.md     # Development guidelines
│   └── deployment.md      # Setup and deployment
├── example.env            # Environment variable template
├── supabase/
│   ├── _shared/           # Shared utilities and middleware
│   │   ├── daimo-pay.ts   # Daimo payment integration
│   │   ├── currency-cache.ts # Currency rate caching with TTL
│   │   ├── dual-auth-middleware.ts # Dual auth middleware (Hono)
│   │   ├── dynamic-middleware.ts # Dynamic auth middleware (legacy)
│   │   ├── pin-validation.ts # PIN code validation utilities
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
│   │   ├── expired-orders/ # Automated expired order processing
│   │   │   ├── index.ts   # Cron job for expired order cleanup
│   │   │   ├── cron.json  # Cron schedule (every 5 minutes)
│   │   │   └── README.md  # Function documentation
│   │   └── update-currencies/ # Currency rate updates (cron job)
│   │       ├── index.ts   # Currency update logic
│   │       ├── cron.json  # Cron schedule configuration
│   │       └── README.md  # Function documentation
│   ├── migrations/        # Database schema migrations
│   │   ├── 20250618174036_initial_setup.sql
│   │   ├── 20250621085630_withdrawals.sql
│   │   ├── 20250623074412_order_number.sql
│   │   ├── 20250630142432_deposits.sql
│   │   ├── 20250914172526_remote_schema.sql
│   │   ├── 20250914172728_add_privy_id.sql # Privy integration
│   │   ├── 20251020111110_add_merchant_pincode_status.sql # PIN code & status
│   │   ├── 20251022120000_add_orders_expired_payment_data.sql # Order enhancements
│   │   └── 20251023000000_add_preferred_token_id_to_orders.sql # Preferred token system
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

- **Manages**: Order lifecycle (creation, retrieval, status tracking, payment regeneration)
- **Auth**: Dual JWT support (Dynamic or Privy)
- **Features**:
  - Order creation with cached currency conversion
  - Preferred token system (user choice vs merchant default)
  - Payment regeneration with optional token changes
  - Automatic expiration (10 minutes from creation)
  - Pagination and status filtering
  - Performance monitoring and metrics
- **Database Fields**: `expired_at`, `payment_data` (jsonb), `preferred_token_id`
- **Endpoints**:
  - `POST /orders` - Create new order
  - `GET /orders` - List orders with pagination
  - `GET /orders/{id}` - Get single order
  - `POST /orders/{id}/regenerate-payment` - Regenerate payment link
- **Integrates with**: Daimo Pay for payment processing, currency cache, tokens table

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

### 6. `/expired-orders`

- **Type**: Cron job function
- **Manages**: Automatic processing of expired orders
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Features**:
  - Updates expired PENDING orders to EXPIRED status
  - Handles orders with and without `expired_at` field
  - Performance monitoring and statistics
  - Merchant notification logging
- **Endpoints**: Health check, manual trigger for testing

### 7. `/update-currencies`

- **Type**: Cron job function
- **Manages**: Currency exchange rate updates
- **Schedule**: Automated updates via cron
- **Features**: Fetches rates from ExchangeRate-API, updates database

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

## Database Schema

### Core Tables

- **merchants**: Merchant profiles with dual authentication support
- **orders**: Order lifecycle with expiration and payment data
- **deposits**: Merchant deposit requests
- **withdrawals**: Merchant withdrawal processing
- **currencies**: Exchange rates for currency conversion
- **tokens**: Supported payment tokens and chains

### Key Relationships

- Merchants can have multiple orders, deposits, and withdrawals
- Orders link to merchants via `merchant_id`
- Orders include payment data and expiration timestamps
- Currency conversion uses cached rates from currencies table

## Performance Architecture

- **Currency Caching**: In-memory cache with 5-minute TTL
- **Database Indexes**: Optimized queries for status and expiration
- **Parallel Processing**: Concurrent operations where possible
- **Monitoring**: Performance metrics and error tracking
- **Cron Jobs**: Automated cleanup and maintenance tasks

## Security Architecture

- **Dual Authentication**: Multiple auth providers for redundancy
- **PIN Code System**: Additional security layer for merchants
- **Status Management**: Account status enforcement across all functions
- **Webhook Validation**: Secure payment callback processing
- **Input Validation**: Comprehensive data validation and sanitization
