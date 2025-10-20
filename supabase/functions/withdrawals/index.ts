// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getDynamicIdFromJWT } from '../../_shared/utils.ts';
import {
  extractBearerToken,
  verifyDynamicJWT,
  verifyPrivyJWT,
} from "./utils.ts";
import { 
  requirePinValidation, 
  extractPinFromHeaders,
  extractClientInfo,
  createBlockedResponse
} from '../../_shared/pin-validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-pin-code',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

async function handleGetRequest(
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    // Get merchant_id from the user's metadata or profile
    const merchantQuery = supabase
      .from("merchants")
      .select("merchant_id, status");

    // Use appropriate column based on auth provider
    const { data: merchantData, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();


    if (merchantError || !merchantData) {
      return Response.json(
        { error: "Merchant not found" },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchantData.status === 'PIN_BLOCKED') {
      return Response.json(
        { 
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    if (merchantData.status === 'INACTIVE') {
      return Response.json(
        { 
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Retrieve withdrawal histories for the merchant
    const { data: withdrawals, error: withdrawalError } = await supabase
      .from("withdrawals")
      .select(
        `
        withdrawal_id,
        recipient,
        amount,
        currency,
        tx_hash,
        created_at,
        updated_at
      `,
      )
      .eq("merchant_id", merchantData.merchant_id)
      .order("created_at", { ascending: false });

    if (withdrawalError) {
      return Response.json(
        { error: "Failed to retrieve withdrawal histories" },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        data: withdrawals || [],
        count: withdrawals?.length || 0,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Error in handleGetRequest:", error);
    return Response.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

async function handlePostRequest(
  req: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    // Get merchant_id from the user's metadata or profile
    const merchantQuery = supabase
      .from("merchants")
      .select("merchant_id, status");

    // Use appropriate column based on auth provider
    const { data: merchantData, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();


    if (merchantError || !merchantData) {
      return Response.json(
        { error: "Merchant not found" },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchantData.status === 'PIN_BLOCKED') {
      return Response.json(
        { 
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    if (merchantData.status === 'INACTIVE') {
      return Response.json(
        { 
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Parse request body
    const body = await req.json();
    const { recipient, amount, currency } = body;

    // Validate required fields
    if (!recipient || !amount || !currency) {
      return Response.json(
        { error: "Missing required fields: recipient, amount, currency" },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Validate amount is positive
    if (typeof amount !== "number" || amount <= 0) {
      return Response.json(
        { error: "Amount must be a positive number" },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // PIN validation for withdrawal (mandatory if PIN is set)
    const pinCode = extractPinFromHeaders(req);
    const { ipAddress, userAgent } = extractClientInfo(req);
    
    // Check if merchant has PIN set by querying merchant data
    const { data: merchantWithPin, error: pinError } = await supabase
      .from('merchants')
      .select('pin_code_hash')
      .eq('merchant_id', merchantData.merchant_id)
      .single();
    
    if (!pinError && merchantWithPin && merchantWithPin.pin_code_hash) {
      // PIN is required for withdrawals
      if (!pinCode) {
        return Response.json(
          { 
            error: 'PIN code is required for withdrawal operations',
            code: 'PIN_REQUIRED'
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      
      // Validate PIN code
      const pinValidation = await requirePinValidation({
        supabase,
        merchantId: merchantData.merchant_id,
        pinCode,
        ipAddress,
        userAgent
      });
      
      if (!pinValidation.success) {
        return Response.json(
          { 
            error: pinValidation.error,
            attempts_remaining: pinValidation.result?.attempts_remaining,
            is_blocked: pinValidation.result?.is_blocked
          },
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }
    }

    // Insert withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert({
        merchant_id: merchantData.merchant_id,
        recipient: recipient,
        amount: amount,
        currency: currency,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (withdrawalError) {
      return Response.json(
        { error: "Failed to create withdrawal request" },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        data: withdrawal,
      },
      {
        status: 201,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Error in handlePostRequest:", error);
    return Response.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DYNAMIC_ENV_ID = Deno.env.get("DYNAMIC_ENV_ID")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Privy Environment
    const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
    const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;

    if (!DYNAMIC_ENV_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Missing environment variables" },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify with Privy
    const privy = await verifyPrivyJWT(token, PRIVY_APP_ID, PRIVY_APP_SECRET);

    // const tokenVerification = await verifyAuthToken(authHeader);
    const tokenVerification = await verifyDynamicJWT(token, DYNAMIC_ENV_ID);
    if (!tokenVerification.success) {
      if (!privy.success) {
        return Response.json(
          {
            error: "Invalid or expired token",
            details: tokenVerification.error,
          },
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }
    }

    let userProviderId = null;
    let userProviderWalletAddress = null;
    let isPrivyAuth = false;

    if (tokenVerification.success) {
      userProviderId = tokenVerification.payload.sub;
      userProviderWalletAddress = tokenVerification.embedded_wallet_address;
    }

    if (privy.success) {
      userProviderId = privy.payload?.id;
      userProviderWalletAddress = privy.embedded_wallet_address;
      isPrivyAuth = true;
    }

    if (!userProviderWalletAddress || !userProviderId) {
      return Response.json(
        {
          error: "Missing embedded wallet address or user provider id",
        },
        {
          status: 422,
          headers: corsHeaders,
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (req.method) {
      case "GET":
        return await handleGetRequest(supabase, userProviderId, isPrivyAuth);
      case "POST":
        return await handlePostRequest(
          req,
          supabase,
          userProviderId,
          isPrivyAuth,
        );
      default:
        return Response.json(
          { error: `Method ${req.method} not allowed` },
          {
            status: 405,
            headers: corsHeaders,
          },
        );
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    return Response.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
