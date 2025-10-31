# Push Notifications Setup Guide

Quick guide to deploy and test the push notification system.

## Prerequisites

- Supabase CLI installed
- Firebase project created
- Service account key from Firebase

---

## Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file (e.g., `your-project-firebase-adminsdk-xxxxx.json`)

---

## Step 2: Configure Firebase (Choose One Method)

### Method 1: JSON File (Recommended - Easier)

```bash
# Copy the downloaded JSON file to the _shared folder
cp ~/Downloads/your-project-firebase-adminsdk-xxxxx.json \
   supabase/_shared/firebase-service-account.json

# Verify it's there
cat supabase/_shared/firebase-service-account.json
```

**Important:** Make sure `firebase-service-account.json` is in `.gitignore`!

### Method 2: Environment Variables (Alternative)

If you prefer environment variables:

```bash
# Extract values from the JSON file and set as secrets
supabase secrets set FIREBASE_PROJECT_ID="your-project-id"
supabase secrets set FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@xxx.iam.gserviceaccount.com"
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```

**Note:** The Firebase library will try JSON file first, then fall back to environment variables.

---

## Step 3: Deploy Edge Function

```bash
# Deploy the devices function
supabase functions deploy devices

# Verify deployment
supabase functions list
```

---

## Step 4: Run Database Migration

```bash
# Apply the migration
supabase db push

# Or if using migrations folder
supabase migration up
```

Verify the table was created:
```sql
SELECT * FROM merchant_devices LIMIT 1;
```

---

## Step 5: Test Device Registration

### Using curl

```bash
# Replace with your actual JWT token and Supabase URL
curl -X POST https://your-project.supabase.co/functions/v1/devices/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "fcm_token": "test-fcm-token-12345",
    "platform": "ios"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "merchant_id": "merchant-uuid",
    "device_id": "test-device-001",
    "fcm_token": "test-fcm-token-12345",
    "platform": "ios",
    "created_at": "2025-10-31T...",
    "updated_at": "2025-10-31T..."
  },
  "message": "Device registered successfully"
}
```

### Using JavaScript

```typescript
const response = await fetch('https://your-project.supabase.co/functions/v1/devices/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    device_id: 'test-device-001',
    fcm_token: 'test-fcm-token-12345',
    platform: 'ios'
  })
})

const data = await response.json()
console.log(data)
```

---

## Step 6: Test Sending Notification

Create a test Edge Function or use Deno Deploy playground:

```typescript
import { sendNotificationToDevice } from './supabase/_shared/firebase.ts'

// Test sending to a real FCM token
const messageId = await sendNotificationToDevice(
  'your-real-fcm-token',
  'Test Notification',
  'This is a test message from Rozo',
  { test: 'true' }
)

console.log('Message sent:', messageId)
```

---

## Step 7: Verify in Database

```sql
-- Check registered devices
SELECT
  d.device_id,
  d.platform,
  d.created_at,
  m.email,
  m.display_name
FROM merchant_devices d
JOIN merchants m ON d.merchant_id = m.merchant_id
ORDER BY d.created_at DESC;

-- Count devices per merchant
SELECT
  m.email,
  COUNT(d.id) as device_count
FROM merchants m
LEFT JOIN merchant_devices d ON m.merchant_id = d.merchant_id
GROUP BY m.merchant_id, m.email
ORDER BY device_count DESC;
```

---

## Step 8: Integrate with Order Flow

Example: Send notification when order is created

```typescript
// In your order creation Edge Function
import { sendNotificationToDevices } from '../../_shared/firebase.ts'

// After order is created successfully
const { data: devices } = await supabase
  .from('merchant_devices')
  .select('fcm_token')
  .eq('merchant_id', merchantId)

if (devices && devices.length > 0) {
  const tokens = devices.map(d => d.fcm_token)

  await sendNotificationToDevices(
    tokens,
    'New Order Received',
    `Order #${orderNumber} has been placed for ${amount} ${currency}`,
    {
      order_id: orderId,
      type: 'new_order',
      action: 'open_order'
    }
  )
}
```

---

## Troubleshooting

### Error: "Missing Firebase environment variables"

Make sure you set all three Firebase secrets:
```bash
supabase secrets list
```

Should show:
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY

### Error: "Invalid or expired token"

- Check your JWT token is valid
- Verify Dynamic or Privy authentication is working
- Test with a fresh token

### Error: "Merchant not found"

- Ensure merchant exists in merchants table
- Check merchant has either `dynamic_id` or `privy_id` set
- Verify the JWT token belongs to the merchant

### Notifications not received on device

1. Check FCM token is valid:
   ```sql
   SELECT fcm_token FROM merchant_devices WHERE device_id = 'your-device-id';
   ```

2. Test FCM token directly using Firebase Console

3. Verify device has notification permissions enabled

4. Check Firebase project settings (server key, etc.)

---

## Mobile App Integration

### React Native with Firebase

```typescript
import messaging from '@react-native-firebase/messaging'
import DeviceInfo from 'react-native-device-info'

// Request permission (iOS)
async function requestPermission() {
  const authStatus = await messaging().requestPermission()
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL

  if (enabled) {
    console.log('Notification permission granted')
  }
}

// Get FCM token
async function getFCMToken() {
  const token = await messaging().getToken()
  return token
}

// Register device on login
async function registerDevice(jwtToken: string) {
  await requestPermission()
  const fcmToken = await getFCMToken()
  const deviceId = DeviceInfo.getUniqueId()

  const response = await fetch('https://xxx.supabase.co/functions/v1/devices/register', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_id: deviceId,
      fcm_token: fcmToken,
      platform: Platform.OS
    })
  })

  return await response.json()
}

// Unregister on logout
async function unregisterDevice(jwtToken: string) {
  const deviceId = DeviceInfo.getUniqueId()

  await fetch('https://xxx.supabase.co/functions/v1/devices/unregister', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_id: deviceId
    })
  })
}

// Handle foreground messages
messaging().onMessage(async remoteMessage => {
  console.log('Foreground notification:', remoteMessage)
  // Show local notification or update UI
})

// Handle background messages
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background notification:', remoteMessage)
})
```

---

## Monitoring

### View Function Logs

```bash
# View real-time logs
supabase functions logs devices --tail

# View logs with filters
supabase functions logs devices --filter "error"
```

### Check Notification Stats

```sql
-- Recent device registrations
SELECT
  device_id,
  platform,
  created_at
FROM merchant_devices
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Active merchants with devices
SELECT COUNT(DISTINCT merchant_id) as active_merchants
FROM merchant_devices
WHERE updated_at > NOW() - INTERVAL '7 days';
```

---

## Next Steps

1. ✅ Deploy to production
2. ✅ Test with real devices
3. ✅ Integrate with order creation
4. ✅ Add notification history tracking (optional)
5. ✅ Set up monitoring/alerts (optional)

---

## Support

For issues or questions:
- Check Edge Function logs: `supabase functions logs devices`
- Review database records: `SELECT * FROM merchant_devices`
- Test Firebase connection: Use Firebase Console to send test notification

---

## Cleanup (for testing)

```sql
-- Remove all test devices
DELETE FROM merchant_devices WHERE device_id LIKE 'test-%';

-- Remove devices for specific merchant
DELETE FROM merchant_devices WHERE merchant_id = 'merchant-uuid';

-- Clear all devices (use with caution!)
TRUNCATE merchant_devices;
```
