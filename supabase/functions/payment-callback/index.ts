import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { pushNotification } from "./pusher.ts";

// Payment status enum matching your database
enum PaymentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  DISCREPANCY = "DISCREPANCY",
}

// Status hierarchy for proper state transitions
const STATUS_HIERARCHY = {
  [PaymentStatus.PENDING]: 0,
  [PaymentStatus.PROCESSING]: 1,
  [PaymentStatus.COMPLETED]: 2,
  [PaymentStatus.FAILED]: 2,
  [PaymentStatus.EXPIRED]: 2,
  [PaymentStatus.DISCREPANCY]: 2,
};

interface DaimoWebhookEvent {
  event:
    | "payment_started"
    | "payment.completed"
    | "payment_completed"
    | "payment_bounced"
    | "payment_refunded";
  timestamp: string;
  payment: {
    id: string;
    token: string | null;
    amount: string | null;
    status: string;
    metadata: {
      appId: string;
      items: Array<{
        name: string;
        description: string;
      }>;
      payer: Record<string, any>;
      intent: string;
      orderDate: string;
      webhookUrl: string;
      block_number: number;
      daimoOrderId: string;
      from_address: string;
      actual_amount: string;
      merchantToken: string;
      webhook_source: string;
      transaction_hash: string;
      webhook_detected: boolean;
      webhook_event_id: string;
      webhook_timestamp: string;
      monitoring_attempts: number;
    };
    created_at: string;
    updated_at: string;
    external_id: string | null;
    source_data: any;
    completed_at: string;
    display_data: {
      name: string;
      logoUrl: string;
      description: string;
    };
    payinchainid: string;
    source_chain: string | null;
    payout_success: boolean | null;
    refund_address: string | null;
    destination_data: {
      chainId: string;
      amountUnits: string;
      tokenAddress: string;
      destinationAddress: string;
    };
    source_ecosystem: string | null;
    destination_chain: string;
    payintokenaddress: string;
    receiving_address: string;
    payout_processed_at: string | null;
    destination_ecosystem: string;
    payout_transaction_hash: string | null;
  };
}

interface OrderRecord {
  order_id: string;
  merchant_id: string;
  payment_id: string;
  status: PaymentStatus;
  callback_payload: any;
  display_currency: string;
  display_amount: number;
  merchant_chain_id: string;
  merchant_address: string;
  required_token: string;
  required_amount_usd: number;
  created_at: string;
  updated_at: string;
  source_txn_hash: string;
  source_chain_name: string;
  source_token_address: string;
  source_token_amount: number;
  number: string;
  deposit_id?: string;
}

interface DepositRecord extends Omit<OrderRecord, "order_id"> {
  deposit_id: string;
}

serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Verify webhook authentication
    // const authHeader = req.headers.get('Authorization');
    // const expectedToken = Deno.env.get('DAIMO_WEBHOOK_SECRET');

    // if (!expectedToken) {
    //   console.error('DAIMO_WEBHOOK_SECRET environment variable not set');
    //   return new Response('Server configuration error', { status: 500 });
    // }

    // if (!authHeader) {
    //   console.error('Missing Authorization header');
    //   return new Response('Unauthorized: Missing authorization header', {
    //     status: 401,
    //   });
    // }

    // // Check if it's Basic auth format
    // if (!authHeader.startsWith('Basic ')) {
    //   console.error('Invalid Authorization header format');
    //   return new Response('Unauthorized: Invalid authorization format', {
    //     status: 401,
    //   });
    // }

    // // Extract and verify the token
    // const providedToken = authHeader.substring(6); // Remove "Basic " prefix
    // if (providedToken !== expectedToken) {
    //   console.error('Invalid webhook token');
    //   return new Response('Unauthorized: Invalid token', { status: 401 });
    // }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Parse webhook payload
    const webhookEvent = await req.json();
    console.log(webhookEvent);
    console.log(
      `Received webhook: ${webhookEvent.event} for payment ${webhookEvent.payment.id}`,
    );

    // Validate required fields
    if (
      !webhookEvent.event ||
      !webhookEvent.payment ||
      !webhookEvent.payment.id ||
      !webhookEvent.payment.metadata?.merchantToken
    ) {
      const missingFields = [];
      if (!webhookEvent.event) missingFields.push("event");
      if (!webhookEvent.payment) missingFields.push("payment");
      if (!webhookEvent.payment?.id) missingFields.push("payment.id");
      if (!webhookEvent.payment?.metadata?.merchantToken) {
        missingFields.push("payment.metadata.merchantToken");
      }
      console.error(
        `Invalid webhook payload: missing required fields: ${
          missingFields.join(", ")
        }`,
      );
      return new Response("Invalid payload", { status: 400 });
    }

    // Find order or deposit by number using metadata.daimoOrderId
    let existingOrder: OrderRecord | null = null;
    let tableName = "orders";
    const orderNumber = webhookEvent.payment.metadata?.daimoOrderId;

    if (!orderNumber) {
      console.error("Missing daimoOrderId in webhook metadata");
      return new Response("Missing order number", { status: 400 });
    }

    const { data: orderData, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("number", orderNumber)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Database error fetching order:", fetchError);
      return new Response("Database error", { status: 500 });
    }

    if (orderData) {
      existingOrder = orderData as OrderRecord;
    }

    if (!existingOrder) {
      const { data: existingDeposit, error: fetchErrorDeposit } = await supabase
        .from("deposits")
        .select("*")
        .eq("number", orderNumber)
        .single();

      if (fetchErrorDeposit && fetchErrorDeposit.code !== "PGRST116") {
        console.error("Database error fetching deposit:", fetchErrorDeposit);
        return new Response("Database error", { status: 500 });
      }

      tableName = "deposits";
      existingOrder = existingDeposit as OrderRecord;
    }

    if (!existingOrder) {
      console.error(
        `No order or deposit found for number: ${orderNumber}`,
      );
      return new Response("Order not found", { status: 404 });
    }

    // Validate payment details match order
    const validationResult = validatePaymentDetails(
      existingOrder,
      webhookEvent,
    );
    if (!validationResult.isValid) {
      console.error("Payment validation failed:", validationResult.errors);
      return new Response(
        `Validation failed: ${validationResult.errors.join(", ")}`,
        { status: 400 },
      );
    }

    // Check if this status transition is allowed
    const newStatus = mapWebhookTypeToStatus(webhookEvent.event);
    const currentStatus = existingOrder.status as PaymentStatus;

    const currentStatusLevel = STATUS_HIERARCHY[currentStatus];
    const newStatusLevel = STATUS_HIERARCHY[newStatus];

    // Prevent backward transitions (e.g., completed -> started)
    if (newStatusLevel < currentStatusLevel) {
      console.log(
        `Ignoring backward status transition from ${currentStatus} to ${newStatus} for payment ${webhookEvent.payment.id}`,
      );
      return new Response("Status transition ignored", { status: 200 });
    }

    // If status is the same, check if this is a duplicate webhook
    if (currentStatus === newStatus) {
      console.log(
        `Duplicate webhook received for payment ${webhookEvent.payment.id} with status ${newStatus} for ${tableName}: ${orderNumber}`,
      );
      return new Response("Duplicate webhook ignored", { status: 200 });
    }

    // Prepare common update data
    const baseUpdateData = {
      status: newStatus,
      callback_payload: webhookEvent,
      source_txn_hash: webhookEvent.payment.metadata?.transaction_hash,
      source_chain_name: webhookEvent.payment.payinchainid,
      source_token_address: webhookEvent.payment.payintokenaddress,
      source_token_amount: Number(webhookEvent.payment.metadata?.actual_amount),
      updated_at: new Date().toISOString(),
    };

    // Add transaction hashes based on webhook type
    if (
      webhookEvent.event === "payment_started" &&
      webhookEvent.payment.metadata?.transaction_hash
    ) {
      baseUpdateData.source_txn_hash =
        webhookEvent.payment.metadata.transaction_hash;
    }

    // For orders, use Partial<OrderRecord> typing; for deposits, use the base data
    const updateData = baseUpdateData as Partial<OrderRecord>;

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq("number", orderNumber);

    if (updateError) {
      const recordType = tableName === "orders" ? "order" : "deposit";
      console.error(`Error updating ${recordType}:`, updateError);
      return new Response(`Failed to update ${recordType}`, { status: 500 });
    }

    console.log(
      `Successfully updated order ${
        tableName === "orders"
          ? existingOrder.order_id
          : existingOrder.deposit_id
      } status from ${currentStatus} to ${newStatus}`,
    );

    // Handle specific webhook types
    await handleWebhookType(webhookEvent, existingOrder);

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});

/**
 * Maps Daimo webhook event types to your database payment status enum
 */
