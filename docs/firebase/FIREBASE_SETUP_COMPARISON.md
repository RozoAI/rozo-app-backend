# Firebase Setup: JSON File vs Environment Variables

## Overview

The Firebase library (`supabase/_shared/firebase.ts`) supports **two methods** of configuration. Choose the one that fits your workflow best.

---

## Method 1: JSON File (Recommended)

### Pros
✅ **Simpler** - One file, no formatting issues
✅ **Direct from Firebase** - Use downloaded file as-is
✅ **Local development** - Easy to test locally
✅ **No newline issues** - JSON preserves private key formatting
✅ **Type-safe** - Full ServiceAccount interface

### Cons
❌ **Git risk** - Must remember to add to `.gitignore`
❌ **File management** - Need to copy file to server

### Setup Steps

1. **Download from Firebase Console:**
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save file (e.g., `rozo-firebase-adminsdk-xxxxx.json`)

2. **Copy to project:**
   ```bash
   cp ~/Downloads/rozo-firebase-adminsdk-xxxxx.json \
      supabase/_shared/firebase-service-account.json
   ```

3. **Add to `.gitignore`:**
   ```bash
   # Already created in supabase/_shared/.gitignore
   echo "firebase-service-account.json" >> supabase/_shared/.gitignore
   ```

4. **Deploy:**
   ```bash
   # File will be included when deploying function
   supabase functions deploy devices
   ```

5. **Verify:**
   ```bash
   # Check logs - should see "Firebase initialized from JSON file"
   supabase functions logs devices
   ```

### File Structure

```json
{
  "type": "service_account",
  "project_id": "rozo-app",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@rozo-app.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",
  "universe_domain": "googleapis.com"
}
```

---

## Method 2: Environment Variables

### Pros
✅ **Secure** - Stored in Supabase Secrets (encrypted)
✅ **No files** - Nothing to track or deploy
✅ **12-Factor App** - Industry best practice
✅ **Easy rotation** - Update without redeploying code
✅ **No git risk** - Can't be committed accidentally

### Cons
❌ **More setup** - Need to extract 3 values manually
❌ **Newline issues** - Private key formatting can be tricky
❌ **Harder to debug** - Can't easily inspect values

### Setup Steps

1. **Download JSON from Firebase** (same as Method 1)

2. **Extract values from JSON:**
   ```bash
   # Open the JSON file
   cat ~/Downloads/rozo-firebase-adminsdk-xxxxx.json

   # Extract values:
   # - project_id
   # - client_email
   # - private_key
   ```

3. **Set Supabase secrets:**
   ```bash
   supabase secrets set FIREBASE_PROJECT_ID="rozo-app"

   supabase secrets set FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@rozo-app.iam.gserviceaccount.com"

   # For private_key, keep the \n characters
   supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n"
   ```

4. **Verify secrets:**
   ```bash
   supabase secrets list
   ```

5. **Deploy:**
   ```bash
   supabase functions deploy devices
   ```

6. **Verify:**
   ```bash
   # Check logs - should see "Firebase initialized from environment variables"
   supabase functions logs devices
   ```

---

## How the Library Works

The `initFirebase()` function tries both methods in order:

```typescript
export function initFirebase(): App {
  if (firebaseApp && getApps().length > 0) {
    return firebaseApp // Already initialized
  }

  // 1. Try JSON file first (recommended)
  try {
    const serviceAccount = JSON.parse(
      Deno.readTextFileSync('supabase/_shared/firebase-service-account.json')
    )
    firebaseApp = initializeApp({ credential: cert(serviceAccount) })
    console.log('Firebase initialized from JSON file')
    return firebaseApp
  } catch (error) {
    console.log('Firebase JSON file not found, trying environment variables...')
  }

  // 2. Fall back to environment variables
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase configuration')
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
```

---

## Which Method Should You Use?

### Use JSON File if:
- ✅ You want the simplest setup
- ✅ You're comfortable managing files
- ✅ You have proper `.gitignore` practices
- ✅ You're developing/testing locally

