import { NextRequest, NextResponse } from "next/server";
import { isDevMockAuthEnabled, DEV_MOCK_AUTH_COOKIE } from "@zuno/config";
import { normalizePhoneE164 } from "@zuno/validation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export async function POST(request: NextRequest) {
  // Requirement 2 & 9: Reject if in production or if flag is disabled
  if (process.env.NODE_ENV === "production" || !isDevMockAuthEnabled()) {
    return NextResponse.json(
      { error: "Development mock authentication is strictly prohibited in production." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawPhone = body.phone || "";
    const clean10 = rawPhone.replace(/\D/g, "").slice(-10) || "8887602317";
    const formattedPhone = normalizePhoneE164(clean10);

    const supabase = createServerSupabaseClient();

    // Verify shop record in actual database server-side
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, name, is_approved, approval_status, owner_id, phone")
      .or(`phone.eq.${formattedPhone},phone.eq.${clean10}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !shop) {
      return NextResponse.json(
        {
          success: false,
          error: `No shop found for mobile number ${clean10}. Please register your shop first.`,
          redirect: `/register`,
        },
        { status: 404 }
      );
    }

    // Requirement 7: Enforce server-side shop approval check; do not bypass approval status
    const isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
    const redirectUrl = isApproved ? "/dashboard" : "/status";

    const sessionPayload = {
      userId: shop.owner_id,
      shopId: shop.id,
      shopName: shop.name,
      phone: clean10,
      role: "SHOPKEEPER" as const, // Never ADMIN or SUPER_ADMIN
      createdAt: Date.now(),
    };

    const response = NextResponse.json({
      success: true,
      shopName: shop.name,
      isApproved,
      approvalStatus: shop.approval_status,
      redirect: redirectUrl,
    });

    // Set secure development mock session cookie
    response.cookies.set({
      name: DEV_MOCK_AUTH_COOKIE,
      value: JSON.stringify(sessionPayload),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to process development mock login." },
      { status: 500 }
    );
  }
}
