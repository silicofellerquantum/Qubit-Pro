"use strict";

/**
 * razorpay.js
 * Initialise and export the authenticated Razorpay SDK client.
 */

const Razorpay = require("razorpay");
const config   = require("./config");

const razorpay = new Razorpay({
  key_id:     config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

module.exports = razorpay;