### Use Environment Variables if:
- ✅ You follow 12-factor app principles strictly
- ✅ You want maximum security (encrypted secrets)
- ✅ You rotate credentials frequently
- ✅ You prefer no file management

### Our Recommendation:
**Use JSON File for development, consider Environment Variables for production.**

But honestly, **JSON file is easier and perfectly secure** if you follow `.gitignore` best practices.

---

## Troubleshooting

### JSON File Issues

**Problem:** `Firebase JSON file not found`

```bash
# Check file exists
ls -la supabase/_shared/firebase-service-account.json

# Check file is valid JSON
cat supabase/_shared/firebase-service-account.json | python -m json.tool

# Verify it's deployed with function
supabase functions inspect devices
```

**Problem:** `Invalid service account`

- Verify JSON file is complete (all fields present)
- Re-download from Firebase Console
- Check `project_id` matches your Firebase project

### Environment Variable Issues

**Problem:** `Missing Firebase environment variables`

```bash
# List all secrets
supabase secrets list

# Should see:
# - FIREBASE_PROJECT_ID
# - FIREBASE_CLIENT_EMAIL
# - FIREBASE_PRIVATE_KEY
```

**Problem:** `Invalid private key format`

- Make sure newlines are preserved: `\n`
- Don't remove the header/footer: `-----BEGIN PRIVATE KEY-----`
- Copy entire value from JSON including quotes

---

## Security Best Practices

### For JSON File Method:
1. ✅ Add `firebase-service-account.json` to `.gitignore`
2. ✅ Never commit credentials to git
3. ✅ Rotate keys if accidentally exposed
4. ✅ Use different service accounts for dev/prod

### For Environment Variables Method:
1. ✅ Use Supabase Secrets (not plain env vars)
2. ✅ Rotate credentials periodically
3. ✅ Use different credentials for dev/prod
4. ✅ Audit access to Supabase dashboard

### Both Methods:
- ✅ Limit service account permissions in Firebase
- ✅ Enable Firebase audit logs
- ✅ Monitor unusual activity
- ✅ Use separate Firebase projects for dev/prod

---

## Converting Between Methods

### From Environment Variables → JSON File:

```bash
# Get current secrets
supabase secrets get FIREBASE_PROJECT_ID
supabase secrets get FIREBASE_CLIENT_EMAIL
supabase secrets get FIREBASE_PRIVATE_KEY

# Create JSON file manually with these values
cat > supabase/_shared/firebase-service-account.json <<EOF
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key": "your-private-key-with-newlines",
  "client_email": "your-client-email"
}
EOF

# Redeploy
supabase functions deploy devices
```

### From JSON File → Environment Variables:

```bash
# Extract values from JSON
PROJECT_ID=$(cat supabase/_shared/firebase-service-account.json | jq -r .project_id)
CLIENT_EMAIL=$(cat supabase/_shared/firebase-service-account.json | jq -r .client_email)
PRIVATE_KEY=$(cat supabase/_shared/firebase-service-account.json | jq -r .private_key)

# Set as secrets
supabase secrets set FIREBASE_PROJECT_ID="$PROJECT_ID"
supabase secrets set FIREBASE_CLIENT_EMAIL="$CLIENT_EMAIL"
supabase secrets set FIREBASE_PRIVATE_KEY="$PRIVATE_KEY"

# Remove JSON file (optional)
rm supabase/_shared/firebase-service-account.json

# Redeploy
supabase functions deploy devices
```

---

## Summary

| Feature | JSON File | Environment Variables |
|---------|-----------|----------------------|
| **Setup Complexity** | ⭐⭐⭐⭐⭐ Simple | ⭐⭐⭐ Moderate |
| **Security** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent |
| **Maintenance** | ⭐⭐⭐⭐ Easy | ⭐⭐⭐⭐⭐ Very Easy |
| **Debugging** | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐ Harder |
| **Git Risk** | ⭐⭐⭐ Medium | ⭐⭐⭐⭐⭐ None |
| **Credential Rotation** | ⭐⭐⭐ Replace file | ⭐⭐⭐⭐⭐ Update secret |

**Winner:** JSON File for ease of use, but both are production-ready! ✅
