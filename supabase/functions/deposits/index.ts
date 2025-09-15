import { Context, Hono } from "jsr:@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { dualAuthMiddleware } from "../../_shared/dual-auth-middleware.ts";
import { createDeposit, CreateDepositRequest } from "./utils.ts";

const functionName = "deposits";
const app = new Hono().basePath(`/${functionName}`);

// Business Logic
async function handleGetAllDeposits(c: Context) {
  try {
    const supabase = c.get("supabase");
    const dynamicId = c.get("dynamicId");
    const isPrivyAuth = c.get("isPrivyAuth");

    const merchantQuery = supabase
      .from("merchants")
      .select(`merchant_id, status`);

    // Use appropriate column based on auth provider
    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", dynamicId).single()
      : await merchantQuery.eq("dynamic_id", dynamicId).single();

    if (merchantError || !merchant) {
      return c.json(
        { success: false, error: merchantError.message },
        404,
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchant.status === 'PIN_BLOCKED') {
      return c.json(
        { 
          success: false,
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        403,
      );
    }

    if (merchant.status === 'INACTIVE') {
      return c.json(
        { 
          success: false,
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        403,
      );
    }

    // Extract parameters from URL
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const statusParam = url.searchParams.get("status");

    // Parse and validate limit (default: 10, max: 20)
    let limit = 10; // default limit
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return c.json(
          { success: false, error: "Limit must be a positive integer" },
          400,
        );
      }
      limit = Math.min(parsedLimit, 20); // enforce maximum of 20
    }

    // Parse and validate offset (default: 0)
    let offset = 0; // default offset
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return c.json(
          { success: false, error: "Offset must be a non-negative integer" },
          400,
        );
      }
      offset = parsedOffset;
    }

    // Validate status parameter
    const validStatuses = ["pending", "completed", "failed", "expired", "discrepancy"];
    if (statusParam && !validStatuses.includes(statusParam.toLowerCase())) {
      return c.json(
        {
          success: false,
          error:
            "Status must be one of: pending, completed, failed, expired, discrepancy",
        },
        400,
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

    // Get total count and paginated deposits in parallel
    const [countResult, depositsResult] = await Promise.all([
      applyStatusFilter(
        supabase
          .from("deposits")
          .select("*", { count: "exact", head: true })
          .eq("merchant_id", merchant.merchant_id),
      ),
      applyStatusFilter(
        supabase
          .from("deposits")
          .select("*")
          .eq("merchant_id", merchant.merchant_id),
      )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ]);

    const { count: totalCount } = countResult;
    const { data: deposits, error } = depositsResult;

    if (error) {
      return c.json(
        { success: false, error: error.message },
        400,
      );
    }

    return c.json(
      {
        success: true,
        deposits: deposits || [],
        total: totalCount || 0,
        offset: offset,
        limit: limit,
      },
      200,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      500,
    );
  }
}

async function handleGetSingleDeposit(
  c: Context,
  depositId: string,
) {
  try {
    const dynamicId = c.get("dynamicId");
    const supabase = c.get("supabase");
    const isPrivyAuth = c.get("isPrivyAuth");

    const merchantQuery = supabase
      .from("merchants")
      .select(`merchant_id, status`);

    // Use appropriate column based on auth provider
    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", dynamicId).single()
      : await merchantQuery.eq("dynamic_id", dynamicId).single();

    if (merchantError || !merchant) {
      return c.json(
        { success: false, error: merchantError.message },
        404,
      );
    }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchant.status === 'PIN_BLOCKED') {
      return c.json(
        { 
          success: false,
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        403,
      );
    }

    if (merchant.status === 'INACTIVE') {
      return c.json(
        { 
          success: false,
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        403,
      );
    }

    const { data: deposit, error } = await supabase
      .from("deposits")
      .select("*")
      .eq("deposit_id", depositId)
      .eq("merchant_id", merchant.merchant_id)
      .single();

    if (error) {
      return c.json(
        { success: false, error: error.message },
        404,
      );
    }

    return c.json(
      {
        success: true,
        deposit: deposit,
      },
      200,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      500,
    );
  }
}

async function handleCreateDeposit(c: Context) {
  try {
    const dynamicId = c.get("dynamicId");
    const supabase = c.get("supabase");
    const isPrivyAuth = c.get("isPrivyAuth");

    const merchantQuery = supabase
    .from('merchants')
    .select('merchant_id, status');
  
  const { data: merchant, error: merchantError } = isPrivyAuth
    ? await merchantQuery.eq('privy_id', dynamicId).single()
    : await merchantQuery.eq('dynamic_id', dynamicId).single();
    
  if (merchantError || !merchant) {
    return {
      merchant: null,
      error: Response.json(
        { success: false, error: 'Merchant not found' },
        { status: 404, headers: corsHeaders }
      )
    };
  }

    // Check merchant status (PIN_BLOCKED or INACTIVE)
    if (merchant.status === 'PIN_BLOCKED') {
      return c.json(
        { 
          success: false,
          error: 'Account blocked due to PIN security violations',
          code: 'PIN_BLOCKED'
        },
        403,
      );
    }

    if (merchant.status === 'INACTIVE') {
      return c.json(
        { 
          success: false,
          error: 'Account is inactive',
          code: 'INACTIVE'
        },
        403,
      );
    }

    const depositData: CreateDepositRequest = await c.req.json();

    // Validate required fields
    const requiredFields = ["display_currency", "display_amount"];

    for (const field of requiredFields) {
      if (!depositData[field as keyof CreateDepositRequest]) {
        return c.json(
          { success: false, error: `Missing required field: ${field}` },
          400,
        );
      }
    }

    // Validate numeric fields
    if (
      typeof depositData.display_amount !== "number" ||
      depositData.display_amount <= 0
    ) {
      return c.json(
        {
          success: false,
          error: "display_amount must be a positive number",
        },
        400,
      );
    }

    const result = await createDeposit(
      supabase,
      dynamicId,
      isPrivyAuth,
      depositData,
    );

    if (!result.success || !result.paymentDetail) {
      return c.json(
        { success: false, error: result.error || "Payment detail is missing" },
        400,
      );
    }

    const intentPayUrl = Deno.env.get("ROZO_PAY_URL");

    if (!intentPayUrl) {
      return c.json(
        { success: false, error: "ROZO_PAY_URL is not set" },
        500,
      );
    }

    return c.json(
      {
        success: true,
        qrcode: `${intentPayUrl}${result.paymentDetail.id}`,
        deposit_id: result.deposit_id,
        message: "Deposit created successfully",
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: `Server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      500,
    );
  }
}

// Configure CORS
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
  }),
);

app.options("*", (c) => c.text("ok"));

// Set Middleware
app.use(dualAuthMiddleware);

// Routes
app.post("/", handleCreateDeposit);
app.get("/", handleGetAllDeposits);
app.get(
  "/:depositId",
  (c) => handleGetSingleDeposit(c, c.req.param("depositId")),
);

Deno.serve(app.fetch);
