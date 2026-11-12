"use server";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";

export interface CategoryDistribution {
  category: string;
  itemCount: number;
  totalStock: number;
}

export interface AnalyticsData {
  shop: {
    id: string;
    name: string;
    locality: string;
    pincode: string;
    isActive: boolean;
  };
  pendingCount: number;
  metrics: {
    totalOrders: number;
    deliveredOrders: number;
    activeOrders: number;
    cancelledOrders: number;
    fulfillmentRate: number;
    totalStockUnits: number;
  };
  categoryDistribution: CategoryDistribution[];
}

export async function getShopAnalyticsAction(): Promise<AnalyticsData> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch shop info
  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, locality, pincode, is_active")
    .eq("id", shopId)
    .single();

  const shop = {
    id: shopRow?.id || shopId,
    name: shopRow?.name || auth.shopName,
    locality: shopRow?.locality || "Renukoot",
    pincode: shopRow?.pincode || "231217",
    isActive: Boolean(shopRow?.is_active ?? true),
  };

  // 2. Fetch orders
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("shop_id", shopId);

  if (ordersErr) {
    console.error("[Analytics] Order analytics query error:", ordersErr.code, ordersErr.message);
  }

  let totalOrders = 0;
  let deliveredOrders = 0;
  let activeOrders = 0;
  let cancelledOrders = 0;
  let pendingCount = 0;

  if (orders) {
    totalOrders = orders.length;
    for (const o of orders) {
      if (o.status === "DELIVERED") {
        deliveredOrders++;
      } else if (o.status === "CANCELLED" || o.status === "REJECTED") {
        cancelledOrders++;
      } else {
        activeOrders++;
        if (o.status === "PLACED") {
          pendingCount++;
        }
      }
    }
  }

  const fulfillmentRate =
    totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;

  // 3. Fetch inventory categories distribution
  const { data: spRows } = await supabase
    .from("shop_products")
    .select(`
      stock,
      products (
        categories (
          name
        )
      )
    `)
    .eq("shop_id", shopId);

  let totalStockUnits = 0;
  const categoryMap = new Map<string, { itemCount: number; totalStock: number }>();

  if (spRows) {
    for (const sp of spRows as any[]) {
      const stock = Number(sp.stock || 0);
      totalStockUnits += stock;
      const catName = sp.products?.categories?.name || "General Essentials";
      const existing = categoryMap.get(catName) || { itemCount: 0, totalStock: 0 };
      existing.itemCount++;
      existing.totalStock += stock;
      categoryMap.set(catName, existing);
    }
  }

  const categoryDistribution: CategoryDistribution[] = Array.from(categoryMap.entries()).map(
    ([category, stats]) => ({
      category,
      itemCount: stats.itemCount,
      totalStock: stats.totalStock,
    })
  );

  return {
    shop,
    pendingCount,
    metrics: {
      totalOrders,
      deliveredOrders,
      activeOrders,
      cancelledOrders,
      fulfillmentRate,
      totalStockUnits,
    },
    categoryDistribution,
  };
}
