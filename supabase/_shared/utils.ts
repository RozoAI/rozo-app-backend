import jwt, { JwtPayload } from 'npm:jsonwebtoken';
import { JwksClient } from 'npm:jwks-rsa';
import { PrivyClient } from "npm:@privy-io/server-auth";

interface AuthResult {
  success: boolean;
  payload?: JwtPayload;
  error?: string;
  embedded_wallet_address?: string | null;
}

interface VerifiedCredential {
  address?: string;
  wallet_provider: string;
  chain?: string;
  id: string;
  public_identifier: string;
  wallet_name?: string;
  format: string;
  signInEnabled: boolean;
}

interface DecodedJWT {
  verified_credentials?: VerifiedCredential[];
}

/**
 * Get embedded wallet address from JWT and get the ZeroDev address
 */
function getEmbeddedWalletAddress(decodedJWT: DecodedJWT): string | null {
  const embeddedWallet = decodedJWT.verified_credentials?.find(
    (credential: VerifiedCredential) =>
      credential.wallet_provider === "smartContractWallet",
  );

  return embeddedWallet?.address || null;
}

/**
 * Verify Dynamic JWT token
 * @param token - The JWT token to verify
 * @param dynamicEnvId - Your Dynamic environment ID
 * @param allowAdditionalAuth - Whether to allow tokens that require additional auth (default: false)
 * @returns Promise<AuthResult>
 */
export async function verifyDynamicJWT(
  token: string,
  dynamicEnvId: string,
  allowAdditionalAuth: boolean = false,
): Promise<AuthResult> {
  try {
    const jwksUrl =
      `https://app.dynamic.xyz/api/v0/sdk/${dynamicEnvId}/.well-known/jwks`;
    const client = new JwksClient({
      jwksUri: jwksUrl,
      rateLimit: true,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
    });

    // Get signing key and verify token
    const signingKey = await client.getSigningKey();
    const publicKey = signingKey.getPublicKey();

    const decodedToken = jwt.verify(token, publicKey, {
      ignoreExpiration: false,
    }) as JwtPayload;

    // Check for additional auth requirements
    if (
      decodedToken.scopes?.includes('requiresAdditionalAuth') &&
      !allowAdditionalAuth
    ) {
      return {
        success: false,
        error: 'Additional verification required',
      };
    }

    return {
      success: true,
      payload: decodedToken,
      embedded_wallet_address: getEmbeddedWalletAddress(decodedToken),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : 'Token verification failed',
    };
  }
}

// Helper function to extract merchant_id from JWT
export async function getDynamicIdFromJWT(token: string, dynamicEnvId: string) {
  const tokenVerification = await verifyDynamicJWT(token, dynamicEnvId);

  if (!tokenVerification.success) {
    return {
      success: false,
      error: tokenVerification.error,
    };
  }

  // Extract merchant_id from JWT payload (assuming it's stored in 'sub' or custom claim)
  const dynamicId = tokenVerification.payload.sub;
  if (!dynamicId) {
    return {
      success: false,
      error: 'Merchant ID not found in token',
    };
  }

  return {
    success: true,
    dynamicId,
  };
}

/**
 * Extract Bearer token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The token string or null if invalid
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify Privy JWT token
 * @param token - The JWT token to verify
 * @param appId - Your Privy app ID
 * @param appSecret - Your Privy app secret
 * @returns Promise<AuthResult>
 */
export async function verifyPrivyJWT(
  token: string,
  appId: string,
  appSecret: string,
): Promise<AuthResult> {
  try {
    const privy = new PrivyClient(
      appId as string,
      appSecret as string,
    );
    const verifiedClaims = await privy.verifyAuthToken(token);
    if (verifiedClaims.appId === appId) {
      const user = await privy.getUserById(verifiedClaims.userId);

      return {
        success: true,
        payload: user,
        embedded_wallet_address: user.wallet?.address || null,
      };
    }

    return {
      success: false,
      error: "Invalid Token or App ID",
    };
  } catch (error) {
    console.log("PRIVY ERROR:", error);
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : "Token verification failed",
    };
  }
}

/**
 * Performs dual authentication (Privy + Dynamic)
 * @param token - The JWT token to verify
 * @param dynamicEnvId - Dynamic environment ID
 * @param privyAppId - Privy app ID
 * @param privyAppSecret - Privy app secret
 * @returns Authentication result with user info
 */
export async function performDualAuth(
  token: string,
  dynamicEnvId: string,
  privyAppId: string,
  privyAppSecret: string,
): Promise<{
  success: boolean;
  userProviderId: string | null;
  userProviderWalletAddress: string | null;
  isPrivyAuth: boolean;
  error?: string;
}> {
  // Verify with Privy
  const privy = await verifyPrivyJWT(token, privyAppId, privyAppSecret);

  // Verify with Dynamic
  const tokenVerification = await verifyDynamicJWT(token, dynamicEnvId);
  
  // Both failed
  if (!tokenVerification.success && !privy.success) {
    return {
      success: false,
      userProviderId: null,
      userProviderWalletAddress: null,
      isPrivyAuth: false,
      error: "Invalid or expired token",
    };
  }

  let userProviderId = null;
  let userProviderWalletAddress = null;
  let isPrivyAuth = false;

  if (tokenVerification.success) {
    userProviderId = tokenVerification.payload.sub;
    userProviderWalletAddress = tokenVerification.embedded_wallet_address;
  }

  if (privy.success) {
    userProviderId = privy.payload?.id;
    userProviderWalletAddress = privy.embedded_wallet_address;
    isPrivyAuth = true;
  }

  if (!userProviderWalletAddress || !userProviderId) {
    return {
      success: false,
      userProviderId: null,
      userProviderWalletAddress: null,
      isPrivyAuth: false,
      error: "Missing embedded wallet address or user provider id",
    };
  }

  return {
    success: true,
    userProviderId,
    userProviderWalletAddress,
    isPrivyAuth,
  };
}

/**
 * Generates a human-readable order number using the current date (YYYYMMDD)
 * followed by 8 random digits (padded with leading zeros if necessary).
 *
 * Example: 2025062301234567
 *
 * @returns A 16-digit order number string.
 */
export function generateOrderNumber(): string {
  const now = new Date();

  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const datePart = `${year}${month}${day}`;

  // Generate 8-digit random number with padding
  const randomPart = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0');

  return `${datePart}${randomPart}`;
}

export type { AuthResult };
