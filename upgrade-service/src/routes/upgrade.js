"use strict";

/**
 * routes/upgrade.js
 *
 * POST /api/upgrade-subscription
 *
 * Mid-cycle plan upgrade: Professional ($199) → Team ($499).
 *
 * How Razorpay proration works here:
 *   1. We call subscriptions.update() with the new Team plan ID.
 *   2. Setting schedule_change_at: "now" tells Razorpay to:
 *        a. Calculate the unused days remaining on the Professional plan.
 *        b. Credit that value toward the Team plan.
 *        c. Immediately charge the user only the prorated difference.
 *   3. Razorpay fires a "subscription.updated" webhook once the change
 *      is confirmed — our webhook handler then updates the DB tier.
 *
 * Request body: { subscription_id: string, new_plan_id?: string }
 * The new_plan_id defaults to the RAZORPAY_TEAM_PLAN_ID env variable so
 * callers don't need to hardcode plan IDs on the frontend.
 */

const express  = require("express");
const razorpay = require("../razorpay");
const config   = require("../config");

const router = express.Router();

router.post("/upgrade-subscription", async (req, res) => {
  const { subscription_id, new_plan_id } = req.body;

  // ── Validate input ──────────────────────────────────────────────────────────
  if (!subscription_id || typeof subscription_id !== "string") {
    return res.status(400).json({
      error: "subscription_id is required and must be a string.",
    });
  }

  // Allow callers to override the target plan, but default to the Team plan.
  const targetPlanId = new_plan_id ?? config.razorpay.planIds.team;

  if (!targetPlanId) {
    return res.status(500).json({
      error: "RAZORPAY_TEAM_PLAN_ID is not configured on the server.",
    });
  }

  try {
    // ── Fetch current subscription to confirm it's upgradeable ────────────────
    const current = await razorpay.subscriptions.fetch(subscription_id);

    if (!current || current.status !== "active") {
      return res.status(400).json({
        error: `Subscription ${subscription_id} is not active (status: ${current?.status ?? "unknown"}).`,
      });
    }

    if (current.plan_id === targetPlanId) {
      return res.status(400).json({
        error: "Subscription is already on the requested plan.",
      });
    }

    // ── Prevent downgrades ────────────────────────────────────────────────────
    // Map plan IDs to numeric ranks so we can enforce upgrade-only direction.
    const RANK = {
      [config.razorpay.planIds.professional]: 1,
      [config.razorpay.planIds.team]:         2,
    };

    const currentRank = RANK[current.plan_id] ?? 0;
    const targetRank  = RANK[targetPlanId]     ?? 0;

    if (targetRank <= currentRank) {
      return res.status(400).json({
        error: "Downgrading a subscription mid-cycle is not permitted.",
      });
    }

    // ── Apply immediate mid-cycle upgrade with proration ──────────────────────
    //
    // schedule_change_at: "now"
    //   Razorpay calculates unused value of the current plan and charges
    //   only the prorated difference for the new plan immediately.
    //   No custom wallet or manual arithmetic needed.
    //
    // remain_cycles: current.remaining_count
    //   Preserves the number of remaining billing cycles so the subscription
    //   duration isn't reset when the plan is switched.
    const updated = await razorpay.subscriptions.update(subscription_id, {
      plan_id:              targetPlanId,
      schedule_change_at:   "now",        // trigger immediate proration charge
      quantity:             current.quantity ?? 1,
      remaining_cycles:     current.remaining_count,
    });

    return res.status(200).json({
      message:         "Subscription upgrade initiated. Razorpay is processing the prorated charge.",
      subscription_id: updated.id,
      new_plan_id:     targetPlanId,
      status:          updated.status,
      // The DB tier update happens asynchronously via the webhook —
      // do not trust the tier from the UI until you receive a 200 from /api/webhooks/razorpay.
      note:            "DB tier will be updated once the subscription.updated webhook is received.",
    });
  } catch (err) {
    // Surface the Razorpay error description if available, otherwise the raw message.
    const detail = err?.error?.description ?? err?.message ?? "Unknown error";
    console.error(`[upgrade] Failed to upgrade subscription ${subscription_id}:`, detail);

    return res.status(502).json({
      error:  "Payment gateway error. Please try again or contact support.",
      detail, // safe to expose — Razorpay error descriptions are user-readable
    });
  }
});

module.exports = router;
