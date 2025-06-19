import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractBearerToken, verifyDynamicJWT } from "./utils.ts";

const DEFAULT_TOKEN_ID = "USDC_BASE";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface Merchant {
  dynamic_id?: string;
  email?: string;
  display_name?: string;
  description?: string;
  logo_url?: string;
  wallet_address?: string;
  default_currency?: string;
  default_token_id?: string;
  default_language?: string;
  updated_at?: string;
}

// Upsert merchant function
async function upsertMerchant(supabase: any, merchantData: Merchant) {
  try {
    const cleanData: Partial<Merchant> = {
      dynamic_id: merchantData.dynamic_id,
    };

    cleanData.email = merchantData.email;
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
    const { data, error } = await supabase
      .from("merchants")
      .upsert(cleanData, { onConflict: "dynamic_id", ignoreDuplicates: false })
      .select()
      .single();

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
async function handleGet(_request: Request, supabase: any, dynamicId: string) {
  try {
    const { data, error } = await supabase
      .from("merchants")
      .select("*")
      .eq("dynamic_id", dynamicId)
      .single();

    if (error) {
      return Response.json({ success: false, error: error.message }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    return Response.json({
      success: true,
      profile: data,
    }, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: `Server error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// POST handler with upsert
async function handlePost(request: Request, supabase: any, payload: any, wallet_address: string) {
  try {
    const requestData: Merchant = await request.json();
    requestData.wallet_address = wallet_address;
    requestData.dynamic_id = payload.sub;
    requestData.email = payload.email;
    requestData.default_token_id = DEFAULT_TOKEN_ID;

    // Upsert merchant
    const result = await upsertMerchant(supabase, requestData);

    if (!result.success) {
      return Response.json({ success: false, error: result.error }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    return Response.json({
      success: true,
      profile: result.data,
      message: "Merchant Created/Updated successfully",
    }, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: `Server error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    }, {
      status: 500,
      headers: corsHeaders,
    });
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

    // const tokenVerification = await verifyAuthToken(authHeader);
    const tokenVerification = await verifyDynamicJWT(
      token,
      DYNAMIC_ENV_ID,
    );
    if (!tokenVerification.success) {
      return Response.json({
        error: "Invalid or expired token",
        details: tokenVerification.error,
      }, {
        status: 401,
        headers: corsHeaders,
      });
    }
    const { sub: dynamicId } = tokenVerification.payload;
    const wallet_address= tokenVerification.embedded_wallet_address;
    if (!wallet_address) {
      return Response.json({
        error: "Missing embedded wallet address",
      }, {
        status: 422,
        headers: corsHeaders,
      });
    }
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    switch (req.method) {
      case "GET":
        return await handleGet(req, supabase, dynamicId);
      case "POST":
        return await handlePost(req, supabase, tokenVerification.payload, wallet_address);
      default:
        return Response.json({ error: `Method ${req.method} not allowed` }, {
          status: 405,
          headers: corsHeaders,
        });
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    return Response.json({ error: "Internal server error" }, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
