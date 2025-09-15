# Expired Orders Cron Function

This function automatically processes expired orders by updating their status from `PENDING` to `FAILED` when they exceed their expiration time.

## Features

- **Automatic Processing**: Runs every 5 minutes via cron job
- **Performance Monitoring**: Tracks processing time and statistics
- **Merchant Notifications**: Logs expired orders for merchant awareness
- **Health Checks**: Provides health check endpoint
- **Manual Trigger**: Supports manual triggering for testing

## Endpoints

### POST `/` (Cron Job)
- **Purpose**: Main cron job endpoint
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Response**: Processing statistics

### GET `/health`
- **Purpose**: Health check endpoint
- **Response**: Service status and timestamp

### POST `/trigger`
- **Purpose**: Manual trigger for testing
- **Response**: Processing statistics

## Configuration

The cron job is configured in `cron.json`:
```json
{
  "cron": "*/5 * * * *",
  "description": "Process expired orders every 5 minutes"
}
```

## Database Changes

This function relies on the `expired_at` field added to the orders table:
- Orders with `status = 'PENDING'` and `expired_at < now()` are processed
- Updated orders get `status = 'FAILED'` and updated `callback_payload`

## Performance

- Processes orders in batches for efficiency
- Includes performance timing metrics
- Logs detailed statistics for monitoring

## Error Handling

- Graceful error handling with detailed logging
- Continues processing even if individual operations fail
- Returns comprehensive error information

## Monitoring

The function logs:
- Number of expired orders found
- Number of orders successfully updated
- Processing time in milliseconds
- Any errors encountered

## Deployment

Deploy the function with:
```bash
npx supabase functions deploy expired-orders
```

The cron job will be automatically scheduled by Supabase.
