"use server";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import { revalidatePath } from "next/cache";

export async function getShopSettingsAction(): Promise<{
  shop: {
    id: string;
    name: string;
    locality: string;
    pincode: string;
    phone: string;
    isActive: boolean;
    isDeliveryAvailable: boolean;
    approvalStatus: string;
  };
  pendingCount: number;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch shop info
  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, locality, pincode, phone, is_active, is_delivery_available, approval_status")
    .eq("id", shopId)
    .single();

  const shop = {
    id: shopRow?.id || shopId,
    name: shopRow?.name || auth.shopName,
    locality: shopRow?.locality || "Renukoot",
    pincode: shopRow?.pincode || "231217",
    phone: shopRow?.phone || "",
    isActive: Boolean(shopRow?.is_active ?? true),
    isDeliveryAvailable: Boolean(shopRow?.is_delivery_available ?? true),
    approvalStatus: shopRow?.approval_status || "APPROVED",
  };

  // 2. Pending orders count
  const { count: pendingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "PLACED");

  return {
    shop,
    pendingCount: pendingCount || 0,
  };
}

export async function toggleStoreActiveSettingAction(isActive: boolean): Promise<{ success: boolean }> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("shops")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", auth.shopId);

  if (error) {
    throw new Error(`Failed to update store status: ${error.message}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/shop");
  return { success: true };
}

export async function toggleDeliveryAvailabilitySettingAction(
  isDeliveryAvailable: boolean
): Promise<{ success: boolean; isDeliveryAvailable: boolean; message: string }> {
  if (typeof isDeliveryAvailable !== "boolean") {
    throw new Error("Invalid delivery availability value.");
  }

  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("shops")
    .update({
      is_delivery_available: isDeliveryAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.shopId);

  if (error) {
    throw new Error(`Failed to update delivery availability: ${error.message}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/shop");
  return {
    success: true,
    isDeliveryAvailable,
    message: isDeliveryAvailable
      ? "Delivery enabled."
      : "Delivery paused (storefront remains visible when online).",
  };
}
