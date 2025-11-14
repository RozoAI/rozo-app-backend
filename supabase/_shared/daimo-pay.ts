interface DaimoPayment {
  id: string;
  status: string;
  createdAt: string;
  display: {
    intent: string;
    paymentValue: string;
    currency: string;
  };
  source: any | null;
  destination: {
    destinationAddress: string;
    txHash: string | null;
    chainId: string;
    amountUnits: string;
    tokenSymbol: string;
    tokenAddress: string;
    callData: string;
  };
  externalId: string;
  metadata: Record<string, any>;
}

interface DaimoPaymentResponse {
  success: boolean;
  paymentDetail: DaimoPayment | null;
  error?: string;
}

interface TokenData {
  token_id: string;
  token_name: string;
  token_address: string;
  chain_id: string;
  chain_name: string;
}

type CreateDaimoPaymentLinkProps = {
  intent: string,
  destinationAddress: string,
  amountUnits: string,
  orderNumber: string,
  description?: string,
  redirect_uri?: string,
  destinationToken: TokenData,
  preferredToken: TokenData,
  isOrder?: boolean;
}

/**
 * @param intent - Purpose of the payment (e.g., "Pay Order", "Purchase", "Deposit")
 * @param destinationToken - Token configuration for destination (where payment goes)
 * @param preferredToken - Token configuration for preferred payment method
 * @param amountUnits - Amount to receive as string (e.g., "1.00", "10.50")
 * @returns Payment link URL and payment ID
 */
export async function createDaimoPaymentLink({
  intent,
  destinationAddress,
  amountUnits,
  orderNumber,
  description,
  redirect_uri,
  destinationToken,
  preferredToken,
  isOrder = true
}: CreateDaimoPaymentLinkProps): Promise<DaimoPaymentResponse> {
  const destinationChainId = Number(destinationToken.chain_id);
  const tokenAddress = destinationToken.token_address;

  try {
    // Get API key from environment variables
    const apiKey = Deno.env.get('DAIMO_API_KEY');
    if (!apiKey) {
      return {
        success: false,
        paymentDetail: null,
        error: 'DAIMO_API_KEY environment variable is not set',
      };
    }

    // Validate required parameters
    if (
      !intent ||
      !destinationAddress ||
      !destinationChainId ||
      !tokenAddress ||
      !amountUnits
    ) {
      return {
        success: false,
        paymentDetail: null,
        error: 'Missing required parameters for Creating paymentLink',
      };
    }

    // Validate amount format
    if (isNaN(parseFloat(amountUnits)) || parseFloat(amountUnits) <= 0) {
      return {
        success: false,
        paymentDetail: null,
        error: 'amountUnits must be a valid positive number',
      };
    }

    // Construct payment request
    const paymentRequest = {
      appId: "rozoApp",
      display: {
        intent: intent || "Pay",
        paymentValue: String(parseFloat(amountUnits)),
        currency: "USD",
      },
      destination: {
        destinationAddress,
        chainId: String(destinationChainId),
        amountUnits: String(parseFloat(amountUnits)),
        tokenSymbol: destinationToken.token_name,
        tokenAddress: tokenAddress,
      },
      externalId: orderNumber || "",
      metadata: {
        orderNumber: orderNumber || "",
        intent: intent || "Pay",
        items: [
          { name: isOrder ? "Order Number" : "Deposit Number", description: orderNumber },
          ...(description ? [{ name: "Note", description }] : []),
        ],
        payer: {},
        orderDate: new Date().toISOString(),
        merchantToken: destinationAddress || "",
        forMerchant: true,
        callbackUrl: "https://iufqieirueyalyxfzszh.supabase.co/functions/v1/payment-callback"
      },
      preferredChain: preferredToken.chain_id,
      preferredToken: preferredToken.token_name,
      preferredTokenAddress: preferredToken.token_address,
      callbackUrl: "https://iufqieirueyalyxfzszh.supabase.co/functions/v1/payment-callback"
    };

    // Make API request to Daimo Pay
    // const response = await fetch('https://pay.daimo.com/api/payment', {
    const response = await fetch('https://intentapiv2.rozo.ai/functions/v1/payment-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(paymentRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        paymentDetail: null,
        error: `Daimo API Error ${response.status}: ${errorText}`,
      };
    }

    const paymentDetail = await response.json() as DaimoPayment;
    return {
      success: true,
      paymentDetail,
    };
  } catch (error) {
    return {
      success: false,
      paymentDetail: null,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
