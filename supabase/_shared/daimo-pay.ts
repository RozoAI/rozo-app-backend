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

type CreateDaimoPaymentLinkProps = {
  intent: string,
  merchant: any,
  amountUnits: string,
  orderNumber: string,
  description?: string,
  redirect_uri?: string,
  isOrder?: boolean;
}

/**
 * @param intent - Purpose of the payment (e.g., "Pay Order", "Purchase", "Deposit")
 * @param destinationAddress - Recipient wallet address
 * @param destinationChainId - Destination chain ID (10=Optimism, 8453=Base, 137=Polygon, 42161=Arbitrum)
 * @param tokenAddress - Token contract address (use "0x0000000000000000000000000000000000000000" for native)
 * @param amountUnits - Amount to receive as string (e.g., "1.00", "10.50")
 * @returns Payment link URL and payment ID
 */
export async function createDaimoPaymentLink({
  intent,
  amountUnits,
  merchant,
  orderNumber,
  description,
  redirect_uri,
  isOrder = true
}: CreateDaimoPaymentLinkProps): Promise<DaimoPaymentResponse> {
  const { wallet_address, tokens } = merchant;

  const destinationAddress = wallet_address;
  const destinationChainId = Number(tokens.chain_id);
  const tokenAddress = tokens.token_address;

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
      display: {
        intent: merchant?.display_name || intent,
        orgLogo: merchant?.logo_url || 'https://www.rozo.ai/rozo-logo.png',
        items: [
          { name: isOrder ? 'Order Number' : 'Deposit Number', description: orderNumber },
          ...(description ? [{ name: 'Note', description }] : []),
        ],
        ...(redirect_uri ? { redirectUri: redirect_uri } : {}),
      },
      destination: {
        destinationAddress,
        tokenAddress,
        amountUnits: String(parseFloat(amountUnits).toFixed(2)),
        chainId: destinationChainId,
        calldata: '0x',
      },
      externalId: orderNumber,
      metadata: {
        merchantId: merchant?.merchant_id,
        isOrder: `${isOrder}`
      },
    };

    // Make API request to Daimo Pay
    const response = await fetch('https://pay.daimo.com/api/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
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
