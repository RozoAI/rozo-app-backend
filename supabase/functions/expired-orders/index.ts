import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface ExpiredOrderStats {
  totalExpired: number;
  updatedOrders: number;
  errors: number;
  processingTimeMs: number;
}

/**
 * Handle expired orders by updating their status to FAILED
 * This function should be called by a cron job every minute
 */
async function handleExpiredOrders(supabase: any): Promise<ExpiredOrderStats> {
  const startTime = Date.now();
  const stats: ExpiredOrderStats = {
    totalExpired: 0,
    updatedOrders: 0,
    errors: 0,
    processingTimeMs: 0,
  };

  try {
    const now = new Date().toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Update all expired orders in one query
    const { data: updatedOrders, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "EXPIRED",
        updated_at: now,
      })
      .eq("status", "PENDING")
      .or(`expired_at.lt.${now},and(expired_at.is.null,created_at.lt.${tenMinutesAgo})`)
      .select("order_id, number");

    if (updateError) {
      console.error("Error updating expired orders:", updateError);
      stats.errors++;
      return stats;
    }

    stats.totalExpired = updatedOrders?.length || 0;
    stats.updatedOrders = stats.totalExpired;

    if (stats.totalExpired > 0) {
      console.log(`Updated ${stats.totalExpired} expired orders:`, 
        updatedOrders?.map(order => order.number).join(", "));
    } else {
      console.log("No expired orders found");
    }

  } catch (error) {
    console.error("Unexpected error in handleExpiredOrders:", error);
    stats.errors++;
  } finally {
    stats.processingTimeMs = Date.now() - startTime;
  }

  return stats;
}

/**
 * Notify merchants about their expired orders
 */
async function notifyMerchantsAboutExpiredOrders(
  supabase: any,
  expiredOrders: Array<{ order_id: string; number: string }>
): Promise<void> {
  try {
    // Group orders by merchant_id
    const merchantOrders = new Map<string, string[]>();
    
    for (const order of expiredOrders) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("merchant_id")
        .eq("order_id", order.order_id)
        .single();
      
      if (orderData) {
        const merchantId = orderData.merchant_id;
        if (!merchantOrders.has(merchantId)) {
          merchantOrders.set(merchantId, []);
        }
        merchantOrders.get(merchantId)!.push(order.number);
      }
    }

    // Send notifications (placeholder for actual notification service)
    for (const [merchantId, orderNumbers] of merchantOrders) {
      console.log(
        `Merchant ${merchantId} has ${orderNumbers.length} expired orders: ${orderNumbers.join(", ")}`
      );
      
      // TODO: Implement actual notification sending
      // await pushNotification(merchantId, "orders_expired", {
      //   message: `${orderNumbers.length} orders have expired`,
      //   order_numbers: orderNumbers,
      // });
    }
  } catch (error) {
    console.error("Error notifying merchants about expired orders:", error);
  }
}

/**
 * Health check endpoint
 */
async function handleHealthCheck(): Promise<Response> {
  return Response.json(
    {
      success: true,
      message: "Expired orders cron is running",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}

/**
 * Manual trigger endpoint for testing
 */
async function handleManualTrigger(supabase: any): Promise<Response> {
  try {
    const stats = await handleExpiredOrders(supabase);
    
    return Response.json(
      {
        success: true,
        message: "Expired orders processed manually",
        stats,
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

// Main serve function
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Missing environment variables" },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // Route: GET /health - Health check
    if (req.method === "GET" && pathSegments[0] === "health") {
      return await handleHealthCheck();
    }

    // Route: POST /trigger - Manual trigger for testing
    if (req.method === "POST" && pathSegments[0] === "trigger") {
      return await handleManualTrigger(supabase);
    }

    // Route: POST / - Cron job endpoint (default)
    if (req.method === "POST") {
      const stats = await handleExpiredOrders(supabase);
      
      return Response.json(
        {
          success: true,
          message: "Expired orders processed",
          stats,
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // Route not found
    return Response.json(
      { error: "Route not found" },
      {
        status: 404,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return Response.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
