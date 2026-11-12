import { supabase } from "../../lib/supabase";
import type { ShopOpeningHours } from "@zuno/types";
import {
  evaluateShopAvailability,
  type ShopAvailabilityEvaluation,
} from "@zuno/utils";

export interface ShopData {
  id: string;
  name: string;
  type: string;
  rating: string;
  distance: string;
  locality?: string;
  pincode?: string;
  image?: any;
  color?: string;
  emoji?: string;
  isActive?: boolean;
  isDeliveryAvailable?: boolean;
  openingHours?: ShopOpeningHours | null;
  isOpenNow?: boolean;
  deliveryStatusLabel?: string;
  todayHoursText?: string;
  availability?: ShopAvailabilityEvaluation;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mapPublicStorefrontToShopData(
  row: {
    id: string;
    name: string;
    description?: string | null;
    locality?: string | null;
    pincode?: string | null;
    is_active?: boolean | null;
    is_delivery_available?: boolean | null;
    opening_hours?: ShopOpeningHours | unknown | null;
  },
  idx: number = 0
): ShopData {
  const isActive = Boolean(row.is_active ?? true);
  const isDeliveryAvailable = Boolean(row.is_delivery_available ?? true);
  const availability = evaluateShopAvailability({
    isActive,
    isDeliveryAvailable,
    openingHours: row.opening_hours ?? null,
  });

  return {
    id: row.id,
    name: row.name,
    type: row.description || "General Store",
    rating: "4.5",
    distance: `${(0.5 + idx * 0.3).toFixed(1)} km`,
    locality: row.locality || "Renukoot",
    pincode: row.pincode || "231217",
    color: "#EAF4E5",
    isActive,
    isDeliveryAvailable,
    openingHours: availability.isScheduleValid
      ? ((row.opening_hours as ShopOpeningHours | null) ?? null)
      : null,
    isOpenNow: availability.isOpenNow,
    deliveryStatusLabel: availability.deliveryStatusLabel,
    todayHoursText: availability.todayHoursText,
    availability,
  };
}

export const FALLBACK_SHOPS: ShopData[] = [];

export async function getNearbyShops(): Promise<ShopData[]> {
  try {
    // Query column-safe public_storefronts view (never exposes owner_id, phone, or unapproved shops)
    const { data, error } = await supabase
      .from("public_storefronts")
      .select(
        "id, name, description, locality, pincode, is_active, is_delivery_available, opening_hours"
      )
      .eq("is_active", true);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((s, idx) => mapPublicStorefrontToShopData(s, idx));
  } catch {
    return [];
  }
}

export async function getPublicStorefrontsByIds(
  shopIds: string[]
): Promise<Record<string, ShopData>> {
  const validIds = Array.from(
    new Set(shopIds.filter((id) => UUID_REGEX.test(id)))
  );
  if (validIds.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from("public_storefronts")
      .select(
        "id, name, description, locality, pincode, is_active, is_delivery_available, opening_hours"
      )
      .in("id", validIds);

    if (error || !data) return {};

    const result: Record<string, ShopData> = {};
    data.forEach((row, idx) => {
      result[row.id] = mapPublicStorefrontToShopData(row, idx);
    });
    return result;
  } catch {
    return {};
  }
}

export async function getPublicStorefrontById(
  shopId: string
): Promise<ShopData | null> {
  if (!shopId || !UUID_REGEX.test(shopId)) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("public_storefronts")
      .select(
        "id, name, description, locality, pincode, is_active, is_delivery_available, opening_hours"
      )
      .eq("id", shopId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapPublicStorefrontToShopData(data, 0);
  } catch {
    return null;
  }
}
