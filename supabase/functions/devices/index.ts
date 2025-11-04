import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractBearerToken,
  verifyDynamicJWT,
  verifyPrivyJWT,
} from "../../_shared/utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

interface RegisterDeviceRequest {
  device_id: string;
  fcm_token: string;
  platform: 'ios' | 'android';
}

interface UnregisterDeviceRequest {
  device_id: string;
}

// Register device handler
async function handleRegister(
  request: Request,
  supabase: any,
  merchantId: string
) {
  try {
    const requestData: RegisterDeviceRequest = await request.json();
    const { device_id, fcm_token, platform } = requestData;

    // Validation
    if (!device_id || !fcm_token || !platform) {
      return Response.json(
        { success: false, error: 'Missing required fields: device_id, fcm_token, platform' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['ios', 'android'].includes(platform)) {
      return Response.json(
        { success: false, error: 'Invalid platform. Must be ios or android' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Upsert device (update if exists, insert if new)
    const { data, error } = await supabase
      .from('merchant_devices')
      .upsert({
        merchant_id: merchantId,
        device_id,
        fcm_token,
        platform,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'device_id,merchant_id'
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json(
      { success: true, data, message: 'Device registered successfully' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error registering device:', error);
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Unregister device handler
async function handleUnregister(
  request: Request,
  supabase: any,
  merchantId: string
) {
  try {
    const requestData: UnregisterDeviceRequest = await request.json();
    const { device_id } = requestData;

    if (!device_id) {
      return Response.json(
        { success: false, error: 'Missing required field: device_id' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Hard delete device
    const { error } = await supabase
      .from('merchant_devices')
      .delete()
      .match({ merchant_id: merchantId, device_id });

    if (error) throw error;

    return Response.json(
      { success: true, message: 'Device unregistered successfully' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error unregistering device:', error);
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Main serve function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const DYNAMIC_ENV_ID = Deno.env.get('DYNAMIC_ENV_ID')!;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const PRIVY_APP_ID = Deno.env.get('PRIVY_APP_ID')!;
    const PRIVY_APP_SECRET = Deno.env.get('PRIVY_APP_SECRET')!;

    if (!DYNAMIC_ENV_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: 'Missing environment variables' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Verify JWT token (Dynamic or Privy)
    const authHeader = req.headers.get('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return Response.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify with both providers
    const privy = await verifyPrivyJWT(token, PRIVY_APP_ID, PRIVY_APP_SECRET);
    const tokenVerification = await verifyDynamicJWT(token, DYNAMIC_ENV_ID);

    if (!tokenVerification.success && !privy.success) {
      return Response.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Get user provider ID
    let userProviderId = null;
    let isPrivyAuth = false;

    if (tokenVerification.success) {
      userProviderId = tokenVerification.payload.sub;
    }

    if (privy.success) {
      userProviderId = privy.payload?.id;
      isPrivyAuth = true;
    }

    if (!userProviderId) {
      return Response.json(
        { error: 'Missing user provider id' },
        { status: 422, headers: corsHeaders }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get merchant_id from user provider ID
    const merchantQuery = supabase
      .from('merchants')
      .select('merchant_id, status');

    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq('privy_id', userProviderId).single()
      : await merchantQuery.eq('dynamic_id', userProviderId).single();

    if (merchantError || !merchant) {
      return Response.json(
        { error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check merchant status
    if (merchant.status === 'PIN_BLOCKED' || merchant.status === 'INACTIVE') {
      return Response.json(
        { error: `Account is ${merchant.status.toLowerCase()}` },
        { status: 403, headers: corsHeaders }
      );
    }

    // Route handling based on URL path
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'POST' && path.includes('/register')) {
      return await handleRegister(req, supabase, merchant.merchant_id);
    }

    if (req.method === 'DELETE' && path.includes('/unregister')) {
      return await handleUnregister(req, supabase, merchant.merchant_id);
    }

    return Response.json(
      { error: 'Route not found' },
      { status: 404, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Unhandled error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
});
