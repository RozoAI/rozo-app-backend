import { initializeApp, cert, getApps, App, ServiceAccount } from 'npm:firebase-admin@12.0.0/app'
import { getMessaging, Message, MulticastMessage } from 'npm:firebase-admin@12.0.0/messaging'

let firebaseApp: App | null = null

/**
 * Initialize Firebase Admin SDK (singleton pattern)
 * Reuses existing app instance if already initialized
 *
 * Two initialization methods supported:
 * 1. JSON file (recommended): Place service account JSON in supabase/_shared/firebase-service-account.json
 * 2. Environment variables: Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
export function initFirebase(): App {
  if (firebaseApp && getApps().length > 0) {
    return firebaseApp
  }

  // Method 1: Try to load from JSON file (recommended)
  try {
    const serviceAccountPath = new URL('./firebase-service-account.json', import.meta.url).pathname
    const serviceAccount = JSON.parse(Deno.readTextFileSync(serviceAccountPath)) as ServiceAccount

    firebaseApp = initializeApp({
      credential: cert(serviceAccount)
    })

    console.log('Firebase initialized from JSON file')
    return firebaseApp
  } catch (error) {
    console.log('Firebase JSON file not found, trying environment variables...')
  }

  // Method 2: Fall back to environment variables
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase configuration. Either:\n' +
      '1. Place firebase-service-account.json in supabase/_shared/, OR\n' +
      '2. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY environment variables'
    )
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    })
  })

  console.log('Firebase initialized from environment variables')
  return firebaseApp
}

/**
 * Send push notification to a single device
 *
 * @param fcmToken - Firebase Cloud Messaging token
 * @param title - Notification title
 * @param body - Notification body text
 * @param data - Optional additional data payload
 * @returns Message ID from Firebase
 *
 * @example
 * await sendNotificationToDevice(
 *   'device-token',
 *   'New Order',
 *   'You received order #12345',
 *   { order_id: '12345', type: 'new_order' }
 * )
 */
export async function sendNotificationToDevice(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<string> {
  const messaging = getMessaging(initFirebase())

  const message: Message = {
    token: fcmToken,
    notification: {
      title,
      body
    },
    data: data || {},
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default'
      }
    }
  }

  return await messaging.send(message)
}

/**
 * Send push notification to multiple devices (batch operation)
 * More efficient than sending individual notifications
 *
 * @param fcmTokens - Array of FCM tokens
 * @param title - Notification title
 * @param body - Notification body text
 * @param data - Optional additional data payload
 * @returns Batch response with success/failure counts
 *
 * @example
 * const tokens = ['token1', 'token2', 'token3']
 * const result = await sendNotificationToDevices(
 *   tokens,
 *   'New Order',
 *   'Order #12345',
 *   { order_id: '12345' }
 * )
 * console.log(`Sent to ${result.successCount} devices`)
 */
export async function sendNotificationToDevices(
  fcmTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) {
  if (fcmTokens.length === 0) {
    return null
  }

  const messaging = getMessaging(initFirebase())

  const message: MulticastMessage = {
    tokens: fcmTokens,
    notification: {
      title,
      body
    },
    data: data || {},
    apns: {
      payload: {
        aps: {
          alert: {
              title: title,
              body: body
          },
          sound: 'default',
          badge: 1
        }
      },
      headers: {
        "apns-priority": "10"
      }
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: "rozo-notifications"
      }
    }
  }

  return await messaging.sendEachForMulticast(message)
}
