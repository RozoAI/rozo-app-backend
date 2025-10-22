import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDaimoPaymentLink } from "../../_shared/daimo-pay.ts";
import { currencyCache } from "../../_shared/currency-cache.ts";
import { 
  generateOrderNumber,
  extractBearerToken,
  verifyDynamicJWT,
  verifyPrivyJWT,
} from "../../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const INTENT_TITLE = "Rozo";

interface OrderData {
  number: string;
  merchant_id: string;
  payment_id: string;
  required_amount_usd: number;
  merchant_chain_id: string;
  merchant_address: string;
  display_currency: string;
  display_amount: number;
}

interface Order extends OrderData {
  required_token?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  expired_at?: string;
  payment_data?: unknown;
}

interface CreateOrderRequest {
  display_currency: string;
  display_amount: number;
  description?: string;
  redirect_uri?: string;
}

interface MerchantData {
  merchant_id: string;
  wallet_address: string;
  status: string;
  tokens: {
    chain_id: string;
    token_address: string;
  };
}

interface ValidationResult {
  success: boolean;
  error?: string;
  code?: string;
}

interface CurrencyConversionResult {
  success: boolean;
  usdAmount?: number;
  error?: string;
}

/**
 * Validate merchant exists and get merchant data
 */
async function validateMerchant(
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
): Promise<{ success: boolean; merchant?: MerchantData; error?: string; code?: string }> {
  try {
    const merchantQuery = supabase
      .from("merchants")
      .select(`
        merchant_id,
        dynamic_id,
        privy_id,
        wallet_address,
        status,
        tokens!inner(chain_id, token_address),
        logo_url
      `);

    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (merchantError || !merchant) {
      return {
        success: false,
        error: "Merchant not found or has no default token configured",
      };
    }

    // Check merchant status
    if (merchant.status === 'PIN_BLOCKED') {
      return {
        success: false,
        error: 'Account blocked due to PIN security violations',
        code: 'PIN_BLOCKED'
      };
    }

    if (merchant.status === 'INACTIVE') {
      return {
        success: false,
        error: 'Account is inactive',
        code: 'INACTIVE'
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
 * Convert currency amount to USD using cached rates
 */
async function convertCurrencyToUSD(
  supabase: any,
  currency: string,
  amount: number,
): Promise<CurrencyConversionResult> {
  try {
    const result = await currencyCache.convertToUSD(supabase, currency, amount);
    
    if (!result.success || result.usdAmount === undefined) {
      return { success: false, error: result.error };
    }

    // Validate minimum amount
    if (result.usdAmount < 0.1) {
      return {
        success: false,
        error: "Cannot create order with amount less than 0.1 USD",
      };
    }

    return { success: true, usdAmount: parseFloat(result.usdAmount.toFixed(2)) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Currency conversion failed",
    };
  }
}

/**
 * Create payment link and validate response
 */
async function createPaymentLink(
  merchant: MerchantData,
  orderData: CreateOrderRequest,
  orderNumber: string,
  formattedUsdAmount: number,
): Promise<{ success: boolean; paymentDetail?: any; error?: string }> {
  try {
    const paymentResponse = await createDaimoPaymentLink({
      merchant,
      intent: INTENT_TITLE,
      orderNumber: orderNumber,
      amountUnits: formattedUsdAmount.toString(),
      description: orderData.description,
      redirect_uri: orderData.redirect_uri,
      isOrder: true,
    });

    if (!paymentResponse.success || !paymentResponse.paymentDetail) {
      return {
        success: false,
        error: paymentResponse.error || "Payment detail is missing",
      };
    }

    return { success: true, paymentDetail: paymentResponse.paymentDetail };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment link creation failed",
    };
  }
}

/**
 * Insert order record into database
 */
async function insertOrderRecord(
  supabase: any,
  orderData: CreateOrderRequest,
  merchant: MerchantData,
  orderNumber: string,
  paymentDetail: any,
  formattedUsdAmount: number,
): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    const { redirect_uri, ...rest } = orderData;
    const orderToInsert: Order = {
      ...rest,
      number: orderNumber,
      merchant_id: merchant.merchant_id,
      payment_id: paymentDetail.id,
      merchant_chain_id: merchant.tokens.chain_id,
      merchant_address: merchant.wallet_address,
      required_amount_usd: formattedUsdAmount,
      required_token: merchant.tokens.token_address,
      status: "PENDING",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expired_at: expiresAt.toISOString(),
      payment_data: paymentDetail,
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

    return { success: true, order };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Order creation failed",
    };
  }
}

// Validate merchant and create order
async function createOrder(
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
  orderData: CreateOrderRequest,
) {
  const startTime = Date.now();
  
  try {
    // Step 1: Validate merchant (parallel with currency conversion)
    const merchantResult = await validateMerchant(supabase, userProviderId, isPrivyAuth);
    if (!merchantResult.success) {
      return {
        success: false,
        error: merchantResult.error,
        code: merchantResult.code,
      };
    }

    // Step 2: Convert currency to USD using cache
    const conversionResult = await convertCurrencyToUSD(
      supabase,
      orderData.display_currency,
      orderData.display_amount,
    );
    if (!conversionResult.success) {
      return {
        success: false,
        error: conversionResult.error,
      };
    }

    // Step 3: Generate order number
    const orderNumber = generateOrderNumber();

    // Step 4: Create payment link
    const paymentResult = await createPaymentLink(
      merchantResult.merchant!,
      orderData,
      orderNumber,
      conversionResult.usdAmount!,
    );
    if (!paymentResult.success) {
      return {
        success: false,
        error: paymentResult.error,
      };
    }

    // Step 5: Insert order record
    const insertResult = await insertOrderRecord(
      supabase,
      orderData,
      merchantResult.merchant!,
      orderNumber,
      paymentResult.paymentDetail!,
      conversionResult.usdAmount!,
    );
    if (!insertResult.success) {
      return {
        success: false,
        error: insertResult.error,
      };
    }

    // Log performance metrics
    const processingTime = Date.now() - startTime;
    console.log(`Order creation completed in ${processingTime}ms for order ${orderNumber}`);

    return {
      success: true,
      paymentDetail: paymentResult.paymentDetail,
      order_id: insertResult.order!.order_id,
      order_number: insertResult.order!.number,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Order creation failed after ${processingTime}ms:`, error);
    
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
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    const merchantQuery = supabase
      .from("merchants")
      .select(`merchant_id, status`);

    // Use appropriate column based on auth provider
    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: merchantError.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchant.status === 'PIN_BLOCKED') {
      return Response.json(
        { 
          success: false,
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    if (merchant.status === 'INACTIVE') {
      return Response.json(
        { 
          success: false,
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        { status: 403, headers: corsHeaders }
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

    const intentPayUrl = Deno.env.get("ROZO_PAY_URL");

    if (!intentPayUrl) {
      return Response.json(
        { success: false, error: "ROZO_PAY_URL is not set" },
        { status: 500, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        success: true,
        order: {
          ...order,
          qrcode: `${intentPayUrl}${order.payment_id}`,
        },
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

async function handleGetAllOrders(
  request: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    const merchantQuery = supabase
      .from("merchants")
      .select(`merchant_id, status`);

    // Use appropriate column based on auth provider
    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (merchantError || !merchant) {
      return Response.json(
        { success: false, error: merchantError.message },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchant.status === 'PIN_BLOCKED') {
      return Response.json(
        { 
          success: false,
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    if (merchant.status === 'INACTIVE') {
      return Response.json(
        { 
          success: false,
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Extract parameters from URL
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const statusParam = url.searchParams.get("status");

    // Parse and validate limit (default: 10, max: 20)
    let limit = 10; // default limit
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return Response.json(
          { success: false, error: "Limit must be a positive integer" },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      limit = Math.min(parsedLimit, 20); // enforce maximum of 20
    }

    // Parse and validate offset (default: 0)
    let offset = 0; // default offset
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return Response.json(
          { success: false, error: "Offset must be a non-negative integer" },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }
      offset = parsedOffset;
    }

    // Validate status parameter
    const validStatuses = ["pending", "completed", "failed", "expired", "discrepancy"];
    if (statusParam && !validStatuses.includes(statusParam.toLowerCase())) {
      return Response.json(
        {
          success: false,
          error:
            "Status must be one of: pending, completed, failed, expired, discrepancy",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Helper function to apply status filter
    const applyStatusFilter = (query: any) => {
      if (!statusParam) return query;

      const status = statusParam.toLowerCase();
      return status === "pending"
        ? query.in("status", ["PENDING", "PROCESSING"])
        : query.eq("status", statusParam.toUpperCase());
    };

    // Get total count and paginated orders in parallel
    const [countResult, ordersResult] = await Promise.all([
      applyStatusFilter(
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("merchant_id", merchant.merchant_id),
      ),
      applyStatusFilter(
        supabase
          .from("orders")
          .select("*")
          .eq("merchant_id", merchant.merchant_id),
      )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ]);

    const { count: totalCount } = countResult;
    const { data: orders, error } = ordersResult;

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
        total: totalCount || 0,
        offset: offset,
        limit: limit,
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

async function handleCreateOrder(
  request: Request,
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
) {
  try {
    const orderData: CreateOrderRequest = await request.json();

    // Validate required fields
    const requiredFields = ["display_currency", "display_amount"];

    for (const field of requiredFields) {
      if (!orderData[field as keyof CreateOrderRequest]) {
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
      typeof orderData.display_amount !== "number" ||
      orderData.display_amount <= 0
    ) {
      return Response.json(
        {
          success: false,
          error: "display_amount must be a positive number",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const result = await createOrder(
      supabase,
      userProviderId,
      isPrivyAuth,
      orderData,
    );

    if (!result.success || !result.paymentDetail) {
      return Response.json(
        { success: false, error: result.error || "Payment detail is missing" },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const intentPayUrl = Deno.env.get("ROZO_PAY_URL");

    if (!intentPayUrl) {
      return Response.json(
        { success: false, error: "ROZO_PAY_URL is not set" },
        { status: 500, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        success: true,
        qrcode: `${intentPayUrl}${result.paymentDetail.id}`,
        order_id: result.order_id,
        order_number: result.order_number,
        message: "Order created successfully",
        result: result,
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

    if (!DYNAMIC_ENV_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Missing environment variables" },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Route: v1/orders (POST) - Create order (no JWT required)
    if (req.method === "POST" && pathSegments[0] === "orders") {
      return await handleCreateOrder(
        req,
        supabase,
        userProviderId,
        isPrivyAuth,
      );
    }

    // Route: v1/orders/{order_id} (GET) - Get single order
    if (
      req.method === "GET" &&
      pathSegments.length === 2 &&
      pathSegments[0] === "orders"
    ) {
      const orderId = pathSegments[1];
      return await handleGetSingleOrder(
        req,
        supabase,
        orderId,
        userProviderId,
        isPrivyAuth,
      );
    }

    // Route: v1/orders (GET) - Get all orders for merchant
    if (req.method === "GET" && pathSegments[0] === "orders") {
      return await handleGetAllOrders(
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
