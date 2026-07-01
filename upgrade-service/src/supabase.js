"use strict";

/**
 * supabase.js
 * Initialise the Supabase client using the Service Role Key.
 *
 * The Service Role Key bypasses Row Level Security (RLS) so the server can
 * freely read and write user records without being constrained by user-level
 * policies.  NEVER expose this key to the frontend or any public client.
 */

const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      // Disable auto-refresh — the service role token never expires.
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
);

module.exports = supabase;
