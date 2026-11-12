import { supabase } from "../../lib/supabase";
import { evaluateShopAvailability } from "@zuno/utils";

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  mrp?: number;
}

export interface ProductNutrition {
  label: string;
  value: string;
}

export interface ProductShopInfo {
  id: string;
  name: string;
  isOpen: boolean;
  isDeliveryAvailable: boolean;
  canOrder: boolean;
  deliveryStatusLabel: string;
  todayHoursText: string;
  distance: string;
}

export interface CategoryProduct {
  /** Authoritative shop_products.id (unique listing key per shop + product) */
  id: string;
  shopProductId: string;
  productId: string;
  name: string;
  unit: string;
  price: number;
  mrp?: number;
  discountPercentage?: number;
  categoryId: string;
  categorySlug: string;
  subcategoryId?: string;
  offerBadge?: string;
  stock: number;
  inStock: boolean;
  image_url?: string | null;
  imageSource?: any;
  images?: any[];
  emoji?: string;
  color?: string;
  shopId: string;
  shopName: string;
  shop: ProductShopInfo;
  description?: string;
  origin?: string;
  storage?: string;
  bestBefore?: string;
  highlights?: string[];
  variants?: ProductVariant[];
  nutrition?: ProductNutrition[];
  healthBenefits?: string[];
}

export type ProductData = CategoryProduct;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCategoryEmoji(slug: string): string {
  const s = (slug || "").toLowerCase();
  if (s.includes("veg")) return "🥦";
  if (s.includes("fruit")) return "🍎";
  if (s.includes("dairy") || s.includes("milk")) return "🥛";
  if (s.includes("snack")) return "🍿";
  return "🛒";
}

export function mapLiveShopProductRow(
  row: any,
  storefront: {
    id: string;
    name: string;
    is_active?: boolean | null;
    is_delivery_available?: boolean | null;
    opening_hours?: unknown;
  },
  idx: number = 0
): CategoryProduct {
  const productObj = Array.isArray(row.products) ? row.products[0] : row.products;
  const categoryObj = Array.isArray(productObj?.categories)
    ? productObj.categories[0]
    : productObj?.categories;
  const invObj = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;

  const spStock = Number(row.stock ?? 0);
  const effectiveStock =
    invObj && typeof invObj.quantity === "number"
      ? Math.max(0, Math.min(spStock, Number(invObj.quantity)))
      : Math.max(0, spStock);

  const isListingAvailable = Boolean(row.available) && effectiveStock > 0;
  const availability = evaluateShopAvailability({
    isActive: storefront.is_active !== false,
    isDeliveryAvailable: storefront.is_delivery_available !== false,
    openingHours: storefront.opening_hours ?? null,
  });

  const slug = categoryObj?.slug || "grocery";

  return {
    id: row.id,
    shopProductId: row.id,
    productId: productObj?.id || row.product_id,
    name: productObj?.name || "Product",
    unit: productObj?.unit || "1 pack",
    price: Number(row.price),
    categoryId: productObj?.category_id || "",
    categorySlug: slug,
    stock: effectiveStock,
    inStock: isListingAvailable,
    image_url: productObj?.image_url || null,
    emoji: getCategoryEmoji(slug),
    color: "#EAF4E5",
    shopId: storefront.id,
    shopName: storefront.name,
    shop: {
      id: storefront.id,
      name: storefront.name,
      isOpen: availability.isOpenNow,
      isDeliveryAvailable: availability.isDeliveryAvailable,
      canOrder: availability.canAcceptDeliveryOrder && isListingAvailable,
      deliveryStatusLabel: availability.deliveryStatusLabel,
      todayHoursText: availability.todayHoursText,
      distance: `${(0.5 + (idx % 5) * 0.4).toFixed(1)} km away`,
    },
    description: productObj?.description || "Locally stocked item from an approved ZUNO shop.",
  };
}

async function fetchStorefrontMap(): Promise<Record<string, any>> {
  const { data, error } = await supabase
    .from("public_storefronts")
    .select("id, name, is_active, is_delivery_available, opening_hours")
    .eq("is_active", true);

  if (error || !data) return {};
  const map: Record<string, any> = {};
  for (const sf of data) {
    if (sf?.id) map[sf.id] = sf;
  }
  return map;
}

export interface FetchProductsFilterParams {
  categorySlugOrId: string;
  subcategoryId?: string;
  searchQuery?: string;
  sortBy?: "popularity" | "low_high" | "high_low" | "name_az";
  maxPrice?: number;
  inStockOnly?: boolean;
}

