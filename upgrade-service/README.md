# Upgrade Service

Standalone Node.js/Express microservice that handles **mid-cycle Razorpay subscription upgrades with automatic proration** and syncs the result to your database via webhook.

---

## How proration works

```
Professional ($199/mo)  ──upgrade──►  Team ($499/mo)
        │
        └─ Razorpay calculates unused days on Professional
           Credits that value toward Team
           Charges only the prorated difference immediately
           No custom wallet — handled natively by Razorpay
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upgrade-subscription` | Trigger mid-cycle upgrade with proration |
| `POST` | `/api/webhooks/razorpay` | Receive & verify Razorpay events, sync DB |
| `GET`  | `/health` | Liveness check |

---

## Setup

### 1. Install dependencies
```bash
cd upgrade-service
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your Razorpay and Supabase credentials
```

| Variable | Description |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Set in Dashboard → Settings → Webhooks |
| `RAZORPAY_PROFESSIONAL_PLAN_ID` | Plan ID for $199/mo (Dashboard → Subscriptions → Plans) |
| `RAZORPAY_TEAM_PLAN_ID` | Plan ID for $499/mo |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS server-side |

### 3. Run
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

---

## Upgrade flow

### Frontend call
```js
// Call this when user clicks "Upgrade to Team"
const res = await fetch("/api/upgrade-subscription", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({
    subscription_id: "sub_XXXXXXXXXXXXXXXXXX", // user's current Razorpay sub ID
    // new_plan_id is optional — defaults to RAZORPAY_TEAM_PLAN_ID
  }),
});
const data = await res.json();
// Show success toast — DB tier updates asynchronously via webhook
```

### What happens next
```
Frontend  ──POST /api/upgrade-subscription──►  This service
                                                    │
                                         razorpay.subscriptions.update()
                                         schedule_change_at: "now"
                                                    │
                                         Razorpay processes prorated charge
                                                    │
                                         Razorpay fires "subscription.updated"
                                                    │
                    ◄──POST /api/webhooks/razorpay──┘
                    Verify HMAC signature
                    Update users.plan = "pro"  (Team)
                    in Supabase
```

---

## Database schema (Supabase)

The webhook handler expects these columns on your `users` table:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan                      TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status       TEXT DEFAULT NULL;

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_razorpay_subscription_id
  ON users (razorpay_subscription_id);
```

---

## Razorpay Dashboard configuration

1. Go to **Settings → Webhooks → Add New Webhook**
2. URL: `https://your-domain.com/api/webhooks/razorpay`
3. Secret: paste the value you put in `RAZORPAY_WEBHOOK_SECRET`
4. Enable these events:
   - `subscription.updated`
   - `subscription.activated`
   - `subscription.cancelled`
   - `subscription.halted`

---

## Plan key mapping

| Internal key | Display name | Razorpay plan env var | Price |
|---|---|---|---|
| `basic` | Professional | `RAZORPAY_PROFESSIONAL_PLAN_ID` | $199/mo |
| `pro` | Team | `RAZORPAY_TEAM_PLAN_ID` | $499/mo |

> These keys match your existing Python/FastAPI backend in `backend/app/routers/billing.py`.

---

## Running alongside the Python backend

This service runs on port `4000` by default. Your FastAPI backend typically runs on `5000`. Both can run in parallel — point Razorpay webhooks at whichever service handles them (or both, with separate webhook secrets).

```
Python FastAPI  → port 5000  (existing billing, auth, design endpoints)
Node Upgrade    → port 4000  (proration upgrade + webhook sync)
```
