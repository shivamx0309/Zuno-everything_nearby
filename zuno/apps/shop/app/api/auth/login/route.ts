import { NextRequest, NextResponse } from "next/server";
import {
  clearObsoleteDevCookies,
  createRouteSupabaseClient,
} from "../../../../lib/supabase-route";
import {
  applyRememberMeCookieOptions,
  deriveShopkeeperSyntheticEmails,
  isNetworkOrUpstreamError,
  normalizeIndianPhone,
  REMEMBER_ME_COOKIE,
  sanitizeRedirectUrl,
} from "../../../../lib/shop-auth-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = body.rememberMe !== false;
    const requestedRedirect =
      typeof body.redirect === "string" ? body.redirect : undefined;

    const normalized = normalizeIndianPhone(rawPhone);
    if (!normalized.valid) {
      return NextResponse.json(
        { success: false, error: normalized.error },
        { status: 400 }
      );
    }

    if (!password || password.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Please enter your password." },
        { status: 400 }
      );
    }

    const { supabase, applyCookies } = createRouteSupabaseClient(request, {
      rememberMe,
    });
    const { candidates } = deriveShopkeeperSyntheticEmails(normalized.clean10);

    let authRes: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null =
      null;

    // Authenticate strictly via synthetic email + password (no phone OTP, no account creation).
    for (const syntheticEmail of candidates) {
      authRes = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password,
      });

      if (!authRes.error && authRes.data?.user) {
        break;
      }

      if (isNetworkOrUpstreamError(authRes.error)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unable to reach authentication service. Please check your internet connection and try again.",
            code: "network_error",
          },
          { status: 503 }
        );
      }

      const errCode = ((authRes.error as any)?.code || "").toLowerCase();
      const errMsg = (authRes.error?.message || "").toLowerCase();
      if (
        errCode === "email_not_confirmed" ||
        errMsg.includes("email not confirmed")
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This account is pending email confirmation in Supabase Auth. Please confirm the user or turn off 'Confirm email' in Supabase Dashboard (Authentication > Providers > Email).",
            code: "email_not_confirmed",
          },
          { status: 403 }
        );
      }
    }

    if (!authRes || authRes.error || !authRes.data?.user || !authRes.data?.session) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid mobile number or password.",
          code: "invalid_credentials",
        },
        { status: 401 }
      );
    }

    // Resolve shop ownership or membership and approval status server-side (RLS-scoped)
    const { data: shops } = await supabase
      .from("shops")
      .select("id, name, is_approved, approval_status, owner_id, created_at")
      .order("is_approved", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const shop = shops?.[0] || null;

    let redirect = "/register";
    let isApproved = false;
    let approvalStatus = "UNREGISTERED";

    if (shop) {
      isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
      approvalStatus =
        shop.approval_status || (shop.is_approved ? "APPROVED" : "PENDING");
      redirect = isApproved
        ? sanitizeRedirectUrl(requestedRedirect)
        : "/status";
    }

    const response = NextResponse.json({
      success: true,
      redirect,
      isApproved,
      approvalStatus,
    });

    applyCookies(response);
    clearObsoleteDevCookies(response);

    response.cookies.set({
      name: REMEMBER_ME_COOKIE,
      value: rememberMe ? "1" : "0",
      ...applyRememberMeCookieOptions(
        {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        },
        rememberMe
      ),
    });

    return response;
  } catch (err: any) {
    if (isNetworkOrUpstreamError(err)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to reach authentication service. Please check your internet connection and try again.",
          code: "network_error",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "Unable to sign in right now. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST to sign in." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

