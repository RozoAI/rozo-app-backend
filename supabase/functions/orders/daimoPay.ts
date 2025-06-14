interface DaimoPaymentResponse {
  success: boolean;
  paymentDetail: any;
  error?: string;
}

/**
 * @param intent - Purpose of the payment (e.g., "Pay Order", "Purchase", "Deposit")
 * @param destinationAddress - Recipient wallet address
 * @param destinationChainId - Destination chain ID (10=Optimism, 8453=Base, 137=Polygon, 42161=Arbitrum)
 * @param tokenAddress - Token contract address (use "0x0000000000000000000000000000000000000000" for native)
 * @param amountUnits - Amount to receive as string (e.g., "1.00", "10.50")
 * @returns Payment link URL and payment ID
 */
export async function createDaimoPaymentLink(
  intent: string,
  destinationAddress: string,
  destinationChainId: number,
  tokenAddress: string,
  amountUnits: string,
): Promise<DaimoPaymentResponse> {
  try {
    // Get API key from environment variables
    const apiKey = Deno.env.get("DAIMO_API_KEY");
    if (!apiKey) {
      return {
        success: false,
        paymentDetail: {},
        error: "DAIMO_API_KEY environment variable is not set",
      };
    }

    // Validate required parameters
    if (
      !intent || !destinationAddress || !destinationChainId || !tokenAddress ||
      !amountUnits
    ) {
      return {
        success: false,
        paymentDetail: {},
        error: "Missing required parameters for Creating paymentLink",
      };
    }

    // Validate amount format
    if (isNaN(parseFloat(amountUnits)) || parseFloat(amountUnits) <= 0) {
      return {
        success: false,
        paymentDetail : {},
        error: "amountUnits must be a valid positive number",
      };
    }

    // Construct payment request
    const paymentRequest = {
      display: {
        intent: intent,
      },
      destination: {
        destinationAddress: destinationAddress,
        chainId: destinationChainId,
        tokenAddress: tokenAddress,
        amountUnits: amountUnits,
        calldata: "0x",
      },
    };

    // Make API request to Daimo Pay
    const response = await fetch("https://pay.daimo.com/api/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify(paymentRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        paymentDetail : {},
        error: `Daimo API Error ${response.status}: ${errorText}`,
      };
    }

    const paymentDetail = await response.json();

    return {
      success: true,
      paymentDetail: paymentDetail
    };
  } catch (error) {
    return {
      success: false,
      paymentDetail: {},
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
