import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Context, Next } from "jsr:@hono/hono";
import { Database } from '../../database.types.ts';
import { extractBearerToken, getDynamicIdFromJWT } from "./utils.ts";

export const dynamicAuthMiddleware = async (c: Context, next: Next) => {
  const DYNAMIC_ENV_ID = Deno.env.get("DYNAMIC_ENV_ID")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!DYNAMIC_ENV_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: "Missing environment variables" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  const token = extractBearerToken(authHeader ?? null);

  if (!token) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const dynamicIdRes = await getDynamicIdFromJWT(token, DYNAMIC_ENV_ID);
  if (!dynamicIdRes.success) {
    return c.json(
      {
        error: "Invalid or expired token",
        details: dynamicIdRes.error,
      },
      401
    );
  }

  // Add authenticated data to context
  c.set("dynamicId", dynamicIdRes.dynamicId);
  c.set("supabase", createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));

  await next();
};
