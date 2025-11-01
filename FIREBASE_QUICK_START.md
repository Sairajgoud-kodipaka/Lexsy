# 🚀 Firebase + Google Auth Quick Start

## ✅ Status Check

- ✅ **Redis Setup**: Currently using in-memory fallback (works, but sessions won't persist)
- ✅ **Backend Firebase Admin**: Installed (`firebase-admin`)
- ✅ **Frontend Firebase**: Installed (`firebase`)
- ✅ **Session Manager**: Updated to support user IDs
- ✅ **API Endpoints**: Updated to filter by authenticated user

---

## 📝 Setup Steps (Do These Now)

### 1. **Create Firebase Project** (5 minutes)

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Project name: `lexsy-document-automation`
4. Click **"Create project"**

### 2. **Enable Google Authentication** (2 minutes)

1. In Firebase Console → **Authentication** → **Get Started**
2. Go to **Sign-in method** tab
3. Click **Google** → Enable it
4. Set project support email
5. Click **Save**

### 3. **Get Web App Config** (2 minutes)

1. Firebase Console → ⚙️ **Project settings**
2. Scroll to **"Your apps"** section
3. Click **</>** (Web icon) or **Add app** → **Web**
4. App nickname: `Lexsy Frontend`
5. **Copy the `firebaseConfig` object**

### 4. **Configure Frontend** (1 minute)

Edit `frontend/lib/firebase.ts` and replace:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",           // ← Replace
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",     // ← Replace
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"              // ← Replace
};
```

Or use environment variables in `frontend/.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 5. **Get Service Account Key** (2 minutes)

1. Firebase Console → **Project settings** → **Service accounts**
2. Click **"Generate new private key"**
3. Save the JSON file as `backend/firebase-service-account.json`
4. **⚠️ IMPORTANT**: Add to `.gitignore`:
   ```
   backend/firebase-service-account.json
   ```

### 6. **Add Login Button to UI** (Optional)

In your main page component (`frontend/app/page.tsx`), add:

```typescript
import { LoginButton } from '@/components/auth/login-button';

// In your header or navbar:
<LoginButton />
```

### 7. **Update API Calls** (Automatic)

The API automatically includes auth tokens when users are logged in.

---

## 🧪 Test It

1. **Start backend**: `python backend/app.py`
2. **Start frontend**: `npm run dev` (in frontend folder)
3. **Click "Sign in with Google"**
4. **Complete OAuth flow**
5. **Upload a document** - it will be linked to your Google account!

---

## 🔍 Verify It Works

### Check Session Has User ID
```bash
# In backend logs, you should see:
Session linked to user: abc123xyz...
```

### Check Sessions API Returns User's Sessions
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5001/api/sessions
```

---

## 📊 How It Works

1. **User signs in with Google** → Firebase provides ID token
2. **Frontend sends token** → In `Authorization: Bearer <token>` header
3. **Backend verifies token** → Extracts user ID (`uid`)
4. **Sessions linked to user** → Stored with `user_id` field
5. **Sessions filtered by user** → Users only see their own sessions

---

## 🎯 Features

- ✅ **User Authentication**: Google OAuth
- ✅ **Session Isolation**: Each user sees only their sessions
- ✅ **Session Persistence**: Redis (or fallback to in-memory)
- ✅ **Session History**: Track all events per session
- ✅ **Automatic Token Refresh**: Firebase handles it
- ✅ **Secure**: Token verification on every request

---

## 🆘 Troubleshooting

### "Firebase not initialized" warning
- Make sure `firebase-service-account.json` is in `backend/` folder
- Check file path in logs

### "Invalid token" error
- Token might be expired - refresh the page
- Check Firebase config matches project

### Sessions not showing
- Check if user is authenticated (token in header)
- Verify `user_id` is in session data (check logs)

---

## 🚀 Next Steps

1. **Start Redis** (optional but recommended):
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

2. **Add Login Button** to your UI

3. **Protect Routes** - require auth for document operations

4. **Add User Profile** - show user info in header

---

## 📚 Files Created

- `backend/services/firebase_auth.py` - Firebase authentication service
- `frontend/lib/firebase.ts` - Firebase client config
- `frontend/hooks/useAuth.ts` - Authentication hook
- `frontend/components/auth/login-button.tsx` - Login UI component
- `FIREBASE_SETUP_GUIDE.md` - Detailed guide
- `FIREBASE_QUICK_START.md` - This file

---

## ✅ Done!

Your app now has:
- 🔐 Google Authentication
- 👤 User-specific sessions
- 📊 Session history tracking
- 🗄️ Redis persistence (when Redis is running)

**Just complete the Firebase Console setup steps above and you're ready to go!**

