"use server";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import { computeDashboardInventoryMetrics } from "../../lib/dashboard-inventory-metrics";
import { updateShopOrderStatusAction as updateShopOrderStatusCanonical } from "../orders/actions";
import { revalidatePath } from "next/cache";

export interface DashboardMetricSummary {
  todayRevenue: number;
  todayOrdersCount: number;
  fulfilledOrdersCount: number;
  pendingOrdersCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalListedProductsCount: number;
}

export interface DashboardOrderSummary {
  id: string;
  displayId: string;
  customerName: string;
  itemsSummary: string;
  amount: number;
  status: string;
  createdAt: string;
  timeAgo: string;
}

export interface DashboardDeliveryRiderSummary {
  fullName: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  orderDisplayId: string;
  status: string;
}

export interface DashboardProductSummary {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  unit: string;
  stock: number;
  isAvailable: boolean;
  imageUrl?: string | null;
}

export interface DashboardData {
  shop: {
    id: string;
    name: string;
    description: string;
    phone: string;
    addressLine: string;
    locality: string;
    pincode: string;
    isActive: boolean;
    approvalStatus: string;
    isApproved: boolean;
  };
  metrics: DashboardMetricSummary;
  recentOrders: DashboardOrderSummary[];
  assignedRider: DashboardDeliveryRiderSummary | null;
  featuredProducts: DashboardProductSummary[];
  error?: string;
}

interface DashboardOrderContextRow {
  order_id: string;
  customer_name: string | null;
  delivery_status: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_vehicle_type: string | null;
  rider_vehicle_number: string | null;
}

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } catch {
    return "Recently";
  }
}

/**
 * Server Action: Fetches real, persisted data for the authenticated shopkeeper.
 * Strictly scoped to the authenticated user's shop in Supabase.
 */
