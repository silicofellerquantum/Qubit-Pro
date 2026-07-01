"use strict";

/**
 * config.js
 * Centralised environment variable validation.
 * Fails fast at startup if any required variable is missing.
 */

require("dotenv").config();

const REQUIRED = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_TEAM_PLAN_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[config] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  razorpay: {
    keyId:         process.env.RAZORPAY_KEY_ID,
    keySecret:     process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    // Razorpay plan IDs — must be created in Dashboard → Subscriptions → Plans
    planIds: {
      professional: process.env.RAZORPAY_PROFESSIONAL_PLAN_ID, // $199/mo
      team:         process.env.RAZORPAY_TEAM_PLAN_ID,         // $499/mo
    },
  },
  supabase: {
    url:            process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  port: parseInt(process.env.PORT ?? "4000", 10),
  isProd: process.env.NODE_ENV === "production",
};
