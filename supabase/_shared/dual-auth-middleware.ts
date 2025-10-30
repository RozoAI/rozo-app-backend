import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Context, Next } from "jsr:@hono/hono";
import { PrivyClient } from "npm:@privy-io/server-auth";
import { Database } from '../../database.types.ts';
import { extractBearerToken } from "./utils.ts";

export const dualAuthMiddleware = async (c: Context, next: Next) => {
  const DYNAMIC_ENV_ID = Deno.env.get("DYNAMIC_ENV_ID")!;
  const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
  const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!DYNAMIC_ENV_ID || !PRIVY_APP_ID || !PRIVY_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: "Missing environment variables" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  const token = extractBearerToken(authHeader ?? null);

  if (!token) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  let userProviderId = null;
  let userProviderWalletAddress = null;
  let privySuccess = false;
  let dynamicSuccess = false;

  try {
    // Try Privy verification first
    try {
      const privy = new PrivyClient(
        PRIVY_APP_ID as string,
        PRIVY_APP_SECRET as string
      );
      
      const verifiedClaims = await privy.verifyAuthToken(token);
      if (verifiedClaims.appId === PRIVY_APP_ID) {
        const user = await privy.getUserById(verifiedClaims.userId);
        userProviderId = user.id;
        userProviderWalletAddress = user.wallet?.address || null;
        privySuccess = true;
        console.log("Privy authentication successful for user:", userProviderId);
      }
    } catch (privyError) {
      console.log("Privy verification failed:", privyError);
    }

    // If Privy failed, try Dynamic
    if (!privySuccess) {
      try {
        const { getDynamicIdFromJWT } = await import("./utils.ts");
        const dynamicIdRes = await getDynamicIdFromJWT(token, DYNAMIC_ENV_ID);
        
        if (dynamicIdRes.success) {
          userProviderId = dynamicIdRes.dynamicId;
          // For Dynamic, we'd need to get wallet address from the token payload
          dynamicSuccess = true;
          console.log("Dynamic authentication successful for user:", userProviderId);
        }
      } catch (dynamicError) {
        console.log("Dynamic verification failed:", dynamicError);
      }
    }

    // If both failed, return error
    if (!privySuccess && !dynamicSuccess) {
      return c.json({
        error: "Invalid or expired token",
        details: "Both Privy and Dynamic verification failed"
      }, 401);
    }

    if (!userProviderId) {
      return c.json({ error: "Failed to extract user provider ID" }, 401);
    }

    // Add authenticated data to context
    c.set("dynamicId", userProviderId); // Keep the key name for compatibility
    c.set("isPrivyAuth", privySuccess);
    c.set("supabase", createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));

  } catch (error) {
    console.error("Authentication middleware error:", error);
    return c.json({ error: "Authentication failed" }, 401);
  }

  await next();
};
