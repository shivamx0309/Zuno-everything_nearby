import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { DEV_MOCK_AUTH_COOKIE } from "@zuno/config";
import { applyRememberMeCookieOptions } from "./shop-auth-utils";
import { resilientServerFetch } from "./server-fetch";

export const OBSOLETE_DEV_COOKIES = [
  DEV_MOCK_AUTH_COOKIE,
  "zuno_dev_mock_session",
  "sb-mock-auth-token",
  "zuno_dev_session",
];

export function getRouteSupabaseConfig() {
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

/**
 * Creates a Supabase SSR client for Next.js Route Handlers that buffers cookie mutations
 * so the caller can construct the final NextResponse (after resolving DB state) and
 * apply all session cookies consistently with Remember Me lifetime rules.
 */
export function createRouteSupabaseClient(
  request: NextRequest,
  options?: { rememberMe?: boolean }
) {
  const { supabaseUrl, supabaseAnonKey } = getRouteSupabaseConfig();
  const rememberMe = options?.rememberMe ?? true;
  const pendingCookies = new Map<
    string,
    { name: string; value: string; options: Record<string, any> }
  >();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: resilientServerFetch,
    },
    cookies: {
      get(name: string) {
        return pendingCookies.get(name)?.value ?? request.cookies.get(name)?.value;
      },
      set(name: string, value: string, cookieOpts: any) {
        pendingCookies.set(name, {
          name,
          value,
          options: applyRememberMeCookieOptions(cookieOpts, rememberMe),
        });
      },
      remove(name: string, cookieOpts: any) {
        pendingCookies.set(name, {
          name,
          value: "",
          options: { ...(cookieOpts || {}), maxAge: 0 },
        });
      },
    },
  });

  function applyCookies(response: NextResponse) {
    for (const cookie of pendingCookies.values()) {
      response.cookies.set({
        name: cookie.name,
        value: cookie.value,
        ...cookie.options,
      });
    }
    return response;
  }

  return { supabase, applyCookies };
}

export function clearObsoleteDevCookies(response: NextResponse) {
  for (const cookieName of OBSOLETE_DEV_COOKIES) {
    response.cookies.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }
}
