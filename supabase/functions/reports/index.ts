import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractBearerToken,
  verifyDynamicJWT,
  verifyPrivyJWT,
} from "../../_shared/utils.ts";
import { generateDashboardReport, ReportRequest } from "./utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Validate merchant exists and get merchant data
 */
async function validateMerchant(
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
): Promise<
  { success: boolean; merchant?: any; error?: string; code?: string }
> {
  try {
    const merchantQuery = supabase
      .from("merchants")
      .select(`
        merchant_id,
        dynamic_id,
        privy_id,
        status
      `);

    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (merchantError || !merchant) {
      return {
        success: false,
        error: "Merchant not found",
      };
    }

    // Check merchant status
    if (merchant.status === "PIN_BLOCKED") {
      return {
        success: false,
        error: "Account blocked due to PIN security violations",
        code: "PIN_BLOCKED",
      };
    }

    if (merchant.status === "INACTIVE") {
      return {
        success: false,
        error: "Account is inactive",
        code: "INACTIVE",
      };
    }

    return { success: true, merchant };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle dashboard report generation
 */
async function handleDashboardReport(
  request: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    // Validate merchant
    const merchantResult = await validateMerchant(
      supabase,
      userProviderId,
      isPrivyAuth,
    );
    if (!merchantResult.success) {
      return Response.json(
        {
          success: false,
          error: merchantResult.error,
          code: merchantResult.code,
        },
        {
          status:
            merchantResult.code === "PIN_BLOCKED" ||
              merchantResult.code === "INACTIVE"
              ? 403
              : 404,
          headers: corsHeaders,
        },
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const groupBy = url.searchParams.get("group_by") as
      | "day"
      | "week"
      | "month"
      | null;

    // Validate required parameters
    if (!from || !to) {
      return Response.json(
        {
          success: false,
          error:
            "Missing required parameters: 'from' and 'to' dates (YYYY-MM-DD format)",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return Response.json(
        {
          success: false,
          error: "Invalid date format. Use YYYY-MM-DD format",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Validate group_by parameter
    if (groupBy && !["day", "week", "month"].includes(groupBy)) {
      return Response.json(
        {
          success: false,
          error:
            "Invalid group_by parameter. Must be 'day', 'week', or 'month'",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const reportRequest: ReportRequest = {
      from,
      to,
      group_by: groupBy || "day",
    };

    // Generate report
    const result = await generateDashboardReport(
      supabase,
      merchantResult.merchant!.merchant_id,
      reportRequest,
    );

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
        data: result.data,
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

    // Privy Environment
    const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
    const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;

    console.log("Reports - Environment variables check:", {
      DYNAMIC_ENV_ID: DYNAMIC_ENV_ID ? "Present" : "Missing",
      SUPABASE_URL: SUPABASE_URL ? "Present" : "Missing",
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY
        ? "Present"
        : "Missing",
      PRIVY_APP_ID: PRIVY_APP_ID ? "Present" : "Missing",
      PRIVY_APP_SECRET: PRIVY_APP_SECRET ? "Present" : "Missing",
    });

    if (!DYNAMIC_ENV_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Missing environment variables" },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    // JWT is required for all requests
    const authHeader = req.headers.get("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      return Response.json(
        { error: "Missing or invalid authorization header" },
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify with Privy
    console.log("Reports - Attempting Privy JWT verification");
    const privy = await verifyPrivyJWT(token, PRIVY_APP_ID, PRIVY_APP_SECRET);
    console.log("Reports - Privy verification result:", {
      success: privy.success,
      error: privy.error,
    });

    // Verify with Dynamic
    console.log("Reports - Attempting Dynamic JWT verification");
    const tokenVerification = await verifyDynamicJWT(token, DYNAMIC_ENV_ID);
    console.log("Reports - Dynamic verification result:", {
      success: tokenVerification.success,
      error: tokenVerification.error,
    });

    if (!tokenVerification.success) {
      if (!privy.success) {
        console.error("Reports - Both auth methods failed", {
          privyError: privy.error,
          dynamicError: tokenVerification.error,
        });
        return Response.json(
          {
            error: "Invalid or expired token",
            details: tokenVerification.error,
            privy_error: privy.error,
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
    let isDynamicAuth = false;

    if (tokenVerification.success) {
      userProviderId = tokenVerification.payload.sub;
      userProviderWalletAddress = tokenVerification.embedded_wallet_address;
      isDynamicAuth = true;
    }

    if (privy.success) {
      userProviderId = privy.payload?.id;
      userProviderWalletAddress = privy.embedded_wallet_address;
      isPrivyAuth = true;
      isDynamicAuth = false; // Privy takes precedence
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Route: GET /reports - Get dashboard report
    if (req.method === "GET" && pathSegments[0] === "reports") {
      return await handleDashboardReport(
        req,
        supabase,
        userProviderId,
        isPrivyAuth,
      );
    }

    // Route not found
    return Response.json(
      { error: "Route not found" },
      {
        status: 404,
        headers: corsHeaders,
      },
    );
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
