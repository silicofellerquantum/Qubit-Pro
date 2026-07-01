"use strict";

/**
 * routes/webhook.js
 *
 * POST /api/webhooks/razorpay
 *
 * Receives Razorpay event notifications and syncs the user's plan tier
 * in Supabase.
 *
 * Security model:
 *   - Raw request body is captured BEFORE JSON parsing so the HMAC-SHA256
 *     signature can be verified against the exact bytes Razorpay signed.
 *   - Any request with an invalid or missing signature is rejected with 400.
 *   - Returns 500 on DB errors so Razorpay retries delivery (it respects 5xx).
 *   - Returns 200 for all successfully processed or intentionally ignored events.
 *
 * Handled events:
 *   subscription.updated  — fires after a plan change; updates tier in Supabase.
 *   subscription.activated — fires on first activation; optionally activate tier.
 *   subscription.cancelled / subscription.halted — downgrade to free tier.
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL: https://your-domain.com/api/webhooks/razorpay
 *   Active events: subscription.updated, subscription.activated,
 *                  subscription.cancelled, subscription.halted
 */

const express  = require("express");
const crypto   = require("crypto");
const supabase = require("../supabase");
const config   = require("../config");

const router = express.Router();

// ── Signature verification middleware ─────────────────────────────────────────
// Must run BEFORE express.json() so rawBody is available.
// Attached in index.js via express.raw({ type: "application/json" }) for this route.

function verifyRazorpaySignature(req, res, next) {
  const receivedSig = req.headers["x-razorpay-signature"];

  if (!receivedSig) {
    console.warn("[webhook] Missing X-Razorpay-Signature header.");
    return res.status(400).json({ error: "Missing signature header." });
  }

  // req.body is a raw Buffer when express.raw() is used for this route.
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    console.warn("[webhook] Raw body not available for signature verification.");
    return res.status(400).json({ error: "Invalid request body." });
  }

  const expectedSig = crypto
    .createHmac("sha256", config.razorpay.webhookSecret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks.
  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSig, "hex"),
    Buffer.from(receivedSig, "hex")
  );

  if (!isValid) {
    console.warn("[webhook] Signature verification FAILED — possible spoofed request.");
    return res.status(400).json({ error: "Signature verification failed." });
  }

  // Attach the parsed payload for the route handler.
  try {
    req.webhookPayload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  next();
}

// ── Helper: resolve internal plan key from Razorpay plan_id ──────────────────
function resolvePlanKey(razorpayPlanId) {
  const { planIds } = config.razorpay;
  if (razorpayPlanId === planIds.team)         return "pro";          // "pro" = Team internally
  if (razorpayPlanId === planIds.professional) return "basic";        // "basic" = Professional internally
  return null; // unknown plan — will be logged and ignored
}

// ── Helper: update user tier in Supabase ─────────────────────────────────────
async function updateUserTier(razorpaySubscriptionId, planKey) {
  const { error } = await supabase
    .from("users")
    .update({
      plan:                planKey,
      subscription_status: "active",
    })
    .eq("razorpay_subscription_id", razorpaySubscriptionId);

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }
}

async function downgradeUserToFree(razorpaySubscriptionId, reason) {
  const { error } = await supabase
    .from("users")
    .update({
      plan:                "free",
      subscription_status: reason, // "cancelled" | "halted"
    })
    .eq("razorpay_subscription_id", razorpaySubscriptionId);

  if (error) {
    throw new Error(`Supabase downgrade failed: ${error.message}`);
  }
}

// ── Webhook route ─────────────────────────────────────────────────────────────
router.post(
  "/webhooks/razorpay",
  verifyRazorpaySignature,
  async (req, res) => {
    const payload = req.webhookPayload;
    const event   = payload?.event ?? "";

    // Subscription entity lives at payload.payload.subscription.entity
    const subEntity = payload?.payload?.subscription?.entity ?? {};
    const subId     = subEntity.id;
    const planId    = subEntity.plan_id;
    const status    = subEntity.status;

    console.info(`[webhook] Event received: ${event} | sub_id: ${subId} | status: ${status}`);

    // ── subscription.updated ──────────────────────────────────────────────────
    // Fired after a mid-cycle plan change (our upgrade flow triggers this).
    if (event === "subscription.updated") {
      if (!subId) {
        console.warn("[webhook] subscription.updated received without subscription ID — skipping.");
        return res.status(200).json({ received: true });
      }

      if (status === "active") {
        const planKey = resolvePlanKey(planId);

        if (!planKey) {
          // Unknown plan ID — not managed by this service, acknowledge and move on.
          console.warn(`[webhook] Unknown plan_id: ${planId} — no DB update performed.`);
          return res.status(200).json({ received: true });
        }

        try {
          await updateUserTier(subId, planKey);
          console.info(`[webhook] Updated user tier to "${planKey}" for sub_id: ${subId}`);
        } catch (err) {
          // Return 500 so Razorpay retries this webhook delivery.
          console.error(`[webhook] DB update failed for sub_id ${subId}:`, err.message);
          return res.status(500).json({ error: "Database update failed. Will retry." });
        }
      }

      return res.status(200).json({ received: true });
    }

    // ── subscription.activated ────────────────────────────────────────────────
    // Fired on first successful payment — activates the plan tier in DB.
    if (event === "subscription.activated") {
      if (subId && status === "active") {
        const planKey = resolvePlanKey(planId);

        if (planKey) {
          try {
            await updateUserTier(subId, planKey);
            console.info(`[webhook] Activated tier "${planKey}" for sub_id: ${subId}`);
          } catch (err) {
            console.error(`[webhook] DB activation failed for sub_id ${subId}:`, err.message);
            return res.status(500).json({ error: "Database update failed. Will retry." });
          }
        }
      }

      return res.status(200).json({ received: true });
    }

    // ── subscription.cancelled / subscription.halted ──────────────────────────
    // Downgrade the user to free tier so they lose paid-plan access.
    if (event === "subscription.cancelled" || event === "subscription.halted") {
      if (subId) {
        const reason = event === "subscription.cancelled" ? "cancelled" : "halted";
        try {
          await downgradeUserToFree(subId, reason);
          console.info(`[webhook] Downgraded user to free for sub_id: ${subId} (${reason})`);
        } catch (err) {
          console.error(`[webhook] DB downgrade failed for sub_id ${subId}:`, err.message);
          return res.status(500).json({ error: "Database update failed. Will retry." });
        }
      }

      return res.status(200).json({ received: true });
    }

    // ── All other events — acknowledge without action ─────────────────────────
    console.info(`[webhook] Unhandled event "${event}" — acknowledged.`);
    return res.status(200).json({ received: true });
  }
);

module.exports = router;
