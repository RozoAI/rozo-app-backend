# Device Notifications Implementation Summary

## Overview

A simplified push notification system for managing merchant devices and sending notifications via Firebase Cloud Messaging (FCM).

## What Was Implemented

### 1. Firebase Shared Library
**File:** `supabase/_shared/firebase.ts`

Reusable Firebase Admin SDK wrapper with:
- `initFirebase()` - Initialize Firebase (singleton pattern)
- `sendNotificationToDevice()` - Send to single device
- `sendNotificationToDevices()` - Send to multiple devices (batch)

### 2. Device Management Edge Function
**File:** `supabase/functions/devices/index.ts`

Single function with two routes:
- `POST /functions/v1/devices/register` - Register device FCM token
- `DELETE /functions/v1/devices/unregister` - Remove device

**Features:**
- ✅ JWT authentication (Dynamic & Privy)
- ✅ Multi-device support per merchant
- ✅ Merchant status validation
- ✅ Upsert logic (updates existing or creates new)
- ✅ Hard delete on unregister
- ✅ CORS support

### 3. Database Migration
**File:** `supabase/migrations/20251031000000_create_merchant_devices.sql`

Creates `merchant_devices` table:
```sql
- id (UUID, primary key)
- merchant_id (UUID, references merchants)
- device_id (TEXT, unique per merchant)
- fcm_token (TEXT)
- platform (TEXT, 'ios' or 'android')
- created_at, updated_at (TIMESTAMPTZ)
- UNIQUE(device_id, merchant_id)
```

**Includes:**
- Index on merchant_id
- Row Level Security policies
- CASCADE delete on merchant removal

### 4. Documentation
- `supabase/functions/devices/README.md` - API documentation
- `supabase/_shared/firebase.example.ts` - Usage examples

---

## Architecture

```
┌─────────────────┐
│   Mobile App    │
│ (React Native)  │
└────────┬────────┘
         │
         │ Register/Unregister FCM Token
         │
         ▼
┌──────────────────────────────┐
│  Edge Function: devices      │
│  - POST /devices/register    │
│  - DELETE /devices/unregister│
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│  PostgreSQL Database         │
│  Table: merchant_devices     │
└──────────────────────────────┘

┌──────────────────────────────┐
│  Other Edge Functions        │
│  (order webhook, payments)   │
└────────┬─────────────────────┘
         │
         │ Import sendNotificationToDevices()
         │
         ▼
┌──────────────────────────────┐
│  _shared/firebase.ts         │
│  Firebase Admin SDK          │
└────────┬─────────────────────┘
         │
         │ Send Push Notifications
         │
         ▼
┌──────────────────────────────┐
│  Firebase Cloud Messaging    │
└────────┬─────────────────────┘
         │
         ▼
┌─────────────────┐
│  Merchant's     │
│  Devices        │
└─────────────────┘
```

---

## Deployment Steps

### 1. Deploy Edge Function
```bash
supabase functions deploy devices
```

### 2. Set Environment Variables
```bash
supabase secrets set FIREBASE_PROJECT_ID=your-project-id
supabase secrets set FIREBASE_CLIENT_EMAIL=firebase-adminsdk@xxx.iam.gserviceaccount.com
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Run Database Migration
```bash
supabase db push
```

---

## Usage Examples

### From Mobile App

**Register Device (on app login/startup):**
```typescript
const response = await fetch('https://xxx.supabase.co/functions/v1/devices/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    device_id: DeviceInfo.getUniqueId(),
    fcm_token: await messaging().getToken(),
    platform: Platform.OS
  })
})
```

**Unregister Device (on logout):**
```typescript
await fetch('https://xxx.supabase.co/functions/v1/devices/unregister', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    device_id: DeviceInfo.getUniqueId()
  })
})
```

### From Other Edge Functions

**Send notification when order is created:**
```typescript
import { sendNotificationToDevices } from '../../_shared/firebase.ts'

// Get merchant's devices
const { data: devices } = await supabase
  .from('merchant_devices')
  .select('fcm_token')
  .eq('merchant_id', merchantId)

const tokens = devices?.map(d => d.fcm_token) || []

// Send to all devices
if (tokens.length > 0) {
  await sendNotificationToDevices(
    tokens,
    'New Order',
    `Order #${orderNumber} received`,
    { order_id: orderId, type: 'new_order' }
  )
}
```

---

## Multi-Device Support

One merchant can have multiple devices registered:

| merchant_id | device_id | platform | fcm_token |
|-------------|-----------|----------|-----------|
| merchant-1  | iphone-123| ios      | token-abc |
| merchant-1  | ipad-456  | ios      | token-def |
| merchant-2  | pixel-789 | android  | token-ghi |

When sending notifications:
- All devices for a merchant receive the notification
- Uses batch `sendEachForMulticast()` for efficiency
- Invalid tokens are automatically handled by Firebase

---

## Security Features

1. **Authentication Required**
   - All endpoints require valid JWT token (Dynamic or Privy)
   - Merchant is identified from JWT payload

2. **Merchant Status Validation**
   - Blocks `PIN_BLOCKED` accounts
   - Blocks `INACTIVE` accounts

3. **Row Level Security**
   - Merchants can only access their own devices
   - Service role key bypasses RLS (used by Edge Functions)

4. **Data Protection**
   - CASCADE delete when merchant is deleted
   - UNIQUE constraint prevents duplicate device registrations

---

## Testing

### Test Device Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/devices/register \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-123","fcm_token":"token-abc","platform":"ios"}'
```

### Verify in Database
```sql
SELECT * FROM merchant_devices WHERE merchant_id = 'your-merchant-id';
```

### Test Notification Sending
```typescript
import { sendNotificationToDevice } from '../_shared/firebase.ts'

await sendNotificationToDevice(
  'your-fcm-token',
  'Test Notification',
  'This is a test message'
)
```

---

## What's Next

To integrate notifications into your order flow:

1. **Import Firebase library** in order-related Edge Functions
2. **Query merchant_devices** to get FCM tokens
3. **Call sendNotificationToDevices()** with appropriate message

Example integration points:
- Order created → "New order received"
- Payment received → "Payment confirmed"
- Order completed → "Order completed"
- Order cancelled → "Order cancelled"

---

## Files Created

```
supabase/
├── _shared/
│   ├── firebase.ts              # NEW - Firebase utilities
│   └── firebase.example.ts      # NEW - Usage examples
│
├── functions/
│   └── devices/
│       ├── index.ts             # NEW - Device management function
│       └── README.md            # NEW - API documentation
│
└── migrations/
    └── 20251031000000_create_merchant_devices.sql  # NEW - Database schema
```

---

## Environment Variables Needed

Add these to your Supabase project:

```bash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Get these from Firebase Console → Project Settings → Service Accounts → Generate New Private Key

---

## Summary

✅ **Simple & Focused** - Only device registration/unregistration
✅ **Reusable** - Firebase library can be used by any Edge Function
✅ **Multi-Device** - One merchant, multiple devices supported
✅ **Secure** - JWT auth, merchant status checks, RLS policies
✅ **Clean Architecture** - Follows existing project patterns
✅ **Production Ready** - Error handling, logging, validation

The implementation is complete and ready to deploy!
