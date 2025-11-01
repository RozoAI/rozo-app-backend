import { generateAuthorizationSignature, PrivyClient } from "@privy-io/node";
import { Buffer } from "node:buffer";
import {
  BASE_FEE,
  Memo,
  MemoType,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "stellar-sdk";
import { getMainnetServer, USDC_ASSET, USDC_ISSUER } from "./trustline.ts";

// --- DEBUG HELPERS ---
function debugLog(step: string, data?: unknown): void {
  console.log(
    `🔍 [STELLAR_TRANSFER] ${step}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
}

function debugError(step: string, error: unknown): void {
  console.error(`❌ [STELLAR_TRANSFER] ${step}:`, error);
}

function debugSuccess(step: string, data?: unknown): void {
  console.log(
    `✅ [STELLAR_TRANSFER] ${step}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
}

export interface BuildPaymentResult {
  xdr: string; // base64-encoded transaction envelope
  hashHex: string;
  tx: Transaction<Memo<MemoType>, Operation[]>;
}

/**
 * Build an unsigned Stellar transaction to send USDC payment on MAINNET.
 * The caller should sign the returned hash and then submit using submitSignedPaymentTx.
 */
export async function buildUsdcPaymentTx(
  sourcePublicKey: string,
  destinationAddress: string,
  amount: string, // Amount in USDC (e.g., "10.5" for 10.5 USDC)
): Promise<BuildPaymentResult> {
  debugLog("Building USDC payment transaction", {
    sourcePublicKey,
    destinationAddress,
    amount,
  });

  // Validate destination address format (Stellar public key)
  if (!/^G[A-Z0-9]{55}$/.test(destinationAddress)) {
    throw new Error("Invalid destination address format");
  }

  // Validate amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new Error("Amount must be a positive number");
  }

  const server = getMainnetServer();

  // Load latest account state (sequence number)
  const freshAccount = await server.loadAccount(sourcePublicKey);
  debugSuccess("Loaded source account", {
    id: freshAccount.id,
    seq: freshAccount.sequence,
  });

  // Create payment operation for USDC
  // Amount is in the smallest unit (for USDC with 7 decimals on Stellar, but typically we use standard amount)
  // Stellar amounts are strings representing the number of stroops
  // For assets, the amount is the number of asset units (not stroops)
  const paymentOp = Operation.payment({
    destination: destinationAddress,
    asset: USDC_ASSET,
    amount: amount, // Amount in USDC units (e.g., "10.5")
  });

  debugLog("Prepared payment operation", {
    destination: destinationAddress,
    asset: "USDC",
    issuer: USDC_ISSUER,
    amount,
  });

  // Build transaction
  const tx = new TransactionBuilder(freshAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(paymentOp)
    .setTimeout(300)
    .build();

  const xdr = tx.toXDR();
  const parsed = new Transaction(xdr, Networks.PUBLIC);
  const hashHex = Buffer.from(parsed.hash()).toString("hex");

  debugSuccess("Built payment transaction", {
    xdrLength: xdr.length,
    hashHex,
  });

  return { xdr, hashHex: `0x${hashHex}`, tx };
}

export interface SubmitSignedPaymentParams {
  token: string;
  walletId: string;
  signerPublicKey: string; // signer's public key (G...)
  destinationAddress: string;
  amount: string; // Amount in USDC (e.g., "10.5")
}

export interface SubmitPaymentResult {
  successful: boolean;
  hash?: string;
  ledger?: number;
  errorMessage?: string;
  raw?: unknown;
}

/**
 * Build, sign, and submit a USDC payment transaction to MAINNET.
 */
export async function submitSignedPaymentTx(
  params: SubmitSignedPaymentParams,
): Promise<SubmitPaymentResult> {
  debugLog("Submitting signed payment transaction", {
    signer: params.signerPublicKey,
    destination: params.destinationAddress,
    amount: params.amount,
  });

  const server = getMainnetServer();

  // Build unsigned payment tx
  const { xdr, hashHex, tx } = await buildUsdcPaymentTx(
    params.signerPublicKey,
    params.destinationAddress,
    params.amount,
  );

  debugSuccess("Built payment tx", {
    xdr: xdr,
    hash: hashHex,
  });

  const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID") as string;
  const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;

  const authorizationPrivateKey = Deno.env.get(
    "PRIVY_AUTHORIZATION_PRIVATE_KEY",
  ) as string;

  // Sign raw hash with Privy REST API
  const walletRawSignUrl =
    `https://api.privy.io/v1/wallets/${params.walletId}/raw_sign`;
  const signaturePayload = {
    version: 1,
    url: walletRawSignUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": PRIVY_APP_ID,
    },
    body: {
      params: {
        hash: hashHex,
      },
    },
  } as const;

  const signKey = generateAuthorizationSignature({
    input: signaturePayload,
    authorizationPrivateKey: authorizationPrivateKey,
  });

  const privy = new PrivyClient({
    appId: PRIVY_APP_ID,
    appSecret: PRIVY_APP_SECRET,
  });

  const { signature } = await privy.wallets().rawSign(
    params.walletId,
    {
      params: {
        hash: hashHex,
      },
      authorization_context: {
        user_jwts: [params.token],
        signatures: [signKey],
        authorization_private_keys: [authorizationPrivateKey],
      },
    },
  );

  const signatureBuffer = Buffer.from(signature.replace("0x", ""), "hex");
  tx.addSignature(params.signerPublicKey, signatureBuffer.toString("base64"));

  try {
    const result: unknown = await server.submitTransaction(tx);
    const res = result as {
      successful?: boolean;
      hash?: string;
      ledger?: number;
    };

    if (res.successful) {
      debugSuccess("Submitted payment transaction", {
        hash: res.hash,
        ledger: res.ledger,
      });
      return {
        successful: true,
        hash: res.hash,
        ledger: res.ledger,
        raw: result,
      };
    }

    // Non-successful but returned with details
    debugError("Payment submission failed", result);
    return {
      successful: false,
      errorMessage: getStellarErrorMessage(result as unknown),
      raw: result,
    };
  } catch (e) {
    // Submission threw (typical on Horizon errors)
    const errObj = e as { response?: { data?: unknown } } | unknown;
    const horizonError =
      (errObj as { response?: { data?: unknown } })?.response?.data ?? e;
    debugError("Error submitting payment transaction", horizonError);
    return {
      successful: false,
      errorMessage: getStellarErrorMessage(horizonError as unknown),
      raw: horizonError,
    };
  }
}

// --- ERROR HELPERS ---

/**
 * Produce a user-friendly Stellar error message from Horizon response bodies.
 */
function getStellarErrorMessage(data: unknown): string {
  try {
    const obj = data as Record<string, unknown>;
    const title = (obj?.title as string) || (obj as {
      extras?: { result_codes?: { transaction?: string } };
    })?.extras?.result_codes?.transaction;
    const detail = obj?.detail as string | undefined;
    const opCodes = (obj as {
      extras?: { result_codes?: { operations?: string[] } };
    })?.extras?.result_codes?.operations as string[] | undefined;

    if (opCodes && opCodes.length > 0) {
      return `Stellar error: ${opCodes.join(", ")}`;
    }

    if (title || detail) {
      return `Stellar error: ${[title, detail].filter(Boolean).join(" - ")}`;
    }

    return "Failed to submit transaction to Stellar";
  } catch (_) {
    return "Failed to submit transaction to Stellar";
  }
}
