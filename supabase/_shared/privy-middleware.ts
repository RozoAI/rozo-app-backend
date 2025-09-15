import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Context, Next } from "jsr:@hono/hono";
import { PrivyClient } from "npm:@privy-io/server-auth";
import { Database } from '../../database.types.ts';
import { extractBearerToken } from "./utils.ts";

export const privyAuthMiddleware = async (c: Context, next: Next) => {
  const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
  const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: "Missing environment variables" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  const token = extractBearerToken(authHeader ?? null);

  if (!token) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  try {
    const privy = new PrivyClient(
      PRIVY_APP_ID as string,
      PRIVY_APP_SECRET as string
    );
    const verifiedClaims = await privy.verifyAuthToken(token);
    console.log({ verifiedClaims })
  } catch (error) {
    console.error(error);
  }

  // Add authenticated data to context
  // c.set("dynamicId", dynamicIdRes.dynamicId);
  c.set("supabase", createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));

  await next();
};
