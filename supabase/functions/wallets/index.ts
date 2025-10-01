import { Context, Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import { PrivyClient } from "@privy-io/node";
import { Buffer } from "node:buffer";
import { webcrypto as crypto } from "node:crypto";
import { encodeFunctionData, erc20Abi } from "viem";
import { dualAuthMiddleware } from "../../_shared/dual-auth-middleware.ts";
import { extractBearerToken } from "../../_shared/utils.ts";

const functionName = "wallets";
const app = new Hono().basePath(`/${functionName}`);
const { subtle } = crypto;

// --- TYPE DEFINITIONS ---
interface AuthResponse {
  encrypted_authorization_key?: {
    encapsulated_key: string;
    ciphertext: string;
  };
}

interface WalletResponse {
  id: string;
  address: string;
  chain_type: string;
  policy_ids: string[];
  additional_signers: string[];
  owner_id: string;
  created_at: number;
  exported_at: string | null;
  imported_at: string | null;
}

interface TransactionConfig {
  recipientAddress: string;
  amountToSend: number;
  decimals: number;
  usdcContractAddress: string;
  chainId: string;
  policyId: string;
  authorizationPrivateKey: string;
}

interface TransactionRequest {
  recipientAddress: string;
  amount: number;
}

interface TransactionResult {
  hash: string;
  caip2: string;
  walletId: string;
}

// --- CONSTANTS ---
const DEFAULT_TRANSACTION_CONFIG: Omit<
  TransactionConfig,
  "recipientAddress" | "amountToSend"
> = {
  decimals: 6, // USDC has 6 decimals
  usdcContractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  chainId: "0x2105", // 8453
  policyId: Deno.env.get("PRIVY_POLICY_ID") as string, // Policy for All Rules
  authorizationPrivateKey: Deno.env.get(
    "PRIVY_AUTHORIZATION_PRIVATE_KEY",
  ) as string,
};

// --- DEBUGGING UTILITIES ---
function debugLog(step: string, data?: unknown): void {
  console.log(`🔍 [DEBUG] ${step}`, data ? JSON.stringify(data, null, 2) : "");
}

function debugError(step: string, error: unknown): void {
  console.error(`❌ [ERROR] ${step}:`, error);
}

function debugSuccess(step: string, data?: unknown): void {
  console.log(
    `✅ [SUCCESS] ${step}`,
    data ? JSON.stringify(data, null, 2) : "",
  );
}

// --- UTILITY FUNCTIONS ---

function generateBasicAuthHeader(username: string, password: string): string {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

/** Converts an ArrayBuffer to a Uint8Array. */
function abToBytes(ab: ArrayBuffer): Uint8Array {
  return new Uint8Array(ab);
}

/** Converts a Uint8Array to a Base64 encoded string. */
function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Converts a Base64 encoded string to a Uint8Array. */
function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Creates a Basic Authentication header value. */
function basicAuth(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

/** Generates an ECDH P-256 keypair for HPKE. */
async function generateP256ECDH(): Promise<{
  spki: Uint8Array;
  pkcs8: Uint8Array;
}> {
  const keyPair = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const spkiAb = await subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8Ab = await subtle.exportKey("pkcs8", keyPair.privateKey);

  return { spki: abToBytes(spkiAb), pkcs8: abToBytes(pkcs8Ab) };
}

/** Decrypts the authorization key from Privy using HPKE. */
async function decryptAuthorizationKey(
  pkcs8B64: string,
  encB64: string,
  ctB64: string,
): Promise<string> {
  const suite = new CipherSuite({
    kem: new DhkemP256HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Chacha20Poly1305(),
  });

  const privateKey = await subtle.importKey(
    "pkcs8",
    b64ToBytes(pkcs8B64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: b64ToBytes(encB64).buffer as ArrayBuffer,
  });

  const plaintextAb = await recipient.open(
    b64ToBytes(ctB64).buffer as ArrayBuffer,
  );

  // The decrypted plaintext is the base64 representation of the DER-encoded key
  const base64DerKey = Buffer.from(plaintextAb).toString("utf8");

  // Format the base64 DER key into a standard PEM format
  return base64DerKey;
}

async function checkIfWalletHasOwner(
  walletId: string,
): Promise<WalletResponse> {
  try {
    debugLog("Checking wallet owner", { walletId });

    const res = await fetch(`https://api.privy.io/v1/wallets/${walletId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": Deno.env.get("PRIVY_APP_ID") as string,
        Authorization: generateBasicAuthHeader(
          Deno.env.get("PRIVY_APP_ID") as string,
          Deno.env.get("PRIVY_APP_SECRET") as string,
        ),
      },
    });

    if (!res.ok) {
      const errorData = await res.json();
      debugError("Failed to fetch wallet owner", errorData);
      throw new Error(
        `Failed to fetch wallet owner: ${JSON.stringify(errorData)}`,
      );
    }

    const response = await res.json();
    debugSuccess("Wallet owner retrieved", { ownerId: response.owner_id });
    return response;
  } catch (e) {
    debugError("Checking wallet owner failed", e);
    throw new Error(
      `Checking wallet owner failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

// --- TRANSACTION HELPER FUNCTIONS ---

function validateTransactionRequestBody(body: unknown): TransactionRequest {
  debugLog("Validating transaction request body", body);

  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object");
  }

  const request = body as Record<string, unknown>;

  if (
    !request.recipientAddress || typeof request.recipientAddress !== "string"
  ) {
    throw new Error("recipientAddress is required and must be a string");
  }

  if (
    !request.amount || typeof request.amount !== "number" || request.amount <= 0
  ) {
    throw new Error("amount is required and must be a positive number");
  }

  // Basic Ethereum address validation
  if (!/^0x[a-fA-F0-9]{40}$/.test(request.recipientAddress)) {
    throw new Error("recipientAddress must be a valid Ethereum address");
  }

  const validatedRequest: TransactionRequest = {
    recipientAddress: request.recipientAddress,
    amount: request.amount,
  };

  debugSuccess("Transaction request body validated", validatedRequest);
  return validatedRequest;
}

function createTransactionConfig(
  request: TransactionRequest,
): TransactionConfig {
  debugLog("Creating transaction config", request);

  const config: TransactionConfig = {
    ...DEFAULT_TRANSACTION_CONFIG,
    recipientAddress: request.recipientAddress,
    amountToSend: request.amount,
  };

  debugSuccess("Transaction config created", config);
  return config;
}

async function validateTransactionRequest(
  authHeader: string | null,
  walletId: string,
): Promise<{ token: string; walletOwner: WalletResponse }> {
  debugLog("Validating transaction request", { walletId });

  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new Error("Missing or invalid authorization header");
  }

  const walletOwner = await checkIfWalletHasOwner(walletId);
  if (!walletOwner.owner_id) {
    throw new Error("Wallet does not have an owner");
  }

  debugSuccess("Transaction request validated", {
    walletId,
    ownerId: walletOwner.owner_id,
  });

  return { token, walletOwner };
}

async function signMessageForWallet(
  privy: PrivyClient,
  walletId: string,
  token: string,
  config: TransactionConfig,
): Promise<string> {
  debugLog("Signing message for wallet", { walletId });

  const message =
    `Transfer ${config.amountToSend} USDC to ${config.recipientAddress}`;

  const response = await privy
    .wallets()
    .ethereum()
    .signMessage(walletId, {
      message,
      authorization_context: {
        user_jwts: [token],
      },
    });

  debugSuccess("Message signed", { signature: response.signature });
  return response.signature;
}

async function updateWalletWithPolicy(
  privy: PrivyClient,
  walletId: string,
  token: string,
  signature: string,
  ownerId: string,
  policyId: string,
): Promise<void> {
  debugLog("Updating wallet with policy", { walletId, ownerId, policyId });

  const res = await privy.wallets().update(walletId, {
    authorization_context: {
      user_jwts: [token],
      signatures: [signature],
    },
    owner_id: ownerId,
    policy_ids: [policyId],
  });

  debugSuccess("Wallet updated with policy", res);
}

function encodeTransferData(config: TransactionConfig): string {
  debugLog("Encoding transfer data", {
    recipient: config.recipientAddress,
    amount: config.amountToSend,
    decimals: config.decimals,
  });

  const encodedData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [
      config.recipientAddress as `0x${string}`,
      BigInt(config.amountToSend * 10 ** config.decimals),
    ],
  });

  debugSuccess("Transfer data encoded", { encodedData });
  return encodedData;
}

async function sendTransaction(
  privy: PrivyClient,
  walletId: string,
  token: string,
  signature: string,
  config: TransactionConfig,
  encodedData: string,
): Promise<TransactionResult> {
  debugLog("Sending transaction", {
    walletId,
    contractAddress: config.usdcContractAddress,
  });

  const { hash, caip2 } = await privy.wallets().ethereum().sendTransaction(
    walletId,
    {
      caip2: "eip155:8453",
      sponsor: true,
      authorization_context: {
        user_jwts: [token],
        signatures: [signature],
        authorization_private_keys: [config.authorizationPrivateKey],
      },
      params: {
        transaction: {
          to: config.usdcContractAddress,
          data: encodedData,
          chain_id: config.chainId,
        },
      },
    },
  );

  const result: TransactionResult = { hash, caip2, walletId };
  debugSuccess("Transaction sent", result);

  return result;
}

// --- MAIN TRANSACTION HANDLER ---
async function handleTransactions(c: Context, walletId: string) {
  debugLog("Starting transaction process", { walletId });

  try {
    // Step 1: Parse and validate request body
    const requestBody = await c.req.json();
    const transactionRequest = validateTransactionRequestBody(requestBody);
    const transactionConfig = createTransactionConfig(transactionRequest);

    // Step 2: Validate request and get wallet owner
    const authHeader = c.req.header("Authorization");
    const { token, walletOwner } = await validateTransactionRequest(
      authHeader ?? null,
      walletId,
    );

    // Step 3: Initialize Privy client
    const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
    const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;

    const privy = new PrivyClient({
      appId: PRIVY_APP_ID,
      appSecret: PRIVY_APP_SECRET,
    });

    // Step 4: Sign message for wallet authorization
    const signature = await signMessageForWallet(
      privy,
      walletId,
      token,
      transactionConfig,
    );

    // Step 5: Update wallet with policy
    await updateWalletWithPolicy(
      privy,
      walletId,
      token,
      signature,
      walletOwner.owner_id,
      transactionConfig.policyId,
    );

    // Step 6: Encode transfer data
    const encodedData = encodeTransferData(transactionConfig);

    // Step 7: Send transaction
    const transactionResult = await sendTransaction(
      privy,
      walletId,
      token,
      signature,
      transactionConfig,
      encodedData,
    );

    debugSuccess("Transaction completed successfully", transactionResult);

    return c.json({
      success: true,
      transaction: transactionResult,
      walletId: walletId,
      recipientAddress: transactionConfig.recipientAddress,
      amount: transactionConfig.amountToSend,
    });
  } catch (error) {
    debugError("Transaction failed", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";

    return c.json({
      error: "Failed to process wallet transaction",
      details: errorMessage,
    }, 500);
  }
}

// Configure CORS
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
  }),
);

app.options("*", (c) => c.text("ok"));

// Set Middleware
app.use(dualAuthMiddleware);

// Routes
app.post(
  "/:walletId",
  (c) => {
    if (!Deno.env.get("PRIVY_POLICY_ID")) {
      return c.json(
        { error: `Missing environment variables: PRIVY_POLICY_ID` },
        500,
      );
    }

    if (!Deno.env.get("PRIVY_AUTHORIZATION_PRIVATE_KEY")) {
      return c.json({
        error: `Missing environment variables: PRIVY_AUTHORIZATION_PRIVATE_KEY`,
      }, 500);
    }

    return handleTransactions(c, c.req.param("walletId"));
  },
);
Deno.serve(app.fetch);