function mapWebhookTypeToStatus(webhookType: string): PaymentStatus {
  switch (webhookType) {
    case "payment_started":
      return PaymentStatus.PROCESSING;
    case "payment.completed":
      return PaymentStatus.COMPLETED;
    case "payment_bounced":
      return PaymentStatus.DISCREPANCY;
    case "payment_refunded":
      return PaymentStatus.FAILED;
    default:
      throw new Error(`Unknown webhook type: ${webhookType}`);
  }
}

/**
 * Validates that the webhook payment details match the stored order
 */
function validatePaymentDetails(
  order: OrderRecord | DepositRecord,
  webhook: DaimoWebhookEvent,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate merchant token
  if (order.merchant_address !== webhook.payment.metadata?.merchantToken) {
    errors.push(
      `Merchant token mismatch: expected ${order.merchant_address}, got ${webhook.payment.metadata?.merchantToken}`,
    );
  }

  /* // Validate destination chain ID
  if (webhook.payment.destination?.chainId !== order.merchant_chain_id) {
    errors.push(
      `Chain ID mismatch: expected ${order.merchant_chain_id}, got ${webhook.payment.destination?.chainId}`
    );
  }

  // Validate destination address
  if (
    webhook.payment.destination?.destinationAddress.toLowerCase() !==
    order.merchant_address.toLowerCase()
  ) {
    errors.push(
      `Address mismatch: expected ${order.merchant_address}, got ${webhook.payment.destination?.destinationAddress}`
    );
  }

  // Validate destination token
  if (
    webhook.payment.destination?.tokenAddress.toLowerCase() !==
    order.required_token.toLowerCase()
  ) {
    errors.push(
      `Token mismatch: expected ${order.required_token}, got ${webhook.payment.destination?.tokenAddress}`
    );
  }

  // Validate destination amount (allow small rounding differences)
  if (webhook.payment.destination?.amountUnits) {
    const expectedAmount = Number(order.required_amount_usd.toFixed(2));
    const actualAmount = Number(
      parseFloat(webhook.payment.destination.amountUnits).toFixed(2)
    );

    if (expectedAmount !== actualAmount) {
      errors.push(
        `Amount mismatch: expected ${expectedAmount.toFixed(
          2
        )}, got ${actualAmount.toFixed(2)}`
      );
    }
  } */

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Handles specific logic for each webhook type
 */
async function handleWebhookType(
  webhook: DaimoWebhookEvent,
  order: OrderRecord,
): Promise<void> {
  const orderId = order.order_id || order.deposit_id;

  let webhookEvent = webhook.event;

  if (webhook.event === "payment.completed") {
    webhookEvent = "payment_completed";
  }

  switch (webhookEvent) {
    case "payment_started":
      console.log(
        `Payment started for order ${orderId}: source tx ${webhook.payment.metadata?.transaction_hash} on chain ${webhook.payment.payinchainid}`,
      );
      // Add any payment started specific logic here
      break;

    case "payment_completed": {
      console.log(
        `Payment completed for order ${orderId}: destination tx ${webhook.payment.metadata?.transaction_hash} on chain ${webhook.payment.payinchainid}`,
      );
      const paymentCompletedNotification = await pushNotification(
        order.merchant_id,
        webhookEvent,
        {
          message: "Payment completed",
          order_id: orderId,
          display_currency: order.display_currency,
          display_amount: order.display_amount,
        },
      );
      if (!paymentCompletedNotification.success) {
        console.error(
          "Failed to Send Payment Notification:",
          paymentCompletedNotification.error,
        );
      }
      break;
    }

    case "payment_bounced":
      console.log(
        `Payment bounced for order ${orderId}: tx ${webhook.payment.metadata?.transaction_hash} on chain ${webhook.payment.payinchainid}`,
      );
      // Add any payment bounce specific logic here (e.g., notify customer)
      break;

    case "payment_refunded": {
      console.log(
        `Payment refunded for order ${orderId}: tx ${webhook.payment.metadata?.transaction_hash} on chain ${webhook.payment.payinchainid}`,
      );
      const paymentRefundNotification = await pushNotification(
        order.merchant_id,
        webhookEvent,
        {
          message: "Payment Refunded",
          order_id: orderId,
          display_currency: order.display_currency,
          display_amount: order.display_amount,
        },
      );
      if (!paymentRefundNotification.success) {
        console.error(
          "Failed to Send Payment Notification:",
          paymentRefundNotification.error,
        );
      }
      break;
    }

    default:
      console.warn(`Unhandled webhook type: ${webhookEvent}`);
  }
}
