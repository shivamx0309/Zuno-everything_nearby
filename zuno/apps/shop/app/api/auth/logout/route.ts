import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEV_MOCK_AUTH_COOKIE } from "@zuno/config";
import { REMEMBER_ME_COOKIE } from "../../../../lib/shop-auth-utils";

const OBSOLETE_DEV_COOKIES = [
  DEV_MOCK_AUTH_COOKIE,
  "zuno_dev_mock_session",
  "sb-mock-auth-token",
  "zuno_dev_session",
  REMEMBER_ME_COOKIE,
];

async function performLogout(request: NextRequest, response: NextResponse) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    });

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[Logout] Error during Supabase signOut:", err);
    }
  }

  // Clear mock auth cookie and legacy development cookies
  for (const cookieName of OBSOLETE_DEV_COOKIES) {
    response.cookies.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true, redirect: "/login" });
  await performLogout(request, response);
  return response;
}

/**
 * Logout is strictly POST-only.
 * GET requests are rejected with HTTP 405 to prevent silent session termination via CSRF/prefetching.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Logout must be initiated via POST." },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    }
  );
}
