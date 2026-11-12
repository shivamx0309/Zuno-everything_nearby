"use server";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import { validateShopProfileUpdate } from "../../lib/shop-profile-validation";
import type { ShopOpeningHours, ShopWeekday } from "@zuno/types";
import {
  normalizeShopOpeningHoursForEditor,
  validateShopOpeningHours,
} from "@zuno/utils";
import { revalidatePath } from "next/cache";

export interface ShopProfileData {
  id: string;
  name: string;
  description: string;
  phone: string;
  addressLine: string;
  locality: string;
  pincode: string;
  isActive: boolean;
  isDeliveryAvailable: boolean;
  openingHours: ShopOpeningHours;
  approvalStatus: string;
  isApproved: boolean;
  createdAt: string;
}

export async function getShopProfileAction(): Promise<{
  shop: ShopProfileData;
  pendingCount: number;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch shop row
  const { data: shopRow, error: shopErr } = await supabase
    .from("shops")
    .select(
      "id, name, description, phone, address_line, locality, pincode, is_active, is_delivery_available, opening_hours, approval_status, is_approved, created_at"
    )
    .eq("id", shopId)
    .single();

  if (shopErr || !shopRow) {
    throw new Error("Failed to load shop profile data.");
  }

  // 2. Pending orders count
  const { count: pendingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "PLACED");

  return {
    shop: {
      id: shopRow.id,
      name: shopRow.name,
      description: shopRow.description || "",
      phone: shopRow.phone || "",
      addressLine: shopRow.address_line || "",
      locality: shopRow.locality || "Renukoot",
      pincode: shopRow.pincode || "231217",
      isActive: Boolean(shopRow.is_active ?? true),
      isDeliveryAvailable: Boolean(shopRow.is_delivery_available ?? true),
      openingHours: normalizeShopOpeningHoursForEditor(shopRow.opening_hours),
      approvalStatus: shopRow.approval_status || "APPROVED",
      isApproved: Boolean(shopRow.is_approved ?? true),
      createdAt: shopRow.created_at || new Date().toISOString(),
    },
    pendingCount: pendingCount || 0,
  };
}

export async function updateShopProfileAction(data: {
  name: string;
  description: string;
  phone: string;
  addressLine: string;
  locality: string;
}): Promise<{
  success: boolean;
  message: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  const auth = await requireApprovedShopkeeper();
  const validation = validateShopProfileUpdate(data);

  if (!validation.success) {
    return {
      success: false,
      message: validation.error,
      error: validation.error,
      fieldErrors: validation.fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();
  const { name, description, phone, addressLine, locality } = validation.data;

  const { error } = await supabase
    .from("shops")
    .update({
      name,
      description,
      phone,
      address_line: addressLine,
      locality,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.shopId);

  if (error) {
    console.error("[ShopProfile] Profile update error:", error.code, error.message);
    return {
      success: false,
      message: `Failed to update profile: ${error.message}`,
      error: `Failed to update profile: ${error.message}`,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/shop");
  return { success: true, message: "Shop profile updated successfully." };
}

/**
 * Server Action: Updates weekly opening hours for the authenticated shopkeeper's shop.
 * Validates 24-hour times server-side and strictly scopes UPDATE to auth.shopId.
 */
export async function updateShopOpeningHoursAction(
  openingHoursInput: unknown
): Promise<{
  success: boolean;
  message: string;
  error?: string;
  dayErrors?: Partial<Record<ShopWeekday, string>>;
  openingHours?: ShopOpeningHours;
}> {
  const auth = await requireApprovedShopkeeper();
  const validation = validateShopOpeningHours(openingHoursInput);

  if (!validation.valid) {
    return {
      success: false,
      message: validation.error,
      error: validation.error,
      dayErrors: validation.dayErrors,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("shops")
    .update({
      opening_hours: validation.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.shopId);

  if (error) {
    console.error("[ShopProfile] Opening hours update error:", error.code, error.message);
    return {
      success: false,
      message: `Failed to save opening hours: ${error.message}`,
      error: `Failed to save opening hours: ${error.message}`,
    };
  }

  revalidatePath("/shop");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return {
    success: true,
    message: "Weekly opening hours updated successfully.",
    openingHours: validation.data,
  };
}

/**
 * Server Action: Updates only shops.is_delivery_available for auth.shopId.
 * Preserves shops.is_active storefront visibility independently.
 */
export async function toggleDeliveryAvailabilityAction(
  isDeliveryAvailable: boolean
): Promise<{
  success: boolean;
  isDeliveryAvailable: boolean;
  message: string;
  error?: string;
}> {
  if (typeof isDeliveryAvailable !== "boolean") {
    return {
      success: false,
      isDeliveryAvailable: false,
      message: "Invalid delivery availability flag.",
      error: "Invalid delivery availability flag.",
    };
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
    console.error("[ShopProfile] Delivery toggle error:", error.code, error.message);
    return {
      success: false,
      isDeliveryAvailable: !isDeliveryAvailable,
      message: `Failed to update delivery availability: ${error.message}`,
      error: `Failed to update delivery availability: ${error.message}`,
    };
  }

  revalidatePath("/shop");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return {
    success: true,
    isDeliveryAvailable,
    message: isDeliveryAvailable
      ? "Delivery is now enabled for customers."
      : "Delivery temporarily paused. Your storefront remains visible.",
  };
}
