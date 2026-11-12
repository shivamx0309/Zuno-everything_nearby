import { createClient } from "../../lib/supabase";
import { normalizePhoneE164 } from "@zuno/validation";
import {
  normalizeIndianPhone,
  sanitizeRedirectUrl,
  validateShopkeeperPassword,
} from "../../lib/shop-auth-utils";

export { sanitizeRedirectUrl };

export interface ShopkeeperAccount {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  role: "SHOPKEEPER";
  shopId?: string;
  shopName?: string;
  isApproved: boolean;
  approvalStatus: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
}

export interface RegisterShopInput {
  ownerFullName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  shopName: string;
  description?: string;
  addressLine: string;
  locality: string;
  pincode: string;
}

/**
 * Authenticates a shopkeeper via Indian mobile number + password through the server-side
 * login endpoint (derives synthetic email server-side and manages SSR session cookies).
 */
export async function loginWithPassword(
  phone: string,
  password: string,
  options?: { rememberMe?: boolean; redirect?: string }
): Promise<{
  success: boolean;
  redirect?: string;
  isApproved?: boolean;
  approvalStatus?: string;
  error?: string;
  code?: string;
}> {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized.valid) {
    return {
      success: false,
      error: normalized.error || "Please enter a valid 10-digit Indian mobile number.",
    };
  }
  if (!password || password.trim().length === 0) {
    return { success: false, error: "Please enter your password." };
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: normalized.clean10,
        password,
        rememberMe: options?.rememberMe ?? true,
        redirect: options?.redirect,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || "Invalid mobile number or password.",
        code: data?.code,
      };
    }

    return {
      success: true,
      redirect: data.redirect || "/dashboard",
      isApproved: Boolean(data.isApproved),
      approvalStatus: data.approvalStatus,
    };
  } catch {
    return {
      success: false,
      error: "Unable to reach authentication service. Please check your connection.",
      code: "network_error",
    };
  }
}

/**
 * Updates the password for the currently authenticated shopkeeper session.
 */
export async function setShopkeeperPassword(
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const check = validateShopkeeperPassword(newPassword);
  if (!check.valid) {
    return { success: false, error: check.error };
  }
  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: "Passwords do not match. Please re-enter.",
    };
  }

  try {
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || "Failed to update password.",
      };
    }
    return {
      success: true,
      message: data.message || "Password updated successfully.",
    };
  } catch {
    return {
      success: false,
      error: "Network error while updating password.",
    };
  }
}

/**
 * Resolves the authenticated user's shop record and approval status from Supabase.
 */
export async function resolveShopApproval(userId: string): Promise<{
  shop: any | null;
  isApproved: boolean;
  approvalStatus: string;
}> {
  const supabase = createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, is_approved, approval_status, owner_id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (!shop) {
    return { shop: null, isApproved: false, approvalStatus: "UNREGISTERED" };
  }

  const isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
  return {
    shop,
    isApproved,
    approvalStatus: shop.approval_status || (shop.is_approved ? "APPROVED" : "PENDING"),
  };
}

/**
 * Registers a new shopkeeper account with password and submits the PENDING shop application.
 */
export async function registerShopkeeper(input: RegisterShopInput): Promise<{
  shopId: string;
  shopName: string;
  approvalStatus: "PENDING";
  requiresConfirmation: boolean;
  redirect: string;
}> {
  const normalized = normalizeIndianPhone(input.phone);
  if (!normalized.valid) {
    throw new Error(normalized.error || "Please enter a valid 10-digit Indian mobile number.");
  }

  const passwordCheck = validateShopkeeperPassword(input.password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.error || "Please enter a stronger password.");
  }

  if (input.password !== input.confirmPassword) {
    throw new Error("Passwords do not match. Please re-enter.");
  }

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      phone: normalized.clean10,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(
      data?.error || "Unable to complete shop registration. Please verify your details."
    );
  }

  return {
    shopId: data.shopId,
    shopName: data.shopName || input.shopName,
    approvalStatus: "PENDING",
    requiresConfirmation: Boolean(data.requiresConfirmation),
    redirect: data.redirect || "/status?registered=true",
  };
}

/**
 * Fetches the authenticated shopkeeper's application status from the server-side
 * session endpoint (/api/auth/status). Never queries shops by unauthenticated phone.
 */
export async function getCurrentShopkeeper(): Promise<ShopkeeperAccount | null> {
  try {
    const res = await fetch("/api/auth/status", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json().catch(() => ({}));
    return data?.shop || null;
  } catch (err) {
    console.warn("[ShopAuth] Error fetching current shopkeeper:", err);
  }

  return null;
}
