import { generateAuthorizationSignature, PrivyClient } from "@privy-io/node";
import { Buffer } from "node:buffer";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  MemoType,
  Networks,
  Operation,
  // Server,
  Transaction,
  TransactionBuilder,
} from "stellar-sdk";

// --- CONSTANTS ---
export const HORIZON_PUBLIC_URL = "https://horizon.stellar.org";
export const USDC_ISSUER =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USDC_ASSET = new Asset("USDC", USDC_ISSUER);

// --- DEBUG HELPERS ---
function debugLog(step: string, data?: unknown): void {
  console.log(
    `🔍 [STELLAR] ${step}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
}

function debugError(step: string, error: unknown): void {
  console.error(`❌ [STELLAR] ${step}:`, error);
}

function debugSuccess(step: string, data?: unknown): void {
  console.log(
    `✅ [STELLAR] ${step}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
}

// Reusable Horizon server instance (MAINNET)
export function getMainnetServer(): Horizon.Server {
  debugLog("Creating Horizon mainnet server", { url: HORIZON_PUBLIC_URL });
  return new Horizon.Server(HORIZON_PUBLIC_URL);
}

export interface BuildTrustlineResult {
  xdr: string; // base64-encoded transaction envelope
  hashHex: string;
  tx: Transaction<Memo<MemoType>, Operation[]>;
}

/**
 * Build an unsigned Stellar transaction to add a USDC trustline on MAINNET.
 * The caller should sign the returned hash and then submit using submitSignedTrustlineTx.
 */
export async function buildUsdcTrustlineTx(
  publicKey: string,
): Promise<BuildTrustlineResult> {
  debugLog("Building USDC trustline transaction", { publicKey });
  const server = getMainnetServer();

  // Load latest account state (sequence number)
  const freshAccount = await server.loadAccount(publicKey);
  debugSuccess("Loaded account", {
    id: freshAccount.id,
    seq: freshAccount.sequence,
  });

  // Create changeTrust operation for USDC
  const changeTrustOp = Operation.changeTrust({ asset: USDC_ASSET });
  debugLog("Prepared changeTrust operation", {
    asset: "USDC",
    issuer: USDC_ISSUER,
  });

  // Build transaction
  const tx = new TransactionBuilder(freshAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(changeTrustOp)
    .setTimeout(300)
    .build();

  const xdr = tx.toXDR();
  const parsed = new Transaction(xdr, Networks.PUBLIC);
  const hashHex = Buffer.from(parsed.hash()).toString("hex");

  debugSuccess("Built trustline transaction", {
    xdrLength: xdr.length,
    hashHex,
  });

  return { xdr, hashHex: `0x${hashHex}`, tx };
}

export interface SubmitSignedTrustlineParams {
  token: string;
  walletId: string;
  signerPublicKey: string; // signer's public key (G...)
}

export interface SubmitTrustlineResult {
  successful: boolean;
  hash?: string;
  ledger?: number;
  alreadyExists?: boolean;
  errorMessage?: string;
  raw?: unknown;
}

/**
 * Apply a provided signature to the trustline transaction XDR and submit to MAINNET.
 */
export async function submitSignedTrustlineTx(
  params: SubmitSignedTrustlineParams,
): Promise<SubmitTrustlineResult> {
  debugLog("Submitting signed trustline transaction", {
    signer: params.signerPublicKey,
  });
  const server = getMainnetServer();

  // Build unsigned trustline tx
  const { xdr, hashHex, tx } = await buildUsdcTrustlineTx(
    params.signerPublicKey,
  );
  debugSuccess("Enable USDC - built trustline tx", {
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
      debugSuccess("Submitted trustline transaction", {
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
    const alreadyExists = isTrustlineAlreadyExists(result as unknown);
    if (alreadyExists) {
      debugSuccess("Trustline already exists");
    } else {
      debugError("Trustline submission failed", result);
    }
    return {
      successful: false,
      alreadyExists,
      errorMessage: getStellarErrorMessage(result as unknown),
      raw: result,
    };
  } catch (e) {
    // Submission threw (typical on Horizon errors)
    const errObj = e as { response?: { data?: unknown } } | unknown;
    const horizonError =
      (errObj as { response?: { data?: unknown } })?.response?.data ?? e;
    const alreadyExists = isTrustlineAlreadyExists(horizonError as unknown);
    if (alreadyExists) {
      debugSuccess("Trustline already exists (thrown error)");
    } else {
      debugError("Error submitting trustline transaction", horizonError);
    }
    return {
      successful: false,
      alreadyExists,
      errorMessage: getStellarErrorMessage(horizonError as unknown),
      raw: horizonError,
    };
  }
}

// --- ERROR HELPERS ---

/**
 * Detect if the error payload indicates the trustline already exists.
 */
export function isTrustlineAlreadyExists(data: unknown): boolean {
  try {
    const obj = data as Record<string, unknown>;
    const resultCodes = (obj as {
      result_codes?: { operations?: string[]; transaction?: string };
      extras?: {
        result_codes?: { operations?: string[]; transaction?: string };
      };
    })?.result_codes ?? (obj as {
      result_codes?: { operations?: string[]; transaction?: string };
      extras?: {
        result_codes?: { operations?: string[]; transaction?: string };
      };
    })?.extras?.result_codes as
      | { operations?: string[]; transaction?: string }
      | undefined;

    if (resultCodes?.operations && Array.isArray(resultCodes.operations)) {
      return resultCodes.operations.some((code) =>
        typeof code === "string" && code.includes("op_already_exists")
      );
    }

    // Fallback: scan known error strings
    const text = JSON.stringify(data);
    return text.includes("op_already_exists") ||
      text.includes("trustline exists");
  } catch (_) {
    return false;
  }
}

/**
 * Produce a user-friendly Stellar error message from Horizon response bodies.
 */
export function getStellarErrorMessage(data: unknown): string {
  try {
    const obj = data as Record<string, unknown>;
    const title = (obj?.title as string) || (obj as {
      extras?: { result_codes?: { transaction?: string } };
    })?.extras?.result_codes?.transaction;
    const detail = obj?.detail as string | undefined;
    const opCodes = (obj as {
      extras?: { result_codes?: { operations?: string[] } };
    })?.extras?.result_codes?.operations as string[] | undefined;

    if (isTrustlineAlreadyExists(data)) {
      return "USDC trustline already exists on the account";
    }

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
