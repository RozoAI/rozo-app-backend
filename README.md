# Rozo Backend API

A high-performance payment processing backend built with Supabase Edge Functions, supporting dual authentication providers and automated order management.

## 🚀 Quick Start

```bash
# Install dependencies
npm install -g supabase

# Setup environment
cp example.env .env.local

# Start local development
npx supabase start
npx supabase functions serve --env-file .env.local
```

## 📚 Documentation

- **[System Architecture](docs/architecture.md)** - Tech stack, project structure, and core functions
- **[Merchant Status & PIN System](docs/merchant-status.md)** - Authentication, merchant management, and security
- **[Order System](docs/order-system.md)** - Order lifecycle, status management, and expiration
- **[Performance & Caching](docs/performance.md)** - Currency caching, monitoring, and optimization
- **[Development Guide](docs/development.md)** - Coding patterns, testing, and best practices
- **[Deployment Guide](docs/deployment.md)** - Production setup and deployment instructions

## 🏗️ Core Features

- **Dual Authentication**: Dynamic + Privy wallet authentication
- **Payment Processing**: Daimo Pay integration with webhooks
- **Order Management**: Automatic expiration and status tracking
- **Currency Conversion**: High-performance caching system
- **Real-time Notifications**: Pusher integration
- **Security**: PIN code system with merchant status management

## 🛠️ Tech Stack

- **Database**: PostgreSQL (Supabase)
- **Compute**: Supabase Edge Functions (Deno + TypeScript)
- **Authentication**: Dynamic + Privy
- **Payments**: Daimo Pay
- **Notifications**: Pusher
- **Framework**: Hono (for deposits)

## 📁 Project Structure

```text
├── docs/                   # Documentation
├── supabase/
│   ├── _shared/           # Shared utilities
│   ├── functions/         # Edge Functions
│   └── migrations/        # Database migrations
└── example.env           # Environment template
```

## 🔧 Environment Variables

See [Deployment Guide](docs/deployment.md) for complete environment setup.

Required variables:

- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
- `DYNAMIC_ENV_ID` & `PRIVY_APP_ID` & `PRIVY_APP_SECRET`
- `DAIMO_*` variables for payment processing
- `PUSHER_*` variables for notifications

## 🚀 Deployment

```bash
# Deploy to production
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed
npx supabase functions deploy
```

## 📊 Status Overview

- **Merchant Status**: `ACTIVE` | `INACTIVE` | `PIN_BLOCKED`
- **Order Status**: `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED` | `DISCREPANCY`
- **Order Expiration**: 5 minutes automatic cleanup
- **Currency Caching**: 5-minute TTL with LRU eviction

## 🤝 Contributing

1. Follow the [Development Guide](docs/development.md)
2. Use `deno fmt` and `deno lint` for code quality
3. Test functions locally before deployment
4. Update documentation for new features

## 📄 License

See [LICENSE](LICENSE) file for details.
