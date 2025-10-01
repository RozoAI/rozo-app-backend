import Pusher from "npm:pusher";

/**
 * Simple function to trigger Pusher events
 * @param merchantId - The merchant's dynamic_id
 * @param eventType - Event name (e.g., 'payment_received', 'welcome')
 * @param data - Data to send
 * @returns Promise with success/error result
 */
export async function pushNotification(
  merchantId: string,
  eventType: string,
  data: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Basic env checks
    const appId = Deno.env.get("PUSHER_APP_ID");
    const key = Deno.env.get("PUSHER_KEY");
    const secret = Deno.env.get("PUSHER_SECRET");
    const cluster = Deno.env.get("PUSHER_CLUSTER");

    if (!appId || !key || !secret || !cluster) {
      return {
        success: false,
        error:
          "Missing Pusher env vars: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET",
      };
    }

    // Initialize Pusher
    const pusher = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });

    // Trigger event
    await pusher.trigger(merchantId, eventType, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
