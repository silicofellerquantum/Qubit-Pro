"use strict";

/**
 * index.js — Upgrade Service entry point
 *
 * Route layout:
 *   POST  /api/upgrade-subscription    Mid-cycle plan upgrade (proration via Razorpay)
 *   POST  /api/webhooks/razorpay       Razorpay event webhook (HMAC-verified)
 *   GET   /health                      Liveness check
 *
 * Important: the webhook route MUST use express.raw() — not express.json() —
 * so the raw request body is preserved for HMAC-SHA256 signature verification.
 * express.json() is applied to all OTHER routes via a conditional check.
 */

const express      = require("express");
const config       = require("./config");
const upgradeRoute = require("./routes/upgrade");
const webhookRoute = require("./routes/webhook");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// ── Raw body parser for the webhook route only ────────────────────────────────
// Razorpay signs the exact raw bytes it sends.  If we let express.json() parse
// the body first, the Buffer is lost and signature verification will always fail.
app.use(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json", limit: "1mb" })
);

// ── JSON parser for all other routes ─────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/webhooks")) return next(); // already handled above
  express.json({ limit: "256kb" })(req, _res, next);
});

// ── Security headers (minimal, no external dependency) ───────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "upgrade-service", ts: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", upgradeRoute);
app.use("/api", webhookRoute);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ error: "Route not found." })
);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.info(`[server] Upgrade service running on port ${config.port} (${config.isProd ? "production" : "development"})`);
  console.info(`[server] Endpoints:`);
  console.info(`         POST /api/upgrade-subscription`);
  console.info(`         POST /api/webhooks/razorpay`);
  console.info(`         GET  /health`);
});

module.exports = app; // exported for testing
