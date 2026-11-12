/**
 * Existing ZUNO low-stock threshold convention across Inventory & Notifications:
 * - stock === 0 -> OUT_OF_STOCK
 * - 0 < stock < LOW_STOCK_THRESHOLD (10) -> LOW_STOCK
 */
export const LOW_STOCK_THRESHOLD = 10;

export interface ShopProductStockRow {
  id: string;
  product_id?: string | null;
  stock: number | null;
}

export interface DashboardInventoryMetrics {
  lowStockCount: number;
  outOfStockCount: number;
  totalListedCount: number;
}

/**
 * Computes deduplicated shop-specific low-stock and out-of-stock product counts
 * from `public.shop_products` rows.
 */
export function computeDashboardInventoryMetrics(
  rows: ShopProductStockRow[] | null | undefined
): DashboardInventoryMetrics {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      lowStockCount: 0,
      outOfStockCount: 0,
      totalListedCount: 0,
    };
  }

  const seenKeys = new Set<string>();
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalListedCount = 0;

  for (const row of rows) {
    if (!row || !row.id) continue;
    const dedupKey = row.product_id || row.id;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    totalListedCount++;
    const stock = Math.max(0, Number(row.stock ?? 0));
    if (stock === 0) {
      outOfStockCount++;
    } else if (stock < LOW_STOCK_THRESHOLD) {
      lowStockCount++;
    }
  }

  return {
    lowStockCount,
    outOfStockCount,
    totalListedCount,
  };
}

