import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  applyRememberMeCookieOptions,
  REMEMBER_ME_COOKIE,
} from "./shop-auth-utils";
import { resilientServerFetch } from "./server-fetch";

/**
 * Validates and retrieves server-side Supabase configuration.
 * Throws an explicit error if required environment variables are missing.
 * Embedded fallback credentials have been strictly removed.
 */
function getServerSupabaseConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing required Supabase server configuration: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY must be defined."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

// SERVER-ONLY. Reads user session from request cookies and respects RLS.
export function createServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getServerSupabaseConfig();
  const cookieStore = cookies();
  const rememberMe = cookieStore.get(REMEMBER_ME_COOKIE)?.value !== "0";
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: resilientServerFetch,
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          const shaped = applyRememberMeCookieOptions(options, rememberMe);
          cookieStore.set({ name, value, ...shaped });
        } catch {}
      },
      remove(name: string, options: any) {
        try {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        } catch {}
      },
    },
  });
}
