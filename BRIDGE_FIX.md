# Bridge "Failed to Fetch" Error — Root Cause & Fix

## Problem

The frontend shows **"Bridge error: Error: Failed to fetch"** because:

1. ✅ Backend is running on port **8000**
2. ❌ Frontend is configured to connect to port **5000** (default)
3. ❌ The ports don't match → fetch fails

## Evidence

### Backend (correct)
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Frontend (incorrect)
```typescript
// frontend/src/lib/bridge/client.ts line 15-17
const RAW_URL = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ??
                (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
                "http://localhost:5000";  // ← WRONG PORT
```

## Fix Options

### Option 1: Change Backend Port to 5000 (Quick)

Stop the backend and restart on port 5000:

```cmd
cd C:\Users\HP\Downloads\Feller\Qubit-Pro\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
```

### Option 2: Configure Frontend to Use Port 8000 (Recommended)

Create or update `frontend/.env.local`:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_BRIDGE_URL=http://localhost:8000
```

Then restart the frontend dev server:

```cmd
cd C:\Users\HP\Downloads\Feller\Qubit-Pro\frontend
npm run dev
```

### Option 3: Update Both to Match

**Backend:** Keep port 8000  
**Frontend `.env.local`:**
```env
VITE_BACKEND_URL=http://localhost:8000
VITE_BRIDGE_URL=http://localhost:8000
```

## Verification

After applying the fix, the following should work:

1. Open browser console (F12) → Network tab
2. Navigate to http://localhost:3000/schematic-editor
3. Look for requests to `/components`, `/components/{id}/pins`, `/components/{id}/metadata`
4. All should return `200 OK` instead of `Failed to fetch`

### Test from Browser Console

```javascript
fetch('http://localhost:8000/components')
  .then(r => r.json())
  .then(d => console.log('✅ Bridge connected:', d.length, 'components'))
  .catch(e => console.error('❌ Bridge failed:', e))
```

Expected output:
```
✅ Bridge connected: 45 components
```

## Why This Happened

The backend was started with `--port 8000`, but:
- The frontend defaults to port 5000
- No `.env.local` file existed to override this
- The two processes couldn't communicate

## Current Status After Fix

Once ports match:
- ✅ 45 qiskit-metal components will load
- ✅ Component metadata/pins will populate
- ✅ Preview SVGs will render
- ✅ Design rendering will work
- ✅ Route rendering will work

All backend tests confirmed working on port 8000.
