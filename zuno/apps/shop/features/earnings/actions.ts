"use server";

import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";

export interface TransactionSummary {
  id: string;
  displayId: string;
  createdAt: string;
  customerName: string;
  merchandiseSubtotal: number;
  deliveryFee: number;
  customerTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
}

interface FulfillmentContextSummary {
  order_id: string;
  customer_name: string | null;
  payment_method: string | null;
  payment_status: string | null;
}

export async function getShopEarningsAction(): Promise<{
  shop: {
    id: string;
    name: string;
    locality: string;
    pincode: string;
    isActive: boolean;
  };
  pendingCount: number;
  metrics: {
    grossMerchandiseRevenue: number;
    todayMerchandiseRevenue: number;
    deliveredMerchandiseValue: number;
    totalDeliveryFees: number;
    completedOrdersCount: number;
    averageOrderValue: number;
  };
  settlementSupported: boolean;
  transactions: TransactionSummary[];
  error?: string;
}> {
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

  // 2. Query orders using strictly verified schema columns (never non-existent payment_* cols)
  const { data: ordersRows, error: ordersErr } = await supabase
    .from("orders")
    .select(`
      id,
      customer_id,
      status,
      subtotal,
      delivery_fee,
      total,
      created_at
    `)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (ordersErr || !ordersRows) {
    console.error(
      "[Earnings] Database query error:",
      ordersErr?.code || "UNKNOWN",
      ordersErr?.message || "Missing response"
    );
    return {
      shop,
      pendingCount: 0,
      metrics: {
        grossMerchandiseRevenue: 0,
        todayMerchandiseRevenue: 0,
        deliveredMerchandiseValue: 0,
        totalDeliveryFees: 0,
        completedOrdersCount: 0,
        averageOrderValue: 0,
      },
      settlementSupported: false,
      transactions: [],
      error: "Unable to load order earnings right now. Please try refreshing.",
    };
  }

  // 3. Enrich with least-privilege customer name and payment status/method from payments relation
  const ctxMap = new Map<string, FulfillmentContextSummary>();
  if (ordersRows.length > 0) {
    const orderIds = ordersRows.map((o: any) => o.id);
    const { data: ctxRows, error: ctxErr } = await supabase.rpc(
      "get_shop_order_fulfillment_context",
      {
        p_shop_id: shopId,
        p_order_ids: orderIds,
      }
    );
    if (ctxErr) {
      console.warn(
        "[Earnings] Scoped fulfillment context RPC unavailable:",
        ctxErr.code,
        ctxErr.message
      );
    } else if (Array.isArray(ctxRows)) {
      for (const row of ctxRows as FulfillmentContextSummary[]) {
        if (row?.order_id) {
          ctxMap.set(row.order_id, row);
        }
      }
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let grossMerchandiseRevenue = 0;
  let todayMerchandiseRevenue = 0;
  let deliveredMerchandiseValue = 0;
  let totalDeliveryFees = 0;
  let completedOrdersCount = 0;
  let pendingCount = 0;

  const transactions: TransactionSummary[] = ordersRows.map((row: any) => {
    const merchandiseSubtotal = Number(row.subtotal || 0);
    const deliveryFee = Number(row.delivery_fee || 0);
    const customerTotal = Number(row.total || 0);
    const orderTime = new Date(row.created_at).getTime();

    if (row.status === "PLACED") {
      pendingCount++;
    }

    if (row.status !== "CANCELLED" && row.status !== "REJECTED") {
      grossMerchandiseRevenue += merchandiseSubtotal;
      totalDeliveryFees += deliveryFee;
      if (orderTime >= todayStart) {
        todayMerchandiseRevenue += merchandiseSubtotal;
      }
      if (row.status === "DELIVERED") {
        completedOrdersCount++;
        deliveredMerchandiseValue += merchandiseSubtotal;
      }
    }

    const ctx = ctxMap.get(row.id);

    return {
      id: row.id,
      displayId: `#ORD-${row.id.slice(0, 6).toUpperCase()}`,
      createdAt: row.created_at,
      customerName: ctx?.customer_name || "Verified Customer",
      merchandiseSubtotal,
      deliveryFee,
      customerTotal,
      paymentMethod: ctx?.payment_method || "Unavailable",
      paymentStatus: ctx?.payment_status || "Unavailable",
      status: row.status || "PLACED",
    };
  });

  const averageOrderValue =
    completedOrdersCount > 0 ? Math.round(deliveredMerchandiseValue / completedOrdersCount) : 0;

  return {
    shop,
    pendingCount,
    metrics: {
      grossMerchandiseRevenue,
      todayMerchandiseRevenue,
      deliveredMerchandiseValue,
      totalDeliveryFees,
      completedOrdersCount,
      averageOrderValue,
    },
    // Commission, refund, and bank payout ledger tables do not exist in schema yet
    settlementSupported: false,
    transactions,
  };
}
