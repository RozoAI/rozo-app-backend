import { createDaimoPaymentLink } from "../../_shared/daimo-pay.ts";
import { generateOrderNumber } from "../../_shared/utils.ts";

export interface CreateDepositRequest {
  display_amount: number;
  display_currency: string;
  redirect_uri?: string;
}

export interface Deposit {
  deposit_id?: string;
  merchant_id: string;
  payment_id: string;
  merchant_chain_id: number;
  merchant_address: string;
  required_amount_usd: number;
  required_token: string;
  display_amount: number;
  display_currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  number: string;
}

export async function createDeposit(
  supabase: any,
  userProviderId: string,
  isPrivyAuth: boolean,
  depositData: CreateDepositRequest,
) {
  try {
    // First, verify if merchant exists and get token info
    const merchantQuery = supabase
      .from("merchants")
      .select(
        `
        merchant_id,
        dynamic_id,
        privy_id,
        wallet_address,
        default_token_id,
        stellar_address,
        logo_url
      `,
      );

    // Use appropriate column based on auth provider
    const { data: merchant, error: merchantError } = isPrivyAuth
      ? await merchantQuery.eq("privy_id", userProviderId).single()
      : await merchantQuery.eq("dynamic_id", userProviderId).single();

    if (merchantError || !merchant) {
      return {
        success: false,
        error: "Merchant not found",
      };
    }

    // Validate default_token_id
    if (!merchant.default_token_id) {
      return {
        success: false,
        error: "Merchant's default_token_id is not set",
      };
    }

    // Trim whitespace from token_id (in case of data issues)
    const tokenId = String(merchant.default_token_id).trim();

    if (!tokenId) {
      return {
        success: false,
        error: "Merchant's default_token_id is empty after trimming",
      };
    }

    // Fetch default token
    const { data: defaultToken, error: tokenError } = await supabase
      .from("tokens")
      .select("*")
      .eq("token_id", tokenId)
      .single();

    if (tokenError || !defaultToken) {
      console.error("Token query error:", {
        tokenId,
        error: tokenError,
        merchantDefaultTokenId: merchant.default_token_id,
      });
      return {
        success: false,
        error: `Merchant's default token not found: ${tokenId}${
          tokenError ? ` (${tokenError.message})` : ""
        }`,
      };
    }

    // Skip currency conversion if currency is USD
    let required_amount_usd = depositData.display_amount;
    if (depositData.display_currency !== "USD") {
      const { data: currency, error } = await supabase
        .from("currencies")
        .select("usd_price")
        .eq("currency_id", depositData.display_currency)
        .single();

      if (error || !currency) {
        return {
          success: false,
          error: "Currency not found",
        };
      }
      required_amount_usd = currency.usd_price * depositData.display_amount;
    }

    if (required_amount_usd < 0.1) {
      return {
        success: false,
        error: "Cannot create deposit with amount less than 0.1",
      };
    }

    const formattedUsdAmount = parseFloat(required_amount_usd.toFixed(2));
    const depositNumber = generateOrderNumber();
    console.log("[DEPOSIT] Creating deposit with number:", depositNumber);
    console.log("[DEPOSIT] Merchant:", merchant);
    console.log("[DEPOSIT] Default token:", defaultToken);
    console.log("[DEPOSIT] Formatted USD amount:", formattedUsdAmount);
    console.log("[DEPOSIT] Deposit data:", depositData);
    console.log("[DEPOSIT] Redirect URI:", depositData.redirect_uri);
    console.log("[DEPOSIT] Destination token:", defaultToken);
    console.log("[DEPOSIT] Preferred token:", defaultToken);
    console.log("[DEPOSIT] Is order:", false);
    console.log("[DEPOSIT] Default token ID:", merchant.default_token_id);
    const destinationAddress = merchant.default_token_id === "USDC_XLM"
      ? merchant.stellar_address
      : merchant.wallet_address;
    console.log("[DEPOSIT] Destination address:", destinationAddress);

    if (!destinationAddress) {
      return {
        success: false,
        error: "Destination address not found",
      };
    }

    const paymentResponse = await createDaimoPaymentLink({
      destinationAddress,
      intent: "Deposit Payment",
      orderNumber: depositNumber,
      amountUnits: formattedUsdAmount.toString(),
      redirect_uri: depositData.redirect_uri,
      destinationToken: defaultToken,
      preferredToken: defaultToken, // For deposits, both are the same (merchant's default)
      isOrder: false,
    });

    if (!paymentResponse.success || !paymentResponse.paymentDetail) {
      return {
        success: false,
        error: paymentResponse.error || "Payment detail is missing",
      };
    }

    // Create the deposit with required_token from merchant's default token
    const { redirect_uri: _redirect_uri, ...rest } = depositData;
    const depositToInsert: Deposit = {
      ...rest,
      merchant_id: merchant.merchant_id,
      payment_id: paymentResponse.paymentDetail.id,
      merchant_chain_id: defaultToken.chain_id,
      merchant_address: destinationAddress,
      required_amount_usd: formattedUsdAmount,
      required_token: defaultToken.token_address,
      status: "PENDING",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      number: depositNumber,
    };

    const { data: deposit, error: depositError } = await supabase
      .from("deposits")
      .insert(depositToInsert)
      .select()
      .single();

    if (depositError) {
      return {
        success: false,
        error: depositError.message,
      };
    }

    return {
      success: true,
      paymentDetail: paymentResponse.paymentDetail,
      deposit_id: deposit.deposit_id,
    };
  } catch (error) {
    console.error("[DEPOSIT] Error creating deposit:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
