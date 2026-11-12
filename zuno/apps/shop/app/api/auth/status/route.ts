import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDevMockAuthEnabled, DEV_MOCK_AUTH_COOKIE } from "@zuno/config";
import { createRouteSupabaseClient } from "../../../../lib/supabase-route";

/**
 * Returns the shop application status strictly for the currently authenticated
 * shopkeeper session (via supabase.auth.getUser()).
 *
 * Security invariants:
 * - Never accepts phone numbers, shop IDs, or user IDs from query params or body.
 * - Never exposes service-role credentials.
 * - Returns HTTP 401 when unauthenticated to prevent shop/phone enumeration.
 */
export async function GET(request: NextRequest) {
  const { supabase } = createRouteSupabaseClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!userError && user) {
    const { data: shops, error: shopErr } = await supabase
      .from("shops")
      .select("id, name, phone, is_approved, approval_status, owner_id, created_at")
      .order("is_approved", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const shop = shops?.[0] || null;

    if (shopErr) {
      return NextResponse.json(
        {
          authenticated: true,
          shop: null,
          error: "Unable to load application status right now.",
        },
        { status: 500 }
      );
    }

    if (!shop) {
      return NextResponse.json({
        authenticated: true,
        shop: null,
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      authenticated: true,
      shop: {
        id: shop.id,
        userId: user.id,
        fullName: profile?.full_name || "Shop Owner",
        phone: shop.phone || profile?.phone || "",
        role: "SHOPKEEPER" as const,
        shopId: shop.id,
        shopName: shop.name,
        isApproved: Boolean(shop.is_approved),
        approvalStatus:
          shop.approval_status || (shop.is_approved ? "APPROVED" : "PENDING"),
      },
    });
  }

  // Strictly non-production dev mock session support (no query-param lookup)
  if (process.env.NODE_ENV !== "production" && isDevMockAuthEnabled()) {
    const rawCookie = cookies().get(DEV_MOCK_AUTH_COOKIE)?.value;
    if (rawCookie) {
      try {
        const decoded = rawCookie.startsWith("%")
          ? decodeURIComponent(rawCookie)
          : rawCookie;
        const parsed = JSON.parse(decoded);
        if (parsed?.userId && parsed?.shopId) {
          const { data: shop } = await supabase
            .from("shops")
            .select("id, name, phone, is_approved, approval_status, owner_id")
            .eq("id", parsed.shopId)
            .maybeSingle();

          if (shop && shop.owner_id === parsed.userId) {
            return NextResponse.json({
              authenticated: true,
              shop: {
                id: shop.id,
                userId: parsed.userId,
                fullName: "Shop Owner",
                phone: shop.phone || "",
                role: "SHOPKEEPER" as const,
                shopId: shop.id,
                shopName: shop.name,
                isApproved: Boolean(shop.is_approved),
                approvalStatus:
                  shop.approval_status ||
                  (shop.is_approved ? "APPROVED" : "PENDING"),
              },
            });
          }
        }
      } catch {}
    }
  }

  return NextResponse.json(
    {
      authenticated: false,
      shop: null,
      error: "Authentication required to view shop application status.",
    },
    { status: 401 }
  );
}

