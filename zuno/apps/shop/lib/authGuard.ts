import { createServerSupabaseClient } from "./supabase-server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isDevMockAuthEnabled, DEV_MOCK_AUTH_COOKIE } from "@zuno/config";

export interface ShopkeeperAuthResult {
  userId: string;
  shopId: string;
  isApproved: boolean;
  approvalStatus: string;
  shopName: string;
  shopRole?: "OWNER" | "STAFF";
  isDevMock?: boolean;
}

/**
 * Resolves the authorized shop for an authenticated user across both
 * primary ownership (shops.owner_id) and explicit co-owner/member records
 * (shop_members). Never trusts unverified client IDs without RLS + DB membership.
 */
export async function resolveAuthorizedShopForUser(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  preferredShopId?: string | null
): Promise<{
  shop: {
    id: string;
    name: string;
    phone?: string | null;
    is_approved: boolean;
    approval_status: string | null;
    owner_id: string;
  };
  role: "OWNER" | "STAFF";
} | null> {
  // RLS policy shops_select_owner_or_member returns only shops where user is owner or shop_members row
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, name, phone, is_approved, approval_status, owner_id, created_at")
    .order("is_approved", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !shops || shops.length === 0) {
    return null;
  }

  const chosen =
    (preferredShopId
      ? shops.find((s) => s.id === preferredShopId)
      : undefined) || shops[0];

  if (!chosen) return null;

  if (chosen.owner_id === userId) {
    return { shop: chosen, role: "OWNER" };
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("role")
    .eq("shop_id", chosen.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || (membership.role !== "OWNER" && membership.role !== "STAFF")) {
    return null;
  }

  return { shop: chosen, role: membership.role };
}

/**
 * Server-side authorization guard for Shopkeeper Dashboard.
 *
 * Enforces:
 * 1. Caller MUST possess an active, valid Supabase Auth session, OR
 *    (in local development only with ENABLE_DEV_MOCK_AUTH=true) a validated dev mock session.
 *    If unauthenticated, redirects to /login?redirect=%2Fdashboard.
 * 2. Authenticated user MUST be an authorized owner/member of a shop in public.shops.
 *    If no shop is found for user ID, redirects to /register.
 * 3. Shop MUST have both is_approved = true and approval_status = 'APPROVED'.
 *    If pending, rejected, or suspended, redirects to /status.
 * 4. Never trusts client query params or unauthenticated cookies as identity.
 */
export async function requireApprovedShopkeeper(): Promise<ShopkeeperAuthResult> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // 1. Real Supabase Authenticated User Flow
  if (!userError && user) {
    const userId = user.id;
    const preferredShopId = cookies().get("zuno_active_shop_id")?.value || null;
    const resolved = await resolveAuthorizedShopForUser(
      supabase,
      userId,
      preferredShopId
    );

    if (!resolved) {
      redirect("/register");
    }

    const { shop, role } = resolved;

    // Strict approval check
    const isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
    if (!isApproved) {
      redirect("/status");
    }

    return {
      userId,
      shopId: shop.id,
      isApproved: true,
      approvalStatus: "APPROVED",
      shopName: shop.name,
      shopRole: role,
      isDevMock: false,
    };
  }

  // 2. Local-Development-Only Mock Auth Flow
  // Requirement 2 & 9: Strict production rejection; requires explicit environment flag
  if (process.env.NODE_ENV !== "production" && isDevMockAuthEnabled()) {
    const cookieStore = cookies();
    const rawCookie = cookieStore.get(DEV_MOCK_AUTH_COOKIE)?.value;

    if (rawCookie) {
      try {
        const decoded = rawCookie.startsWith("%") ? decodeURIComponent(rawCookie) : rawCookie;
        const parsed = JSON.parse(decoded);
        if (parsed?.userId && parsed?.shopId) {
          // Query actual database to verify shop ownership and approval
          const { data: shop, error: shopError } = await supabase
            .from("shops")
            .select("id, name, is_approved, approval_status, owner_id")
            .eq("id", parsed.shopId)
            .maybeSingle();

          if (shopError || !shop || shop.owner_id !== parsed.userId) {
            redirect("/register");
          }

          // Requirement 7: Do not bypass approval status
          const isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
          if (!isApproved) {
            redirect("/status");
          }

          return {
            userId: parsed.userId,
            shopId: shop.id,
            isApproved: true,
            approvalStatus: "APPROVED",
            shopName: shop.name,
            isDevMock: true,
          };
        }
      } catch {}
    }
  }

  redirect("/login?redirect=%2Fdashboard");
}
