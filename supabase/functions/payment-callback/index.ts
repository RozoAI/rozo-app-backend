import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { pushNotification } from './pusher.ts';

// Payment status enum matching your database
enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DISCREPANCY = 'DISCREPANCY',
}

// Status hierarchy for proper state transitions
const STATUS_HIERARCHY = {
  [PaymentStatus.PENDING]: 0,
  [PaymentStatus.PROCESSING]: 1,
  [PaymentStatus.COMPLETED]: 2,
  [PaymentStatus.FAILED]: 2,
  [PaymentStatus.DISCREPANCY]: 2,
};

interface DaimoWebhookEvent {
  type:
    | 'payment_started'
    | 'payment_completed'
    | 'payment_bounced'
    | 'payment_refunded';
  paymentId: string;
  chainId: number;
  txHash: string;
  payment: {
    id: string;
    status: string;
    createdAt: string;
    display: {
      intent: string;
      paymentValue: string;
      currency: string;
    };
    source: {
      payerAddress: string;
      txHash: string;
      chainId: string;
      amountUnits: string;
      tokenSymbol: string;
      tokenAddress: string;
    };
    destination: {
      destinationAddress: string;
      txHash: string | null;
      chainId: string;
      amountUnits: string;
      tokenSymbol: string;
      tokenAddress: string;
      calldata?: string;
    };
    externalId?: string | null;
    metadata?: Record<string, any> | null;
  };
  isTestEvent?: boolean;
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
}

interface DepositRecord extends Omit<OrderRecord, 'deposit_id'> {
  deposit_id: string;
}

serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify webhook authentication
    const authHeader = req.headers.get('Authorization');
    const expectedToken = Deno.env.get('DAIMO_WEBHOOK_SECRET');

    if (!expectedToken) {
      console.error('DAIMO_WEBHOOK_SECRET environment variable not set');
      return new Response('Server configuration error', { status: 500 });
    }

    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response('Unauthorized: Missing authorization header', {
        status: 401,
      });
    }

    // Check if it's Basic auth format
    if (!authHeader.startsWith('Basic ')) {
      console.error('Invalid Authorization header format');
      return new Response('Unauthorized: Invalid authorization format', {
        status: 401,
      });
    }

    // Extract and verify the token
    const providedToken = authHeader.substring(6); // Remove "Basic " prefix
    if (providedToken !== expectedToken) {
      console.error('Invalid webhook token');
      return new Response('Unauthorized: Invalid token', { status: 401 });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse webhook payload
    const webhookEvent: DaimoWebhookEvent = await req.json();

    console.log(
      `Received Daimo webhook: ${webhookEvent.type} for payment ${webhookEvent.paymentId}`,
    );

    // Validate required fields
    if (
      !webhookEvent.type ||
      !webhookEvent.paymentId ||
      !webhookEvent.payment
    ) {
      console.error('Invalid webhook payload: missing required fields');
      return new Response('Invalid payload', { status: 400 });
    }

    // Skip test events in production (optional)
    if (webhookEvent.isTestEvent && Deno.env.get('DENO_ENV') === 'production') {
      console.log('Skipping test event in production');
      return new Response('Test event skipped', { status: 200 });
    }

    const isOrder = webhookEvent.payment.metadata?.isOrder === 'true';
    const tableName = isOrder ? 'orders' : 'deposits';

    // Find the order by payment_id
    const { data: existingOrder, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('payment_id', webhookEvent.paymentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      console.error('Database error fetching order:', fetchError);
      return new Response('Database error', { status: 500 });
    }

    if (!existingOrder) {
      console.error(`No order found for payment_id: ${webhookEvent.paymentId}`);
      return new Response('Order not found', { status: 404 });
    }

    // Validate payment details match order
    const validationResult = validatePaymentDetails(
      existingOrder,
      webhookEvent,
    );
    if (!validationResult.isValid) {
      console.error('Payment validation failed:', validationResult.errors);
      return new Response(
        `Validation failed: ${validationResult.errors.join(', ')}`,
        { status: 400 },
      );
    }

    // Check if this status transition is allowed
    const newStatus = mapWebhookTypeToStatus(webhookEvent.type);
    const currentStatus = existingOrder.status as PaymentStatus;

    const currentStatusLevel = STATUS_HIERARCHY[currentStatus];
    const newStatusLevel = STATUS_HIERARCHY[newStatus];

    // Prevent backward transitions (e.g., completed -> started)
    if (newStatusLevel < currentStatusLevel) {
      console.log(
        `Ignoring backward status transition from ${currentStatus} to ${newStatus} for payment ${webhookEvent.paymentId}`,
      );
      return new Response('Status transition ignored', { status: 200 });
    }

    // If status is the same, check if this is a duplicate webhook
    if (currentStatus === newStatus) {
      console.log(
        `Duplicate webhook received for payment ${webhookEvent.paymentId} with status ${newStatus}`,
      );
      return new Response('Duplicate webhook ignored', { status: 200 });
    }

    // Prepare common update data
    const baseUpdateData = {
      status: newStatus,
      callback_payload: webhookEvent,
      source_txn_hash: webhookEvent.payment.source?.txHash,
      source_chain_name: webhookEvent.payment.source?.chainId,
      source_token_address: webhookEvent.payment.source?.tokenAddress,
      source_token_amount: Number(webhookEvent.payment.source?.amountUnits),
      updated_at: new Date().toISOString(),
    };

    // Add transaction hashes based on webhook type
    if (
      webhookEvent.type === 'payment_started' &&
      webhookEvent.payment.source?.txHash
    ) {
      baseUpdateData.source_txn_hash = webhookEvent.payment.source.txHash;
    }

    // For orders, use Partial<OrderRecord> typing; for deposits, use the base data
    const updateData = isOrder
      ? baseUpdateData as Partial<OrderRecord>
      : baseUpdateData;

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('payment_id', webhookEvent.paymentId);

    if (updateError) {
      const recordType = isOrder ? 'order' : 'deposit';
      console.error(`Error updating ${recordType}:`, updateError);
      return new Response(`Failed to update ${recordType}`, { status: 500 });
    }

    console.log(
      `Successfully updated order ${existingOrder.order_id} status from ${currentStatus} to ${newStatus}`,
    );

    // Handle specific webhook types
    await handleWebhookType(webhookEvent, existingOrder);

    return new Response('Webhook processed successfully', { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response('Internal server error', { status: 500 });
  }
});

/**
 * Maps Daimo webhook event types to your database payment status enum
 */
function mapWebhookTypeToStatus(webhookType: string): PaymentStatus {
  switch (webhookType) {
    case 'payment_started':
      return PaymentStatus.PROCESSING;
    case 'payment_completed':
      return PaymentStatus.COMPLETED;
    case 'payment_bounced':
      return PaymentStatus.DISCREPANCY;
    case 'payment_refunded':
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
): { isValid: boolean; errors: string[]; isOrder: boolean } {
  const errors: string[] = [];

  // Validate order number
  if (order.number !== webhook.payment.externalId) {
    errors.push(
      `Order number mismatch: expected ${order.number}, got ${webhook.payment.externalId}`,
    );
  }

  // Validate merchant ID
  if (order.merchant_id !== webhook.payment.metadata?.merchantId) {
    errors.push(
      `Merchant ID mismatch: expected ${order.merchant_id}, got ${webhook.payment.metadata?.merchantId}`,
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
  switch (webhook.type) {
    case 'payment_started':
      console.log(
        `Payment started for order ${order.order_id}: source tx ${webhook.payment.source?.txHash} on chain ${webhook.payment.source?.chainId}`,
      );
      // Add any payment started specific logic here
      break;

    case 'payment_completed': {
      console.log(
        `Payment completed for order ${order.order_id}: destination tx ${webhook.txHash} on chain ${webhook.chainId}`,
      );
      const paymentCompletedNotification = await pushNotification(
        order.merchant_id,
        webhook.type,
        {
          message: 'Payment completed',
          order_id: order.order_id,
          display_currency: order.display_currency,
          display_amount: order.display_amount,
        },
      );
      if (!paymentCompletedNotification.success) {
        console.error(
          'Failed to Send Payment Notification:',
          paymentCompletedNotification.error,
        );
      }
      break;
    }

    case 'payment_bounced':
      console.log(
        `Payment bounced for order ${order.order_id}: tx ${webhook.txHash} on chain ${webhook.chainId}`,
      );
      // Add any payment bounce specific logic here (e.g., notify customer)
      break;

    case 'payment_refunded': {
      console.log(
        `Payment refunded for order ${order.order_id}: tx ${webhook.txHash} on chain ${webhook.chainId}`,
      );
      const paymentRefundNotification = await pushNotification(
        order.merchant_id,
        webhook.type,
        {
          message: 'Payment Refunded',
          order_id: order.order_id,
          display_currency: order.display_currency,
          display_amount: order.display_amount,
        },
      );
      if (!paymentRefundNotification.success) {
        console.error(
          'Failed to Send Payment Notification:',
          paymentRefundNotification.error,
        );
      }
      break;
    }

    default:
      console.warn(`Unhandled webhook type: ${webhook.type}`);
  }
}