export async function fetchProductsByCategory(
  params: FetchProductsFilterParams
): Promise<CategoryProduct[]> {
  try {
    const { categorySlugOrId, searchQuery, sortBy, maxPrice, inStockOnly } = params;

    const storefrontMap = await fetchStorefrontMap();
    const shopIds = Object.keys(storefrontMap);
    if (shopIds.length === 0) return [];

    const { data, error } = await supabase
      .from("shop_products")
      .select(
        "id, shop_id, product_id, price, stock, available, products!inner(id, category_id, name, unit, description, image_url, categories!inner(id, slug, name)), inventory(quantity)"
      )
      .in("shop_id", shopIds);

    if (error || !data) return [];

    let result: CategoryProduct[] = data
      .filter((row: any) => Boolean(storefrontMap[row.shop_id]))
      .map((row: any, idx: number) =>
        mapLiveShopProductRow(row, storefrontMap[row.shop_id], idx)
      );

    const normCategory = categorySlugOrId.toLowerCase();
    if (normCategory !== "all") {
      result = result.filter(
        (p) =>
          p.categorySlug.toLowerCase() === normCategory ||
          p.categoryId === categorySlugOrId
      );
    }

    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    if (maxPrice !== undefined && maxPrice > 0) {
      result = result.filter((p) => p.price <= maxPrice);
    }

    if (inStockOnly) {
      result = result.filter((p) => p.inStock);
    }

    if (sortBy === "low_high") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "high_low") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "name_az") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  } catch {
    return [];
  }
}

export async function getProductsByShop(
  shopId: string
): Promise<CategoryProduct[]> {
  if (!shopId || !UUID_REGEX.test(shopId)) return [];

  try {
    const { data: sf, error: sfErr } = await supabase
      .from("public_storefronts")
      .select("id, name, is_active, is_delivery_available, opening_hours")
      .eq("id", shopId)
      .maybeSingle();

    if (sfErr || !sf) return [];

    const { data, error } = await supabase
      .from("shop_products")
      .select(
        "id, shop_id, product_id, price, stock, available, products!inner(id, category_id, name, unit, description, image_url, categories!inner(id, slug, name)), inventory(quantity)"
      )
      .eq("shop_id", shopId);

    if (error || !data) return [];

    return data.map((row: any, idx: number) =>
      mapLiveShopProductRow(row, sf, idx)
    );
  } catch {
    return [];
  }
}

export async function getProductDetails(
  shopProductOrProductId: string
): Promise<CategoryProduct | null> {
  if (!shopProductOrProductId || !UUID_REGEX.test(shopProductOrProductId)) {
    return null;
  }

  try {
    const storefrontMap = await fetchStorefrontMap();
    const shopIds = Object.keys(storefrontMap);
    if (shopIds.length === 0) return null;

    const { data: byListing } = await supabase
      .from("shop_products")
      .select(
        "id, shop_id, product_id, price, stock, available, products!inner(id, category_id, name, unit, description, image_url, categories!inner(id, slug, name)), inventory(quantity)"
      )
      .eq("id", shopProductOrProductId)
      .in("shop_id", shopIds)
      .maybeSingle();

    if (byListing && storefrontMap[byListing.shop_id]) {
      return mapLiveShopProductRow(byListing, storefrontMap[byListing.shop_id], 0);
    }

    const { data: byProduct } = await supabase
      .from("shop_products")
      .select(
        "id, shop_id, product_id, price, stock, available, products!inner(id, category_id, name, unit, description, image_url, categories!inner(id, slug, name)), inventory(quantity)"
      )
      .eq("product_id", shopProductOrProductId)
      .in("shop_id", shopIds)
      .limit(1);

    const firstRow = byProduct?.[0];
    if (firstRow && storefrontMap[firstRow.shop_id]) {
      return mapLiveShopProductRow(firstRow, storefrontMap[firstRow.shop_id], 0);
    }

    return null;
  } catch {
    return null;
  }
}

export async function getSimilarProducts(
  currentListingId: string,
  categorySlugOrId?: string
): Promise<CategoryProduct[]> {
  const allInCategory = await fetchProductsByCategory({
    categorySlugOrId: categorySlugOrId || "all",
    inStockOnly: true,
  });
  return allInCategory
    .filter((p) => p.id !== currentListingId)
    .slice(0, 4);
}

export async function getPopularProducts(): Promise<CategoryProduct[]> {
  const all = await fetchProductsByCategory({
    categorySlugOrId: "all",
    inStockOnly: true,
  });
  return all.slice(0, 8);
}
