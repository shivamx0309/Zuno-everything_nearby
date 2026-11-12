export interface CatalogListingDefaultsInput {
  currentPrice?: number | null;
  currentStock?: number | null;
}

/**
 * Resolves initial modal price & stock inputs for adding/editing a catalog listing.
 * Preserves legitimate 0 values with nullish coalescing (`??`) while keeping
 * fallback values strictly for null/undefined cases.
 */
export function resolveCatalogListingDefaults(
  product: CatalogListingDefaultsInput | null | undefined
): {
  price: number;
  stock: number;
} {
  return {
    price: product?.currentPrice ?? 50,
    stock: product?.currentStock ?? 20,
  };
}

/**
 * Checks whether a listed catalog item has an existing numeric price (including 0).
 */
export function hasExistingListingPrice(
  product: CatalogListingDefaultsInput | null | undefined
): boolean {
  return product?.currentPrice !== null && product?.currentPrice !== undefined;
}

