import { createBrowserClient } from "@supabase/ssr";

/**
 * Validates and retrieves client-side Supabase configuration.
 * Throws an explicit error if required public environment variables are missing.
 * Embedded fallback credentials have been strictly removed.
 */
function getBrowserSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing required Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createClient(options?: { rememberMe?: boolean }) {
  const { supabaseUrl, supabaseAnonKey } = getBrowserSupabaseConfig();

  // Remember Me OFF: Session cookie (no max-age / expires attribute, cleared upon browser session termination)
  // Remember Me ON (Default): Persistent 30-day session cookie
  if (options && options.rememberMe === false) {
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: {
        maxAge: undefined,
      },
    });
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30, // 30 days persistent session
    },
  });
}