export async function getShopDashboardDataAction(): Promise<DashboardData> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch live Shop Profile
  const { data: shopRow } = await supabase
    .from("shops")
    .select(
      "id, name, description, phone, address_line, locality, pincode, is_active, approval_status, is_approved"
    )
    .eq("id", shopId)
    .single();

  const shop = {
    id: shopRow?.id || shopId,
    name: shopRow?.name || auth.shopName,
    description: shopRow?.description || "",
    phone: shopRow?.phone || "",
    addressLine: shopRow?.address_line || "",
    locality: shopRow?.locality || "Renukoot",
    pincode: shopRow?.pincode || "231217",
    isActive: Boolean(shopRow?.is_active ?? true),
    approvalStatus: shopRow?.approval_status || "APPROVED",
    isApproved: Boolean(shopRow?.is_approved ?? true),
  };

  // 2. Fetch live Orders KPIs and Recent Orders (separate KPI query avoids limit(20) truncation)
  let recentOrders: DashboardOrderSummary[] = [];
  let todayRevenue = 0;
  let todayOrdersCount = 0;
  let fulfilledOrdersCount = 0;
  let pendingOrdersCount = 0;
  let assignedRider: DashboardDeliveryRiderSummary | null = null;
  let dashboardError: string | undefined;

  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const [todayKpiRes, pendingKpiRes, recentRes, stockSummaryRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, subtotal")
      .eq("shop_id", shopId)
      .gte("created_at", startOfDay),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .in("status", ["PLACED", "ACCEPTED", "PREPARING"]),
    supabase
      .from("orders")
      .select(`
        id,
        status,
        subtotal,
        delivery_fee,
        total,
        created_at,
        customer_id,
        order_items (
          id,
          product_name_snapshot,
          quantity,
          subtotal
        )
      `)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("shop_products")
      .select("id, product_id, stock")
      .eq("shop_id", shopId),
  ]);

  if (todayKpiRes.error || pendingKpiRes.error || recentRes.error) {
    const err = todayKpiRes.error || pendingKpiRes.error || recentRes.error;
    console.error(
      "[Dashboard] Error querying shop orders:",
      err?.code || "UNKNOWN",
      err?.message || "Query failed"
    );
    dashboardError =
      "Unable to load live order metrics right now. Please retry.";
  } else {
    for (const o of todayKpiRes.data || []) {
      todayOrdersCount++;
      // Keep merchant merchandise revenue (subtotal) separate from customer delivery_fee
      if (o.status !== "CANCELLED" && o.status !== "REJECTED") {
        todayRevenue += Number(o.subtotal || 0);
      }
      if (o.status === "DELIVERED") {
        fulfilledOrdersCount++;
      }
    }

    pendingOrdersCount = pendingKpiRes.count || 0;

    const ordersData = recentRes.data || [];
    const contextMap = new Map<string, DashboardOrderContextRow>();

    if (ordersData.length > 0) {
      const orderIds = ordersData.map((o: any) => o.id);
      const { data: ctxRows, error: ctxErr } = await supabase.rpc(
        "get_shop_order_fulfillment_context",
        {
          p_shop_id: shopId,
          p_order_ids: orderIds,
        }
      );

      if (ctxErr) {
        console.warn(
          "[Dashboard] Scoped fulfillment context RPC unavailable:",
          ctxErr.code,
          ctxErr.message
        );
      } else if (Array.isArray(ctxRows)) {
        for (const row of ctxRows as DashboardOrderContextRow[]) {
          if (row?.order_id) {
            contextMap.set(row.order_id, row);
          }
        }
      }
    }

    for (const order of ordersData as any[]) {
      const items = order.order_items || [];
      const itemsSummary =
        items.length > 0
          ? `${items.length} item${items.length > 1 ? "s" : ""} (${items
              .slice(0, 3)
              .map((i: any) => `${i.product_name_snapshot} × ${i.quantity}`)
              .join(", ")}${items.length > 3 ? "..." : ""})`
          : "No item details";

      const ctx = contextMap.get(order.id);
      const customerName = ctx?.customer_name || "Verified Customer";

      if (
        !assignedRider &&
        ctx?.rider_name &&
        ["ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(
          ctx.delivery_status || ""
        )
      ) {
        assignedRider = {
          fullName: ctx.rider_name,
          phone: ctx.rider_phone || "",
          vehicleType: ctx.rider_vehicle_type || "Two Wheeler",
          vehicleNumber: ctx.rider_vehicle_number || "",
          orderDisplayId: `#ZN-${order.id.slice(0, 6).toUpperCase()}`,
          status: ctx.delivery_status || "ASSIGNED",
        };
      }

      recentOrders.push({
        id: order.id,
        displayId: `#ZN-${order.id.slice(0, 6).toUpperCase()}`,
        customerName,
        itemsSummary,
        amount: Number(order.subtotal || 0),
        status: order.status,
        createdAt: order.created_at,
        timeAgo: formatTimeAgo(order.created_at),
      });
    }
  }

  // 3. Fetch live Shop Products & Inventory
  let featuredProducts: DashboardProductSummary[] = [];
  const { data: spData, error: spErr } = await supabase
    .from("shop_products")
    .select(`
      id,
      price,
      stock,
      available,
      products (
        id,
        name,
        unit,
        image_url,
        categories (
          name
        )
      )
    `)
    .eq("shop_id", shopId)
    .order("stock", { ascending: false })
    .limit(8);

  if (spErr) {
    console.error(
      "[Dashboard] Error querying shop products:",
      spErr.code,
      spErr.message
    );
    if (!dashboardError) {
      dashboardError =
        "Unable to load storefront inventory right now. Please retry.";
    }
  } else if (Array.isArray(spData)) {
    featuredProducts = spData
      .filter((sp: any) => sp.products)
      .map((sp: any) => ({
        id: sp.id,
        name: sp.products.name,
        categoryName: sp.products.categories?.name || "General",
        price: Number(sp.price || 0),
        unit: sp.products.unit || "unit",
        stock: Number(sp.stock || 0),
        isAvailable: Boolean(sp.available && sp.stock > 0),
        imageUrl: sp.products.image_url,
      }));
  }

  if (stockSummaryRes.error) {
    console.error(
      "[Dashboard] Error querying shop inventory summary:",
      stockSummaryRes.error.code,
      stockSummaryRes.error.message
    );
    if (!dashboardError) {
      dashboardError =
        "Unable to load inventory summary metrics right now. Please retry.";
    }
  }

  const inventoryMetrics = stockSummaryRes.error
    ? { lowStockCount: 0, outOfStockCount: 0, totalListedCount: 0 }
    : computeDashboardInventoryMetrics(stockSummaryRes.data);

  return {
    shop,
    metrics: {
      todayRevenue,
      todayOrdersCount,
      fulfilledOrdersCount,
      pendingOrdersCount,
      lowStockCount: inventoryMetrics.lowStockCount,
      outOfStockCount: inventoryMetrics.outOfStockCount,
      totalListedProductsCount: inventoryMetrics.totalListedCount,
    },
    recentOrders,
    assignedRider,
    featuredProducts,
    error: dashboardError,
  };
}

/**
 * Server Action: Toggles live store active status in public.shops.
 */
export async function toggleShopOnlineStatusAction(
  isActive: boolean
): Promise<{ success: boolean; isActive: boolean }> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("shops")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", auth.shopId);

  if (error) {
    console.error("[Dashboard] Store status toggle error:", error.code, error.message);
    throw new Error("Unable to update store availability right now.");
  }

  revalidatePath("/dashboard");
  return { success: true, isActive: Boolean(isActive) };
}

/**
 * Server Action: Updates order status for an order belonging to the authenticated shop.
 * Delegates to canonical transition-validated order action.
 */
export async function updateShopOrderStatusAction(
  orderId: string,
  nextStatus: string
): Promise<{ success: boolean; message: string }> {
  return updateShopOrderStatusCanonical(orderId, nextStatus);
}
