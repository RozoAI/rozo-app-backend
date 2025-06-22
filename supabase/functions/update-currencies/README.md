# Currency Update Function

This Supabase Edge Function automatically updates currency exchange rates in the database on a daily basis.

## Features

- Updates exchange rates for MYR, SGD, and IDR against USD
- Runs automatically at midnight UTC every day (configurable)
- Uses the free ExchangeRate API to fetch current rates
- Handles errors gracefully with detailed logging

## How It Works

1. The function fetches the latest exchange rates from ExchangeRate API
2. It calculates the USD price for each supported currency
3. It updates the `currencies` table in the database with the latest rates
4. It returns a detailed response with the update status

## Configuration

The function is configured to run as a scheduled job using the `cron.json` file:

```json
{
  "schedule": "0 0 * * *"
}
```

This schedule runs the function at midnight (00:00) UTC every day.

## Manual Execution

You can manually trigger the function using the Supabase CLI or with a curl command:

```bash
# Using Supabase CLI
supabase functions invoke update-currencies

# Using curl with authentication
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-currencies \
  -H "Authorization: Bearer YOUR_SUPABASE_SERVICE_KEY"
```

## Monitoring

You can monitor the function's execution in the Supabase Dashboard:

1. Go to your Supabase project
2. Navigate to Edge Functions
3. Select the `update-currencies` function
4. Check the logs for execution details

## Troubleshooting

If the function fails to update currency rates:

1. Check if the ExchangeRate API is accessible
2. Verify that your Supabase service role key has the necessary permissions
3. Check the function logs for detailed error messages
4. Ensure the `currencies` table exists with the expected schema

## Extending

To add support for more currencies:

1. Update the `CURRENCIES_TO_UPDATE` array in `index.ts`
2. Make sure the currencies exist in your `currencies` table
3. Redeploy the function

## Dependencies

- ExchangeRate API (free tier): https://www.exchangerate-api.com/
- Supabase JS Client
- Deno standard library
