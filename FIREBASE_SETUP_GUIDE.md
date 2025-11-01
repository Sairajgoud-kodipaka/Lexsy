# Firebase + Google OAuth Integration Guide

## ✅ Step 1: Redis Setup (Optional but Recommended)

### Option A: Install Redis on Windows
1. Download Redis for Windows: https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Redis will run on `localhost:6379`

### Option B: Use Docker (Recommended)
```bash
docker run -d --name lexsy-redis -p 6379:6379 redis:alpine
```

### Verify Redis Connection
Your app automatically detects Redis. If not running, it uses in-memory fallback (works but sessions won't persist).

---

## 🔥 Step 2: Create Firebase Project

### 2.1 Create Project in Firebase Console
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Enter project name: `lexsy-document-automation`
4. Disable Google Analytics (or enable if needed)
5. Click "Create project"

### 2.2 Enable Google Authentication
1. In Firebase Console, go to **Authentication**
2. Click **Get Started**
3. Go to **Sign-in method** tab
4. Click on **Google**
5. Enable it
6. Set project support email
7. Click **Save**

### 2.3 Get Web App Configuration
1. In Firebase Console, click gear icon ⚙️ → **Project settings**
2. Scroll to **Your apps** section
3. Click **</>** (Web app icon) or **Add app** → **Web**
4. Register app with nickname: `Lexsy Frontend`
5. Copy the `firebaseConfig` object (you'll need this)

### 2.4 Get Service Account Key (for Backend)
1. In Firebase Console → **Project settings** → **Service accounts**
2. Click **Generate new private key**
3. Save the JSON file securely (we'll use this in backend)
4. **⚠️ IMPORTANT**: Add this file to `.gitignore`!

---

## 📦 Step 3: Install Dependencies

### Frontend Dependencies
```bash
cd frontend
npm install firebase
```

### Backend Dependencies
```bash
cd backend
pip install firebase-admin python-dotenv
```

---

## ⚙️ Step 4: Configure Firebase

### 4.1 Frontend Configuration

Create `frontend/lib/firebase.ts`:
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app;
```

### 4.2 Backend Configuration

1. Place your Firebase service account JSON file in `backend/` directory
2. Rename it to `firebase-service-account.json`
3. Add to `.gitignore`:
```
backend/firebase-service-account.json
backend/.env
```

4. Create `backend/services/firebase_auth.py` (will be created automatically)

---

## 🔐 Step 5: Implement Authentication

### 5.1 Frontend Auth Hook

Create `frontend/hooks/useAuth.ts`:
```typescript
import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  User,
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  token: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    token: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken();
        setAuthState({ user, loading: false, token });
      } else {
        setAuthState({ user: null, loading: false, token: null });
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return {
    ...authState,
    signInWithGoogle,
    logout,
  };
}
```

### 5.2 Backend Firebase Admin Setup

Create `backend/services/firebase_auth.py`:
```python
"""
Firebase Authentication Service
Handles user authentication and token verification
"""

import os
import firebase_admin
from firebase_admin import credentials, auth
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
_firebase_app = None

def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global _firebase_app
    
    if _firebase_app is not None:
        return _firebase_app
    
    # Get service account file path
    service_account_path = os.environ.get(
        'FIREBASE_SERVICE_ACCOUNT',
        os.path.join(os.path.dirname(__file__), '..', 'firebase-service-account.json')
    )
    
    if not os.path.exists(service_account_path):
        logger.warning("Firebase service account file not found. Auth will be disabled.")
        return None
    
    try:
        cred = credentials.Certificate(service_account_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("✅ Firebase Admin initialized successfully")
        return _firebase_app
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        return None

def verify_token(id_token: str) -> Optional[dict]:
    """
    Verify Firebase ID token and return decoded token
    
    Args:
        id_token: Firebase ID token from client
        
    Returns:
        Decoded token with user info, or None if invalid
    """
    try:
        if _firebase_app is None:
            initialize_firebase()
        
        if _firebase_app is None:
            return None
        
        decoded_token = auth.verify_id_token(id_token)
        return {
            'uid': decoded_token['uid'],
            'email': decoded_token.get('email'),
            'name': decoded_token.get('name'),
            'picture': decoded_token.get('picture'),
        }
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        return None

def get_user_by_id(uid: str) -> Optional[dict]:
    """Get user information by Firebase UID"""
    try:
        if _firebase_app is None:
            initialize_firebase()
        
        if _firebase_app is None:
            return None
        
        user = auth.get_user(uid)
        return {
            'uid': user.uid,
            'email': user.email,
            'name': user.display_name,
            'picture': user.photo_url,
        }
    except Exception as e:
        logger.error(f"Failed to get user: {e}")
        return None
```

### 5.3 Update Session Manager to Link Users

Update `backend/services/session_manager.py`:
- Modify `save_session` to accept `user_id` parameter
- Store `user_id` with each session
- Filter sessions by `user_id` in `get_all_sessions`

### 5.4 Add Auth Middleware to Backend

Add to `backend/app.py`:
```python
from flask import request
from services.firebase_auth import verify_token

def require_auth(f):
    """Decorator to require Firebase authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                'error': 'Unauthorized',
                'message': 'No valid authentication token provided'
            }), 401
        
        token = auth_header.split('Bearer ')[1]
        user_info = verify_token(token)
        
        if not user_info:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Invalid or expired token'
            }), 401
        
        # Add user info to request context
        request.user = user_info
        return f(*args, **kwargs)
    
    return decorated_function
```

---

## 🎨 Step 6: Update Frontend UI

### 6.1 Add Login Component

Create `frontend/components/auth/login-button.tsx`:
```typescript
'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export function LoginButton() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <Button disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <img
          src={user.photoURL || ''}
          alt={user.displayName || ''}
          className="h-8 w-8 rounded-full"
        />
        <span className="text-sm">{user.displayName}</span>
      </div>
    );
  }

  return (
    <Button onClick={signInWithGoogle} variant="default">
      Sign in with Google
    </Button>
  );
}
```

### 6.2 Update API Calls to Include Token

Update `frontend/lib/api.ts`:
```typescript
// Add token to all requests
async function getAuthHeaders(): Promise<HeadersInit> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (user) {
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }
  
  return {
    'Content-Type': 'application/json',
  };
}
```

---

## ✅ Step 7: Test the Integration

1. Start backend: `python backend/app.py`
2. Start frontend: `npm run dev`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Sessions should now be linked to your Google account!

---

## 🔒 Step 8: Protect Routes

Update frontend pages to require authentication:
```typescript
const { user, loading } = useAuth();

if (loading) return <LoadingScreen />;
if (!user) return <LoginScreen />;

// Protected content here
```

---

## 📊 Step 9: User-Specific Sessions

Sessions are now automatically linked to user IDs. Each user only sees their own sessions!

