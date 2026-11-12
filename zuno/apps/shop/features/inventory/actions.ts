"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import {
  getInventoryStockStatus,
  InventoryStockStatus,
  parseStockQuantityInput,
  recalculateInventoryKpis,
} from "../../lib/inventory-utils";
import { revalidatePath } from "next/cache";

const inventoryItemIdSchema = z.string().uuid("Invalid inventory item identifier.");

export interface InventoryItem {
  id: string;
  name: string;
  categoryName: string;
  unit: string;
  price: number;
  stock: number;
  isAvailable: boolean;
  status: InventoryStockStatus;
}

export async function getShopInventoryAction(): Promise<{
  shop: {
    id: string;
    name: string;
    locality: string;
    pincode: string;
    isActive: boolean;
  };
  pendingCount: number;
  items: InventoryItem[];
  lowStockCount: number;
  outOfStockCount: number;
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

  // 2. Pending orders count
  const { count: pendingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "PLACED");

  // 3. Inventory items from shop_products
  const { data: spRows, error: spErr } = await supabase
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
        categories (
          name
        )
      )
    `)
    .eq("shop_id", shopId)
    .order("stock", { ascending: true });

  let items: InventoryItem[] = [];
  let errorMsg: string | undefined;

  if (spErr) {
    console.error("[Inventory] Error fetching inventory items:", spErr.code, spErr.message);
    errorMsg = "Unable to load inventory stock levels right now. Please try refreshing.";
  } else if (Array.isArray(spRows)) {
    items = spRows
      .filter((row: any) => row.products)
      .map((row: any) => {
        const stock = Math.max(0, Number(row.stock ?? 0));
        const status = getInventoryStockStatus(stock);

        return {
          id: row.id,
          name: row.products.name,
          categoryName: row.products.categories?.name || "General",
          unit: row.products.unit || "unit",
          price: Number(row.price ?? 0),
          stock,
          isAvailable: Boolean(row.available && stock > 0),
          status,
        };
      });
  }

  const kpis = recalculateInventoryKpis(items);

  return {
    shop,
    pendingCount: pendingCount || 0,
    items,
    lowStockCount: kpis.lowStockCount,
    outOfStockCount: kpis.outOfStockCount,
    error: errorMsg,
  };
}

export async function updateProductStockAction(
  shopProductId: string,
  newStock: number | string,
  expectedPreviousStock?: number
): Promise<{
  success: boolean;
  newStock: number;
  status: InventoryStockStatus;
}> {
  const auth = await requireApprovedShopkeeper();

  const parsedId = inventoryItemIdSchema.safeParse(shopProductId);
  if (!parsedId.success) {
    throw new Error(parsedId.error.issues[0]?.message || "Invalid inventory item identifier.");
  }

  const parsedStock = parseStockQuantityInput(newStock);
  if (!parsedStock.valid) {
    throw new Error(parsedStock.error);
  }

  const supabase = createServerSupabaseClient();

  // 1. Fetch current product_id, price, and stock scoped strictly to auth.shopId
  const { data: current, error: fetchErr } = await supabase
    .from("shop_products")
    .select("product_id, price, stock")
    .eq("id", parsedId.data)
    .eq("shop_id", auth.shopId)
    .single();

  if (fetchErr || !current) {
    throw new Error("Inventory item not found or unauthorized.");
  }

  // Concurrency guard: avoid silently overwriting newer stock when editing from a stale row
  if (
    expectedPreviousStock !== undefined &&
    Number(current.stock ?? 0) !== expectedPreviousStock
  ) {
    throw new Error(
      `Stock changed concurrently (latest stock: ${Number(current.stock ?? 0)}). Refreshing latest levels before saving.`
    );
  }

  // 2. Execute atomic transactional RPC
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    "upsert_shop_product_and_inventory",
    {
      p_shop_id: auth.shopId,
      p_product_id: current.product_id,
      p_price: current.price,
      p_stock: parsedStock.stock,
    }
  );

  if (rpcErr) {
    console.error("upsert_shop_product_and_inventory error:", rpcErr.message);
    if (rpcErr.code === "42883") {
      throw new Error(
        "Stock update is temporarily unavailable: atomic database migration 012 has not been applied. Please contact an administrator."
      );
    }
    throw new Error(`Failed to update stock: ${rpcErr.message}`);
  }

  if (!rpcRes?.success) {
    throw new Error("Atomic stock and inventory synchronization did not confirm success.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/products");
  return {
    success: true,
    newStock: parsedStock.stock,
    status: getInventoryStockStatus(parsedStock.stock),
  };
}
