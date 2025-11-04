/**
 * Example usage of Firebase shared library for sending push notifications
 *
 * This file demonstrates how to use the Firebase utilities from other Edge Functions
 * to send push notifications to merchant devices.
 */

import { sendNotificationToDevice, sendNotificationToDevices } from './firebase.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Example 1: Send notification when a new order is created
async function notifyNewOrder(merchantId: string, orderId: string, orderNumber: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get all devices for this merchant
  const { data: devices, error } = await supabase
    .from('merchant_devices')
    .select('fcm_token')
    .eq('merchant_id', merchantId)

  if (error || !devices || devices.length === 0) {
    console.log('No devices found for merchant:', merchantId)
    return
  }

  const tokens = devices.map(d => d.fcm_token)

  try {
    // Send to all devices
    const result = await sendNotificationToDevices(
      tokens,
      'New Order Received',
      `Order #${orderNumber} has been placed`,
      {
        order_id: orderId,
        type: 'new_order',
        action: 'open_order'
      }
    )

    console.log(`Notification sent to ${result?.successCount} devices`)

    if (result?.failureCount > 0) {
      console.log(`Failed to send to ${result.failureCount} devices`)
    }
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

// Example 2: Send notification to a single specific device
async function notifySpecificDevice(fcmToken: string, title: string, message: string) {
  try {
    const messageId = await sendNotificationToDevice(
      fcmToken,
      title,
      message,
      { timestamp: new Date().toISOString() }
    )

    console.log('Notification sent, message ID:', messageId)
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

// Example 3: Send payment received notification
async function notifyPaymentReceived(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: devices } = await supabase
    .from('merchant_devices')
    .select('fcm_token')
    .eq('merchant_id', merchantId)

  if (!devices || devices.length === 0) return

  const tokens = devices.map(d => d.fcm_token)

  await sendNotificationToDevices(
    tokens,
    'Payment Received',
    `${amount} ${currency} payment received`,
    {
      order_id: orderId,
      type: 'payment_received',
      amount,
      currency,
      action: 'open_order'
    }
  )
}

// Example 4: Send order completed notification
async function notifyOrderCompleted(merchantId: string, orderId: string, orderNumber: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: devices } = await supabase
    .from('merchant_devices')
    .select('fcm_token')
    .eq('merchant_id', merchantId)

  if (!devices || devices.length === 0) return

  const tokens = devices.map(d => d.fcm_token)

  await sendNotificationToDevices(
    tokens,
    'Order Completed',
    `Order #${orderNumber} has been completed`,
    {
      order_id: orderId,
      type: 'order_completed',
      action: 'open_order_history'
    }
  )
}

// Example 5: How to use in an Edge Function
/**
 * Example Edge Function that sends notification on order creation
 * File: supabase/functions/order-webhook/index.ts
 */
/*
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendNotificationToDevices } from '../../_shared/firebase.ts'

serve(async (req) => {
  const { merchant_id, order_id, order_number } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get merchant devices
  const { data: devices } = await supabase
    .from('merchant_devices')
    .select('fcm_token')
    .eq('merchant_id', merchant_id)

  if (devices && devices.length > 0) {
    const tokens = devices.map(d => d.fcm_token)

    // Send notification
    await sendNotificationToDevices(
      tokens,
      'New Order',
      `Order #${order_number} received`,
      { order_id, type: 'new_order' }
    )
  }

  return new Response(JSON.stringify({ success: true }))
})
*/

// Export examples for reference
export {
  notifyNewOrder,
  notifySpecificDevice,
  notifyPaymentReceived,
  notifyOrderCompleted
}
