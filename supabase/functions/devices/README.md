# Device Management Edge Function

Manages merchant device registration for push notifications via Firebase Cloud Messaging (FCM).

## Endpoints

### 1. Register Device
**POST** `/functions/v1/devices/register`

Register a device's FCM token for receiving push notifications.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "fcm_token": "firebase-cloud-messaging-token",
  "platform": "ios" // or "android"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "merchant_id": "merchant-uuid",
    "device_id": "unique-device-identifier",
    "fcm_token": "firebase-token",
    "platform": "ios",
    "created_at": "2025-10-31T00:00:00Z",
    "updated_at": "2025-10-31T00:00:00Z"
  },
  "message": "Device registered successfully"
}
```

**Error Responses:**
- `400` - Missing or invalid fields
- `401` - Invalid or expired JWT token
- `403` - Account blocked or inactive
- `404` - Merchant not found
- `500` - Server error

---

### 2. Unregister Device
**DELETE** `/functions/v1/devices/unregister`

Remove a device's FCM token (typically called on logout).

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "unique-device-identifier"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Device unregistered successfully"
}
```

**Error Responses:**
- `400` - Missing device_id
- `401` - Invalid or expired JWT token
- `403` - Account blocked or inactive
- `404` - Merchant not found
- `500` - Server error

---

## Multi-Device Support

One merchant can register multiple devices simultaneously:

1. Merchant logs in on iPhone → registers device A
2. Merchant logs in on iPad → registers device B
3. Both devices receive notifications
4. Merchant logs out from iPhone → unregisters device A
5. iPad continues to receive notifications

The `UNIQUE(device_id, merchant_id)` constraint ensures:
- Same device can't be registered twice for the same merchant
- If a device re-registers, its FCM token is updated (upsert)

---

## Authentication

Supports both **Dynamic** and **Privy** authentication:

- Uses existing JWT verification from `_shared/utils.ts`
- Automatically detects which auth provider is being used
- Links device to merchant via `merchant_id` from merchants table

---

## Deployment

```bash
# Deploy the function
supabase functions deploy devices

# Set Firebase environment variables
supabase secrets set FIREBASE_PROJECT_ID=your-project-id
supabase secrets set FIREBASE_CLIENT_EMAIL=firebase-adminsdk@xxx.iam.gserviceaccount.com
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Run the migration
supabase db push
```

---

## Testing

### Register Device
```bash
curl -X POST https://your-project.supabase.co/functions/v1/devices/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-123",
    "fcm_token": "your-fcm-token-here",
    "platform": "ios"
  }'
```

### Unregister Device
```bash
curl -X DELETE https://your-project.supabase.co/functions/v1/devices/unregister \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-123"
  }'
```

### Check Registered Devices (via SQL)
```sql
SELECT
  device_id,
  platform,
  created_at,
  updated_at
FROM merchant_devices
WHERE merchant_id = 'your-merchant-id';
```

---

## Sending Notifications

To send notifications from other Edge Functions, use the shared Firebase library:

```typescript
import { sendNotificationToDevices } from '../../_shared/firebase.ts'

// Get merchant's devices
const { data: devices } = await supabase
  .from('merchant_devices')
  .select('fcm_token')
  .eq('merchant_id', merchantId)

const tokens = devices?.map(d => d.fcm_token) || []

// Send notification to all merchant's devices
if (tokens.length > 0) {
  await sendNotificationToDevices(
    tokens,
    'New Order Received',
    `Order #${orderId} has been placed`,
    { order_id: orderId, type: 'new_order' }
  )
}
```

---

## Database Schema

```sql
CREATE TABLE merchant_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(device_id, merchant_id)
);
```

---

## Security

- ✅ JWT authentication required for all endpoints
- ✅ Merchant status validation (blocks PIN_BLOCKED and INACTIVE accounts)
- ✅ Row Level Security (RLS) enabled
- ✅ Automatic device cleanup on merchant deletion (CASCADE)
- ✅ CORS configured for web/mobile clients
