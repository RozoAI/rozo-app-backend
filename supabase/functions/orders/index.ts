import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractBearerToken, verifyDynamicJWT } from "./utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface OrderData {
  merchant_id: string;
  payment_id: string;
  required_amount_usd: number;
  merchant_chain_id: string;
  merchant_address: string;
  display_currency: string;
  source_txn_hash: string;
  source_chain_name: string;
  source_token_address: string;
  source_token_amount: number;
}

interface Order extends OrderData {
  required_token?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

// Validate merchant and create order
async function createOrder(supabase: any, orderData: OrderData) {
  try {
    // First, verify if merchant exists and get token info
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select(`
        merchant_id,
        dynamic_id,
        wallet_address,
        tokens!inner(chain_id, token_address)
      `)
      .eq("merchant_id", orderData.merchant_id)
      .single();

    if (merchantError || !merchant) {
      return {
        success: false,
        error: "Merchant not found or has no default token configured",
      };
    }

    // Verify merchant wallet address matches
    if (merchant.wallet_address !== orderData.merchant_address) {
      return {
        success: false,
        error: "Merchant address does not match registered wallet address",
      };
    }

    // Verify chain_id matches merchant's default token chain_id
    if (merchant.tokens.chain_id !== orderData.merchant_chain_id) {
      return {
        success: false,
        error: "Chain ID does not match merchant's default token chain",
      };
    }

    // Create the order with required_token from merchant's default token
    const orderToInsert: Order = {
      ...orderData,
      required_token: merchant.tokens.token_address, // Set from merchant's default token
      status: "PENDING",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderToInsert)
      .select()
      .single();

    if (orderError) {
      return {
        success: false,
        error: orderError.message,
      };
    }

    return {
      success: true,
      order: order,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET single order by ID with JWT verification
async function handleGetSingleOrder(
  _request: Request,
  supabase: any,
  orderId: string,
  dynamicId: string,
) {
  try {
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select(`merchant_id`)
      .eq("dynamic_id", dynamicId)
      .single();

    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: merchantError.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", orderId)
      .eq("merchant_id", merchant.merchant_id)
      .single();

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        order: order,
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

// GET all orders for merchant with JWT verification
async function handleGetAllOrders(
  _request: Request,
  supabase: any,
  dynamicId: string,
) {
  try {
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select(`merchant_id`)
      .eq("dynamic_id", dynamicId)
      .single();

    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: merchantError.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("merchant_id", merchant.merchant_id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: true,
        orders: orders || [],
        count: orders?.length || 0,
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

// POST create order (no JWT required)
async function handleCreateOrder(request: Request, supabase: any) {
  try {
    const orderData: OrderData = await request.json();

    // Validate required fields
    const requiredFields = [
      "merchant_id",
      "payment_id",
      "required_amount_usd",
      "merchant_chain_id",
      "merchant_address",
      "display_currency",
      "source_txn_hash",
      "source_chain_name",
      "source_token_address",
      "source_token_amount",
    ];

    for (const field of requiredFields) {
      if (!orderData[field as keyof OrderData]) {
        return Response.json(
          { success: false, error: `Missing required field: ${field}` },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
    }

    // Validate numeric fields
    if (
      typeof orderData.required_amount_usd !== "number" ||
      orderData.required_amount_usd <= 0
    ) {
      return Response.json(
        {
          success: false,
          error: "required_amount_usd must be a positive number",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    if (
      typeof orderData.source_token_amount !== "number" ||
      orderData.source_token_amount <= 0
    ) {
      return Response.json(
        {
          success: false,
          error: "source_token_amount must be a positive number",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Create order with validation
    const result = await createOrder(supabase, orderData);

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
        order: result.order,
        message: "Order created successfully",
      },
      {
        status: 201,
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

// Helper function to extract merchant_id from JWT
async function getDynamicIdFromJWT(token: string, dynamicEnvId: string) {
  const tokenVerification = await verifyDynamicJWT(token, dynamicEnvId);

  if (!tokenVerification.success) {
    return {
      success: false,
      error: tokenVerification.error,
    };
  }

  // Extract merchant_id from JWT payload (assuming it's stored in 'sub' or custom claim)
  const dynamicId = tokenVerification.payload.sub;
  if (!dynamicId) {
    return {
      success: false,
      error: "Merchant ID not found in token",
    };
  }

  return {
    success: true,
    dynamicId: dynamicId,
  };
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Route: v1/orders (POST) - Create order (no JWT required)
    if (req.method === "POST" && pathSegments[0] === "orders") {
      return await handleCreateOrder(req, supabase);
    }

    // For GET requests, JWT is required
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

    const dynamicIdRes = await getDynamicIdFromJWT(token, DYNAMIC_ENV_ID);
    if (!dynamicIdRes.success) {
      return Response.json(
        {
          error: "Invalid or expired token",
          details: dynamicIdRes.error,
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    const dynamicId = dynamicIdRes.dynamicId;

    // Route: v1/orders/{order_id} (GET) - Get single order
    if (
      req.method === "GET" && pathSegments.length === 2 &&
      pathSegments[0] === "orders"
    ) {
      const orderId = pathSegments[1];
      return await handleGetSingleOrder(req, supabase, orderId, dynamicId);
    }

    // Route: v1/orders (GET) - Get all orders for merchant
    if (req.method === "GET" && pathSegments[0] === "orders") {
      return await handleGetAllOrders(req, supabase, dynamicId);
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
