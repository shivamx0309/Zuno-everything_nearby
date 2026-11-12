import { NextRequest, NextResponse } from "next/server";
import { createRouteSupabaseClient } from "../../../../lib/supabase-route";
import {
  REMEMBER_ME_COOKIE,
  validateShopkeeperPassword,
} from "../../../../lib/shop-auth-utils";

/**
 * Allows an ALREADY AUTHENTICATED shopkeeper (verified via Supabase Auth getUser())
 * to set or update their account password without OTP or admin intervention.
 * Unauthenticated requests and dev-mock sessions are strictly rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    const passwordCheck = validateShopkeeperPassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, error: passwordCheck.error },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match. Please re-enter." },
        { status: 400 }
      );
    }

    const rememberMe = request.cookies.get(REMEMBER_ME_COOKIE)?.value !== "0";
    const { supabase, applyCookies } = createRouteSupabaseClient(request, {
      rememberMe,
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication required. Please sign in or contact ZUNO Admin to set up your password.",
        },
        { status: 401 }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: updateError.message || "Failed to update password.",
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
    applyCookies(response);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to update password right now." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST to update password." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

