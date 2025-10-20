
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractBearerToken,
  verifyDynamicJWT,
  verifyPrivyJWT,
} from "./utils.ts";
import { 
  setMerchantPin, 
  updateMerchantPin, 
  revokeMerchantPin, 
  validatePinCode,
  requirePinValidation,
  extractPinFromHeaders,
  extractClientInfo,
  type PinValidationResult,
  type PinManagementResult,
  type MerchantStatus
} from '../../_shared/pin-validation.ts';

const DEFAULT_TOKEN_ID = "USDC_BASE";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-pin-code',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
};

interface Merchant {
  dynamic_id?: string;
  privy_id?: string;
  email?: string;
  display_name?: string;
  description?: string;
  logo_url?: string;
  wallet_address?: string;
  default_currency?: string;
  default_token_id?: string;
  default_language?: string;
  updated_at?: string;
  status?: string;
  pin_code_hash?: string;
  pin_code_attempts?: number;
  pin_code_blocked_at?: string;
  pin_code_last_attempt_at?: string;
}

interface SetPinRequest {
  pin_code: string;
}

interface UpdatePinRequest {
  current_pin: string;
  new_pin: string;
}

interface RevokePinRequest {
  pin_code: string;
}

interface ValidatePinRequest {
  pin_code: string;
}

interface PostPayload {
  dynamicId?: string | null;
  privyId?: string | null;
  email: string;
  wallet_address: string;
}

