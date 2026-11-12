import { LOW_STOCK_THRESHOLD } from "./dashboard-inventory-metrics";

export type InventoryStockStatus = "OUT_OF_STOCK" | "LOW_STOCK" | "HEALTHY";

export interface StockValidationSuccess {
  valid: true;
  stock: number;
}

export interface StockValidationFailure {
  valid: false;
  error: string;
}

export type StockValidationResult =
  | StockValidationSuccess
  | StockValidationFailure;

const MAX_PG_INT = 2147483647;

/**
 * Classifies an inventory item using the canonical ZUNO stock threshold:
 * - stock === 0 -> OUT_OF_STOCK
 * - 0 < stock < LOW_STOCK_THRESHOLD (10) -> LOW_STOCK
 * - stock >= 10 -> HEALTHY
 */
export function getInventoryStockStatus(stock: number): InventoryStockStatus {
  const normalized = Math.max(0, Math.floor(Number(stock) || 0));
  if (normalized === 0) return "OUT_OF_STOCK";
  if (normalized < LOW_STOCK_THRESHOLD) return "LOW_STOCK";
  return "HEALTHY";
}

/**
 * Computes low-stock and out-of-stock KPI counts consistently from inventory items.
 */
export function recalculateInventoryKpis(
  items: ReadonlyArray<{ stock: number }>
): {
  lowStockCount: number;
  outOfStockCount: number;
  totalCount: number;
} {
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of items) {
    const status = getInventoryStockStatus(item.stock);
    if (status === "OUT_OF_STOCK") {
      outOfStockCount++;
    } else if (status === "LOW_STOCK") {
      lowStockCount++;
    }
  }

  return {
    lowStockCount,
    outOfStockCount,
    totalCount: items.length,
  };
}

/**
 * Strictly validates an exact stock quantity input:
 * - Rejects empty/whitespace strings (never converts "" to 0)
 * - Rejects NaN, Infinity, decimals, and negative numbers
 * - Accepts non-negative integers (including 0) up to PostgreSQL integer max
 */
export function parseStockQuantityInput(raw: unknown): StockValidationResult {
  if (raw === null || raw === undefined) {
    return { valid: false, error: "Please enter a stock quantity." };
  }

  let num: number;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: "Please enter a stock quantity." };
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return {
        valid: false,
        error: "Stock quantity must be a whole number (0 or greater).",
      };
    }
    num = Number(trimmed);
  } else if (typeof raw === "number") {
    num = raw;
  } else {
    return {
      valid: false,
      error: "Stock quantity must be a valid whole number.",
    };
  }

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return {
      valid: false,
      error: "Stock quantity must be a valid whole number.",
    };
  }

  if (!Number.isInteger(num)) {
    return {
      valid: false,
      error: "Stock quantity must be a whole number without decimals.",
    };
  }

  if (num < 0) {
    return {
      valid: false,
      error: "Stock quantity cannot be negative.",
    };
  }

  if (num > MAX_PG_INT) {
    return {
      valid: false,
      error: "Stock quantity exceeds the maximum supported limit.",
    };
  }

  return { valid: true, stock: num };
}

