# Rozo Backend API

Backend services built with Supabase Edge Functions and PostgreSQL.

## Tech Stack

- **Database**: PostgreSQL (Supabase)
- **Runtime**: Deno (Edge Functions)
- **Auth**: [Dynamic](https://www.dynamic.xyz/) (Wallet Infrastructure)
- **Payments**: [Daimo Pay](https://pay.daimo.com/)
- **Real-time**: [Pusher](https://pusher.com/)

## Project Structure

```
├── example.env            # Environment template
├── supabase/
│   ├── functions/         # Edge Functions
│   │   ├── merchants/     # Merchant management
│   │   ├── orders/        # Order processing
│   │   └── payment-callback/  # Payment webhooks
│   ├── migrations/        # Database schema
│   └── seed.sql          # Sample data
```

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
   supabase start
   npx supabase functions serve --env-file .env.local
   ```

4. **Deploy**
   ```bash
   supabase functions deploy
   ```

## API Endpoints

| Function | Description |
|----------|-------------|
| `/merchants` | Merchant registration & management |
| `/orders` | Order creation & tracking |
| `/payment-callback` | Payment status webhooks |

## Development

```bash
# Local development
supabase start
npx supabase functions serve --env-file .env.local

# Database
supabase db reset        # Run migrations + seed
supabase migration new   # Create migration

# Deploy
supabase functions deploy
supabase db push
```

## Environment Variables

See `example.env` for required configuration including Supabase, Dynamic, Daimo, and Pusher credentials.