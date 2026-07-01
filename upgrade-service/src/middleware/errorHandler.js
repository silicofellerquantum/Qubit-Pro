"use strict";

/**
 * middleware/errorHandler.js
 *
 * Global Express error handler.
 * Catches any error passed via next(err) and returns a consistent JSON shape.
 * In production, the raw stack trace is suppressed to avoid leaking internals.
 */

const { isProd } = require("../config");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal server error";

  console.error(`[error] ${req.method} ${req.path} → ${status}: ${message}`);
  if (!isProd) console.error(err.stack);

  return res.status(status).json({
    error:  message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
