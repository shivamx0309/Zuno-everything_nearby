import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDevMockAuthEnabled, DEV_MOCK_AUTH_COOKIE } from "@zuno/config";
import {
  applyRememberMeCookieOptions,
  REMEMBER_ME_COOKIE,
} from "./lib/shop-auth-utils";

const PUBLIC_ROUTES = ["/login", "/register", "/status"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // Static assets and internal routes bypass
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return response;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[Middleware] Missing required Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined."
    );
    return new NextResponse(
      JSON.stringify({
        error: "Server configuration error: Supabase environment variables missing.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const rememberMe = request.cookies.get(REMEMBER_ME_COOKIE)?.value !== "0";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        const shaped = applyRememberMeCookieOptions(options, rememberMe);
        request.cookies.set({ name, value, ...shaped });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...shaped });
      },
      remove(name: string, options: any) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // Verify authenticated identity via Supabase auth.getUser()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  let isAuthenticated = !userError && Boolean(user);

  // In non-production only, support development mock session cookie
  if (!isAuthenticated && process.env.NODE_ENV !== "production") {
    if (isDevMockAuthEnabled()) {
      const rawCookie = request.cookies.get(DEV_MOCK_AUTH_COOKIE)?.value;
      if (rawCookie) {
        try {
          const decoded = rawCookie.startsWith("%") ? decodeURIComponent(rawCookie) : rawCookie;
          const parsed = JSON.parse(decoded);
          if (parsed?.userId && parsed?.shopId) {
            isAuthenticated = true;
          }
        } catch {}
      }
    }
  }

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // If not logged in and requesting a protected dashboard route, redirect to /login
  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const phone = request.nextUrl.searchParams.get("phone");
    if (phone) {
      loginUrl.searchParams.set("phone", phone);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If logged in and visiting /login, redirect to dashboard
  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
