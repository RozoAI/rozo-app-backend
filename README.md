# Rozo Backend API

This project implements the backend services for Rozo, leveraging the power and scalability of Supabase Edge Functions, written in TypeScript and running on Deno. This serverless architecture allows for efficient, globally distributed functions that execute close to your users and your Supabase PostgreSQL database, ensuring low latency and high performance.

## Tech Stack

- **Database**: PostgreSQL (Supabase)
- **Compute**: Supabase Edge Functions (Deno Runtime, TypeScript)
- **Authentication**: [Dynamic](https://www.dynamic.xyz/) (Wallet-based JWT authentication)
- **Payments**: [Daimo Pay](https://pay.daimo.com/) (Payment processing and webhooks)
- **Real-time Notifications**: [Pusher](https://pusher.com/) (For instant updates on payment status)

## Project Structure

```
├── example.env            # Environment variable template
├── supabase/
│   ├── functions/         # Core application logic as Edge Functions
│   │   ├── merchants/     # Handles merchant profiles and settings
│   │   │   ├── index.ts   # Main entry point for merchant operations
│   │   │   └── utils.ts   # Utility functions (e.g., JWT verification)
│   │   ├── orders/        # Manages order creation, retrieval, and status
│   │   │   ├── index.ts   # Main entry point for order operations
│   │   │   ├── daimoPay.ts# Integration with Daimo payment gateway
│   │   │   └── utils.ts   # Shared utilities
│   │   ├── payment-callback/  # Processes incoming payment webhooks
│   │   │   ├── index.ts   # Main entry point for webhook handling
│   │   │   ├── pusher.ts  # Integration with Pusher for notifications
│   │   └── withdrawals/   # Handles merchant withdrawal requests and processing
│   │       ├── index.ts   # Main entry point for withdrawal operations
│   │       └── utils.ts   # Withdrawal utility functions and validations
│   ├── migrations/        # Database schema migrations
│   └── seed.sql           # Initial data for development
```

## Supabase Edge Functions

Core backend logic is handled by these Supabase Edge Functions:

### 1. `/merchants`

- **Manages**: Merchant profiles (create, read, update).
- **Auth**: JWT (via Dynamic).

### 2. `/orders`

- **Manages**: Order lifecycle (creation, retrieval, status tracking).
- **Auth**: JWT (via Dynamic).
- **Integrates with**: Daimo Pay for payment processing.

### 3. `/payment-callback`

- **Handles**: Incoming webhooks from Daimo Pay.
- **Actions**: Updates order status, validates payment data.
- **Auth**: Webhook secret.
- **Integrates with**: Pusher for real-time notifications.

### 3. `/withdrawals`

- **Manages**: Merchant Withdrawals (creation, retrieval).
- **Auth**: JWT (via Dynamic).

## Setup

1. **Install Supabase CLI**

   ```bash
   npm install -g supabase
   ```

2. **Environment**

   ```bash
   cp example.env .env.local
   # Configure your variables
   ```

3. **Start locally**

   ```bash
   npx supabase start
   npx supabase functions serve --env-file .env.local
   ```

4. **Deploy**
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push --include-seed
   npx supabase functions deploy
   ```

## Environment Variables

See `example.env` for required configuration including Supabase, Dynamic, Daimo, and Pusher credentials.
