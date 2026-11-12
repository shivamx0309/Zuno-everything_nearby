"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import { isValidShopkeeperOrderTransition } from "../../lib/shop-order-transitions";
import { revalidatePath } from "next/cache";

const orderStatusUpdateSchema = z.object({
  orderId: z.string().uuid("Invalid order identifier."),
  nextStatus: z.enum([
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "REJECTED",
  ]),
});

export interface OrderItemDetail {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit: string;
}

export interface ShopOrderDetail {
  id: string;
  displayId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItemDetail[];
  itemsSummary: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  timeAgo: string;
  deliveryPartner?: {
    fullName: string;
    phone: string;
    vehicleType: string;
    vehicleNumber: string;
    deliveryStatus: string;
  } | null;
}

interface FulfillmentContextRow {
  order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  payment_method: string | null;
  payment_status: string | null;
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
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

export async function getShopOrdersAction(): Promise<{
  shop: {
    id: string;
    name: string;
    locality: string;
    pincode: string;
    isActive: boolean;
  };
  orders: ShopOrderDetail[];
  pendingCount: number;
  error?: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch Shop details
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

  // 2. Fetch Orders & Historical Snapshots using verified schema columns
  const { data: ordersRows, error: ordersErr } = await supabase
    .from("orders")
    .select(`
      id,
      customer_id,
      address_id,
      status,
      subtotal,
      delivery_fee,
      total,
      payment_id,
      delivery_id,
      created_at,
      order_items (
        id,
        product_id,
        product_name_snapshot,
        unit_price_snapshot,
        quantity,
        subtotal
      )
    `)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (ordersErr || !ordersRows) {
    console.error(
      "[Orders] Database query error:",
      ordersErr?.code || "UNKNOWN",
      ordersErr?.message || "Missing response"
    );
    return {
      shop,
      orders: [],
      pendingCount: 0,
      error: "Unable to load orders right now. Please try refreshing.",
    };
  }

  // 3. Fetch least-privilege fulfillment context (customer, address, payment, assigned rider)
  const contextMap = new Map<string, FulfillmentContextRow>();
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
        "[Orders] Scoped fulfillment context RPC unavailable:",
        ctxErr.code,
        ctxErr.message
      );
    } else if (Array.isArray(ctxRows)) {
      for (const row of ctxRows as FulfillmentContextRow[]) {
        if (row?.order_id) {
          contextMap.set(row.order_id, row);
        }
      }
    }
  }

  let pendingCount = 0;
  const orders: ShopOrderDetail[] = ordersRows.map((row: any) => {
    if (row.status === "PLACED") {
      pendingCount++;
    }

    // Strictly preserve historical snapshot item names and prices
    const items: OrderItemDetail[] = (row.order_items || []).map((oi: any) => ({
      id: oi.id,
      productName: oi.product_name_snapshot || "Ordered Item",
      quantity: Number(oi.quantity || 1),
      unitPrice: Number(oi.unit_price_snapshot || 0),
      totalPrice: Number(oi.subtotal || 0),
      unit: "qty",
    }));

    const itemsSummary =
      items.length > 0
        ? items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")
        : "No item snapshots recorded";

    const ctx = contextMap.get(row.id);

    const deliveryPartner =
      ctx && (ctx.rider_name || ctx.delivery_status)
        ? ctx.rider_name
          ? {
              fullName: ctx.rider_name,
              phone: ctx.rider_phone || "",
              vehicleType: ctx.rider_vehicle_type || "Delivery Partner",
              vehicleNumber: ctx.rider_vehicle_number || "",
              deliveryStatus: ctx.delivery_status || "ASSIGNED",
            }
          : null
        : null;

    return {
      id: row.id,
      displayId: `#ORD-${row.id.slice(0, 6).toUpperCase()}`,
      customerName: ctx?.customer_name || "Verified Customer",
      customerPhone: ctx?.customer_phone || "",
      deliveryAddress: ctx?.delivery_address || "Address unavailable",
      items,
      itemsSummary,
      subtotal: Number(row.subtotal || 0),
      deliveryFee: Number(row.delivery_fee || 0),
      total: Number(row.total || 0),
      paymentMethod: ctx?.payment_method || "Unavailable",
      paymentStatus: ctx?.payment_status || "Unavailable",
      status: row.status || "PLACED",
      createdAt: row.created_at,
      timeAgo: formatTimeAgo(row.created_at),
      deliveryPartner,
    };
  });

  return {
    shop,
    orders,
    pendingCount,
  };
}

export async function updateShopOrderStatusAction(
  orderId: string,
  nextStatus: string
): Promise<{ success: boolean; message: string }> {
  const auth = await requireApprovedShopkeeper();
  const parsed = orderStatusUpdateSchema.safeParse({ orderId, nextStatus });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid order status update.");
  }

  const supabase = createServerSupabaseClient();

  const { data: existingOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, shop_id")
    .eq("id", parsed.data.orderId)
    .eq("shop_id", auth.shopId)
    .maybeSingle();

  if (fetchError) {
    console.error("[Orders] Order lookup error:", fetchError.code, fetchError.message);
    throw new Error("Unable to verify current order state. Please try again.");
  }

  if (!existingOrder) {
    throw new Error("Order not found or not authorized for this shop.");
  }

  if (!isValidShopkeeperOrderTransition(existingOrder.status, parsed.data.nextStatus)) {
    throw new Error(
      `Invalid order transition from ${existingOrder.status} to ${parsed.data.nextStatus}.`
    );
  }

  const { data: updatedRows, error } = await supabase
    .from("orders")
    .update({
      status: parsed.data.nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.orderId)
    .eq("shop_id", auth.shopId)
    .eq("status", existingOrder.status)
    .select("id, status");

  if (error) {
    console.error("[Orders] Order status update error:", error.code, error.message);
    throw new Error("Unable to update order status. Please check current order state.");
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("Order status changed concurrently. Please refresh and try again.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return {
    success: true,
    message: `Order status updated to ${parsed.data.nextStatus}.`,
  };
}