// Upsert merchant function
async function upsertMerchant(
  supabase: any,
  merchantData: Merchant,
  isPrivyAuth: boolean,
) {
  try {
    const cleanData: Partial<Merchant> = {
      dynamic_id: merchantData.dynamic_id,
      privy_id: merchantData.privy_id,
    };

    cleanData.email = merchantData.email;
    cleanData.display_name = merchantData.email;
    cleanData.default_token_id = merchantData.default_token_id;
    if (merchantData.display_name) {
      cleanData.display_name = merchantData.display_name;
    }
    if (merchantData.description) {
      cleanData.description = merchantData.description;
    }
    if (merchantData.logo_url) cleanData.logo_url = merchantData.logo_url;
    if (merchantData.wallet_address) {
      cleanData.wallet_address = merchantData.wallet_address;
    }
    if (merchantData.default_currency) {
      cleanData.default_currency = merchantData.default_currency;
    }

    if (merchantData.default_language) {
      cleanData.default_language = merchantData.default_language;
    }

    cleanData.updated_at = new Date().toISOString();

    // First check if merchant exists by email (to handle cross-provider scenarios)
    const { data: existingByEmail } = await supabase
      .from("merchants")
      .select("merchant_id, privy_id, dynamic_id")
      .eq("email", merchantData.email)
      .single();

    // Then check if merchant exists based on appropriate auth provider
    const userProviderId = merchantData.dynamic_id || merchantData.privy_id;
    const { data: existingByProvider } = isPrivyAuth
      ? await supabase
        .from("merchants")
        .select("merchant_id, privy_id, dynamic_id")
        .eq("privy_id", userProviderId)
        .single()
      : await supabase
        .from("merchants")
        .select("merchant_id, dynamic_id, privy_id")
        .eq("dynamic_id", userProviderId)
        .single();

    let data, error;

    // If merchant exists by email but not by provider, update the existing record
    if (existingByEmail && !existingByProvider) {
      // Update existing merchant with new provider info
      const updateQuery = supabase
        .from("merchants")
        .update(cleanData)
        .select()
        .single();

      ({ data, error } = await updateQuery.eq("email", merchantData.email));
    } else if (existingByProvider) {
      // Update existing merchant by provider
      const updateQuery = supabase
        .from("merchants")
        .update(cleanData)
        .select()
        .single();

      ({ data, error } = isPrivyAuth
        ? await updateQuery.eq("privy_id", userProviderId)
        : await updateQuery.eq("dynamic_id", userProviderId));
    } else {
      // Insert new merchant
      ({ data, error } = await supabase
        .from("merchants")
        .insert(cleanData)
        .select()
        .single());
    }

    if (error) throw new Error(error.message);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET handler
async function handleGet(
  _request: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    const merchantQuery = supabase
      .from("merchants")
      .select(`
        merchant_id,
        dynamic_id,
        privy_id,
        email,
        display_name,
        wallet_address,
        logo_url,
        default_token_id,
        status,
        pin_code_hash,
        created_at,
        updated_at
      `);

    // Use appropriate column based on auth provider
    const { data, error } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (!data) {
      return Response.json(
        { success: false, error: "Data not found" },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Create safe profile object without sensitive PIN fields
    const safeProfile = {
      merchant_id: data.merchant_id,
      dynamic_id: data.dynamic_id,
      privy_id: data.privy_id,
      email: data.email,
      display_name: data.display_name,
      wallet_address: data.wallet_address,
      logo_url: data.logo_url,
      default_token_id: data.default_token_id,
      status: data.status,
      has_pin: !!data.pin_code_hash, // Only expose boolean, not the actual hash
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return Response.json(
      {
        success: true,
        profile: safeProfile,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// POST handler with upsert
async function handlePost(
  body: any,
  supabase: any,
  payload: PostPayload,
  isPrivyAuth: boolean,
) {
  try {
    const requestData: Merchant = body;
    requestData.wallet_address = payload.wallet_address;
    requestData.email = payload.email;
    requestData.default_token_id = DEFAULT_TOKEN_ID;

    if (payload.dynamicId) {
      requestData.dynamic_id = payload.dynamicId;
    }
    if (payload.privyId) {
      requestData.privy_id = payload.privyId;
    }

    // Upsert merchant
    const result = await upsertMerchant(supabase, requestData, isPrivyAuth);

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        profile: result.data,
        message: "Merchant Created/Updated successfully",
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// PUT handler for updating merchant display_name and logo
async function handlePut(
  request: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    // Get the current merchant data first
    const merchantQuery = supabase
      .from("merchants")
      .select("*");

    // Use appropriate column based on auth provider
    const { data: existingMerchant, error: fetchError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (fetchError) {
      return Response.json(
        { success: false, error: fetchError.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Parse the request body
    const requestData = await request.json();
    const { display_name, logo, email } = requestData;

    // Prepare update data
    const updateData: Partial<Merchant> = {
      updated_at: new Date().toISOString(),
    };

    if (email) {
      updateData.email = email;
    }

    // Update display_name if provided
    if (display_name) {
      updateData.display_name = display_name;
    }

    // Handle logo upload if provided
    if (logo) {
      try {
        // Extract file data from base64
        const base64Data = logo.split(",")[1];

        // Convert base64 to Uint8Array for upload
        const binaryData = Uint8Array.from(
          atob(base64Data),
          (c) => c.charCodeAt(0),
        );

        // Generate a unique filename with png extension
        const bucketName = Deno.env.get("STORAGE_BUCKET_NAME")!;
        const fileName = `${existingMerchant.merchant_id}_${Date.now()}.png`;
        const filePath = `merchants/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, binaryData, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        // Get public URL for the uploaded file
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);

        // Add logo URL to update data
        updateData.logo_url = publicUrlData.publicUrl;
      } catch (uploadError) {
        return Response.json(
          {
            success: false,
            error: `${
              uploadError instanceof Error
                ? uploadError.message
                : "Unknown error"
            }`,
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
    }

    // Update merchant record
    const updateQuery = supabase
      .from("merchants")
      .update(updateData)
      .select()
      .single();

    const { data: updatedMerchant, error: updateError } = isPrivyAuth
      ? await updateQuery.eq("privy_id", userProviderId)
      : await updateQuery.eq("dynamic_id", userProviderId);

    if (updateError) {
      return Response.json(
        { success: false, error: updateError.message },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        profile: updatedMerchant,
        message: "Merchant updated successfully",
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
}

// PIN Code Management Handlers

// Set PIN Code handler
async function handleSetPin(request: Request, supabase: any, dynamicId: string) {
  try {
    const requestData: SetPinRequest = await request.json();
    const { pin_code } = requestData;
    
    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('merchant_id')
      .eq('dynamic_id', dynamicId)
      .single();
      
    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // Extract client info
    const { ipAddress, userAgent } = extractClientInfo(request);
    
    // Set PIN using shared utility
    const result = await setMerchantPin(supabase, merchant.merchant_id, pin_code, ipAddress, userAgent);
    
    return Response.json(
      { success: result.success, message: result.message, error: result.error },
      { status: result.success ? 200 : 400, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Update PIN Code handler
async function handleUpdatePin(request: Request, supabase: any, dynamicId: string) {
  try {
    const requestData: UpdatePinRequest = await request.json();
    const { current_pin, new_pin } = requestData;
    
    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('merchant_id')
      .eq('dynamic_id', dynamicId)
      .single();
      
    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // PIN validation middleware for PIN update operations (required)
    const pinCodeFromHeader = extractPinFromHeaders(request);
    if (!pinCodeFromHeader) {
      return Response.json(
        { 
          success: false,
          error: 'PIN code is required for PIN update operations',
          code: 'PIN_REQUIRED'
        },
        { status: 400, headers: corsHeaders }
      );
    }
    
    const { ipAddress, userAgent } = extractClientInfo(request);
    
    const pinValidation = await requirePinValidation({
      supabase,
      merchantId: merchant.merchant_id,
      pinCode: pinCodeFromHeader,
      ipAddress,
      userAgent
    });
    
    if (!pinValidation.success) {
      return Response.json(
        { 
          success: false,
          error: pinValidation.error,
          attempts_remaining: pinValidation.result?.attempts_remaining,
          is_blocked: pinValidation.result?.is_blocked
        },
        { status: 401, headers: corsHeaders }
      );
    }
    
    // Update PIN using shared utility
    const result = await updateMerchantPin(supabase, merchant.merchant_id, current_pin, new_pin, ipAddress, userAgent);
    
    return Response.json(
      { success: result.success, message: result.message, error: result.error },
      { status: result.success ? 200 : 400, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Revoke PIN Code handler
async function handleRevokePin(request: Request, supabase: any, dynamicId: string) {
  try {
    const requestData: RevokePinRequest = await request.json();
    const { pin_code } = requestData;
    
    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('merchant_id')
      .eq('dynamic_id', dynamicId)
      .single();
      
    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // PIN validation middleware for PIN revoke operations (required)
    const pinCodeFromHeader = extractPinFromHeaders(request);
    if (!pinCodeFromHeader) {
      return Response.json(
        { 
          success: false,
          error: 'PIN code is required for PIN revoke operations',
          code: 'PIN_REQUIRED'
        },
        { status: 400, headers: corsHeaders }
      );
    }
    
    const { ipAddress, userAgent } = extractClientInfo(request);
    
    const pinValidation = await requirePinValidation({
      supabase,
      merchantId: merchant.merchant_id,
      pinCode: pinCodeFromHeader,
      ipAddress,
      userAgent
    });
    
    if (!pinValidation.success) {
      return Response.json(
        { 
          success: false,
          error: pinValidation.error,
          attempts_remaining: pinValidation.result?.attempts_remaining,
          is_blocked: pinValidation.result?.is_blocked
        },
        { status: 401, headers: corsHeaders }
      );
    }
    
    // Revoke PIN using shared utility
    const result = await revokeMerchantPin(supabase, merchant.merchant_id, pin_code, ipAddress, userAgent);
    
    return Response.json(
      { success: result.success, message: result.message, error: result.error },
      { status: result.success ? 200 : 400, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Validate PIN Code handler
async function handleValidatePin(request: Request, supabase: any, dynamicId: string) {
  try {
    const requestData: ValidatePinRequest = await request.json();
    const { pin_code } = requestData;
    
    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('merchant_id')
      .eq('dynamic_id', dynamicId)
      .single();
      
    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // Extract client info
    const { ipAddress, userAgent } = extractClientInfo(request);
    
    // Validate PIN using shared utility
    const result = await validatePinCode(supabase, merchant.merchant_id, pin_code, ipAddress, userAgent);
    
    return Response.json(
      {
        success: result.success,
        attempts_remaining: result.attempts_remaining,
        is_blocked: result.is_blocked,
        message: result.message
      },
      { status: result.success ? 200 : 401, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Check merchant status handler
async function handleCheckStatus(_request: Request, supabase: any, dynamicId: string) {
  try {
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('merchant_id')
      .eq('dynamic_id', dynamicId)
      .single();
      
    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // Get merchant status data directly
    const { data: merchantStatus, error: statusError } = await supabase
      .from('merchants')
      .select('status, pin_code_hash, pin_code_attempts, pin_code_blocked_at')
      .eq('merchant_id', merchant.merchant_id)
      .single();
    
    if (statusError) {
      return Response.json(
        { success: false, error: 'Failed to get merchant status' },
        { status: 500, headers: corsHeaders }
      );
    }
    
    return Response.json(
      {
        success: true,
        status: merchantStatus.status || 'ACTIVE',
        has_pin: !!merchantStatus.pin_code_hash,
        pin_attempts: merchantStatus.pin_code_attempts || 0,
        pin_blocked_at: merchantStatus.pin_code_blocked_at
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Main serve function
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DYNAMIC_ENV_ID = Deno.env.get("DYNAMIC_ENV_ID")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const STORAGE_BUCKET_NAME = Deno.env.get("STORAGE_BUCKET_NAME")!;

    // Privy Environment
    const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
    const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;

    if (
      !DYNAMIC_ENV_ID ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !STORAGE_BUCKET_NAME
    ) {
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

    // Check merchant status before allowing access (except for PIN validation)
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const isPinValidation = pathSegments.includes('pin') && pathSegments.includes('validate');
    
    if (!isPinValidation) {
      // Get merchant ID and status for checking
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('merchant_id, status')
        .eq('dynamic_id', dynamicId)
        .single();
        
      if (!merchantError && merchant) {
        // Check merchant status (PIN_BLOCKED or INACTIVE)
        if (merchant.status === 'PIN_BLOCKED') {
          return Response.json(
            { 
              error: 'Account blocked due to PIN security violations',
              code: 'PIN_BLOCKED'
            },
            { status: 403, headers: corsHeaders }
          );
        }

        if (merchant.status === 'INACTIVE') {
          return Response.json(
            { 
              error: 'Account is inactive',
              code: 'INACTIVE'
            },
            { status: 403, headers: corsHeaders }
          );
        }
      }
    }

    // Route handling based on URL path
    const path = url.pathname;
    
    // PIN Code Management Routes
    if (path.includes('/pin')) {
      switch (req.method) {
        case 'POST':
          if (path.includes('/pin/validate')) {
            return await handleValidatePin(req, supabase, dynamicId);
          } else if (path.includes('/pin')) {
            return await handleSetPin(req, supabase, dynamicId);
          }
          break;
        case 'PUT':
          if (path.includes('/pin')) {
            return await handleUpdatePin(req, supabase, dynamicId);
          }
          break;
        case 'DELETE':
          if (path.includes('/pin')) {
            return await handleRevokePin(req, supabase, dynamicId);
          }
          break;
      }
    }
    
    // Status check route
    if (path.includes('/status')) {
      if (req.method === 'GET') {
        return await handleCheckStatus(req, supabase, dynamicId);
      }
    }

    // Original merchant management routes
    switch (req.method) {
      case "GET":
        return await handleGet(req, supabase, userProviderId, isPrivyAuth);
      case "POST": {
        let requestBody;
        if (req.headers.get("content-type")?.includes("application/json")) {
          requestBody = await req.json();
        } else if (req.headers.get("content-type")?.includes("text/plain")) {
          requestBody = await req.text();
        } else {
          // Handle other content types or assume no body
          requestBody = {};
        }

        const email = requestBody.email ?? tokenVerification.payload.email ??
          privy.payload?.email?.address;
        return await handlePost(
          requestBody,
          supabase,
          {
            email: email,
            wallet_address: userProviderWalletAddress,
            dynamicId: tokenVerification.payload?.sub || null,
            privyId: privy.payload?.id || null,
          },
          isPrivyAuth,
        );
      }
      case "PUT":
        return await handlePut(req, supabase, userProviderId, isPrivyAuth);
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
