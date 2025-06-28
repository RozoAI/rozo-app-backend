import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Define the currencies we want to update
const CURRENCIES_TO_UPDATE = ['MYR', 'SGD', 'IDR'];
const BASE_CURRENCY = 'USD';

// Define the API URL for ExchangeRate-API
const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

// Define the Supabase client
const supabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
  const supabaseServiceKey = Deno.env.get(
    'SUPABASE_SERVICE_ROLE_KEY',
  ) as string;

  return createClient(supabaseUrl, supabaseServiceKey);
};

// Define the CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/**
 * Fetches the latest currency exchange rates from ExchangeRate-API
 * @returns Object containing exchange rates with USD as base
 */
async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch exchange rates: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    throw error;
  }
}

/**
 * Updates currency rates in the database
 * @param supabase Supabase client
 * @param rates Exchange rates data
 */
async function updateCurrencyRates(
  supabase: any,
  rates: Record<string, number>,
): Promise<{ success: boolean; updated: string[]; errors: string[] }> {
  const updated: string[] = [];
  const errors: string[] = [];

  // For each currency in our list
  for (const currencyId of CURRENCIES_TO_UPDATE) {
    try {
      // USD is always 1
      const usdPrice = currencyId === BASE_CURRENCY ? 1 : 1 / rates[currencyId]; // Convert to USD value (e.g., 1 USD = X Currency)

      // Update the currency in the database
      const { error } = await supabase
        .from('currencies')
        .update({
          usd_price: usdPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('currency_id', currencyId);

      if (error) {
        throw error;
      }

      updated.push(currencyId);
    } catch (error) {
      console.error(`Error updating ${currencyId}:`, error);
      errors.push(`${currencyId}: ${error.message || 'Unknown error'}`);
    }
  }

  return {
    success: errors.length === 0,
    updated,
    errors,
  };
}

// Handle the request
serve(async (req) => {
  // This enables the function to be invoked as a Cron job
  if (req.method === 'POST') {
    try {
      const supabase = supabaseClient(req);

      // Fetch the latest exchange rates
      const rates = await fetchExchangeRates();

      // Update the currency rates in the database
      const result = await updateCurrencyRates(supabase, rates);

      // Return the result
      return new Response(
        JSON.stringify({
          success: result.success,
          message: 'Currency rates updated successfully',
          updated: result.updated,
          errors: result.errors,
          timestamp: new Date().toISOString(),
        }),
        {
          status: result.success ? 200 : 207, // 207 Multi-Status if some updates failed
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        },
      );
    } catch (error) {
      // Handle any errors
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to update currency rates',
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        },
      );
    }
  }

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Return 405 for other methods
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
});
