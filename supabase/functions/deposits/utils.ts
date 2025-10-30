import { createDaimoPaymentLink } from "../../_shared/daimo-pay.ts";
import { generateOrderNumber, extractBearerToken } from "../../_shared/utils.ts";

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
        tokens!inner(chain_id, token_address),
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
        error: "Merchant not found or has no default token configured",
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

    const paymentResponse = await createDaimoPaymentLink({
      merchant,
      intent: "Deposit Payment",
      orderNumber: depositNumber,
      amountUnits: formattedUsdAmount.toString(),
      redirect_uri: depositData.redirect_uri,
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
      merchant_chain_id: merchant.tokens.chain_id,
      merchant_address: merchant.wallet_address,
      required_amount_usd: formattedUsdAmount,
      required_token: merchant.tokens.token_address,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
