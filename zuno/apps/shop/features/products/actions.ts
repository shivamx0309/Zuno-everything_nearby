"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { requireApprovedShopkeeper } from "../../lib/authGuard";
import { revalidatePath } from "next/cache";

const shopProductIdSchema = z.string().uuid("Invalid shop product identifier.");

export type ProductRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ProductRequestItem {
  id: string;
  productName: string;
  categoryName: string;
  unit: string;
  brand?: string | null;
  suggestedPrice?: number | null;
  status: ProductRequestStatus;
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface ShopProductItem {
  id: string;
  productId: string;
  name: string;
  categoryName: string;
  categoryId?: string;
  unit: string;
  price: number;
  stock: number;
  isAvailable: boolean;
  imageUrl?: string | null;
}

export interface CatalogProductItem {
  id: string;
  name: string;
  description?: string | null;
  categoryId: string;
  categoryName: string;
  unit: string;
  imageUrl?: string | null;
  isAlreadyListed?: boolean;
  currentShopProductId?: string;
  currentPrice?: number;
  currentStock?: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  accentColor?: string | null;
}

export interface ShopIdentityWithCategory {
  id: string;
  name: string;
  description: string;
  locality: string;
  pincode: string;
  isActive: boolean;
  detectedCategory: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Server-side helper: Infers the registered category of an authenticated shop
 * based on verified database fields (name and description) mapped to registered categories.
 */
function inferShopCategory(
  shopName: string,
  shopDescription: string,
  categories: CategoryItem[]
): { id: string; name: string; slug: string } {
  const text = `${shopName} ${shopDescription}`.toLowerCase();

  // Keyword mapping rules for standard grocery, kirana, dairy, produce
  const categoryKeywords: Record<string, string[]> = {
    dairy: ["dairy", "milk", "paneer", "butter", "curd", "ghee", "dahi"],
    vegetables: ["vegetable", "vegetables", "sabzi", "veggie", "bhaji", "tamatar", "aloo", "pyaz"],
    fruits: ["fruit", "fruits", "fal", "kela", "seb", "apple", "banana", "mango"],
    grocery: ["grocery", "kirana", "ration", "general", "atta", "rice", "dal", "oil", "sugar", "spices", "store"],
    snacks: ["snack", "snacks", "namkeen", "bakery", "biscuit", "chips", "tea", "chai"],
  };

  // Find direct category slug match
  for (const cat of categories) {
    const slug = cat.slug.toLowerCase();
    const keywords = categoryKeywords[slug] || [slug, cat.name.toLowerCase()];
    if (keywords.some((kw) => text.includes(kw))) {
      return { id: cat.id, name: cat.name, slug: cat.slug };
    }
  }

  // Fallback to Grocery or first active category
  const groceryCat = categories.find((c) => c.slug === "grocery" || c.name.toLowerCase().includes("grocery"));
  if (groceryCat) {
    return { id: groceryCat.id, name: groceryCat.name, slug: groceryCat.slug };
  }

  const fallback = categories[0] || {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Grocery",
    slug: "grocery",
  };
  return { id: fallback.id, name: fallback.name, slug: fallback.slug };
}

async function queryShopProductRequests(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  shopId: string
): Promise<{
  requests: ProductRequestItem[];
  error?: string;
}> {
  const { data: reqRows, error: reqErr } = await supabase
    .from("product_requests")
    .select(`
      id,
      product_name,
      brand,
      unit,
      suggested_price,
      status,
      rejection_reason,
      created_at,
      reviewed_at,
      categories (
        name
      )
    `)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (reqErr) {
    console.error("[Products] product_requests query error:", reqErr.code, reqErr.message);
    return {
      requests: [],
      error: "Unable to load submitted product requests right now. Please try refreshing.",
    };
  }

  const requests: ProductRequestItem[] = (reqRows || []).map((row: any) => {
    const rawStatus = String(row.status || "PENDING").toUpperCase();
    const status: ProductRequestStatus =
      rawStatus === "APPROVED" || rawStatus === "REJECTED" ? rawStatus : "PENDING";

    return {
      id: row.id,
      productName: row.product_name,
      categoryName: row.categories?.name || "General",
      unit: row.unit || "unit",
      brand: row.brand || null,
      suggestedPrice:
        row.suggested_price !== null && row.suggested_price !== undefined
          ? Number(row.suggested_price)
          : null,
      status,
      rejectionReason: row.rejection_reason || null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at || null,
    };
  });

  return { requests };
}

/**
 * Action: Fetches product requests belonging solely to the authenticated shopkeeper's shop.
 */
export async function getShopProductRequestsAction(): Promise<{
  requests: ProductRequestItem[];
  error?: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  return queryShopProductRequests(supabase, auth.shopId);
}

/**
 * Action: Fetch shop inventory, registered category, initial suggestions, and submitted requests.
 */
export async function getShopProductsAction(): Promise<{
  shop: ShopIdentityWithCategory;
  pendingCount: number;
  categories: CategoryItem[];
  shopProducts: ShopProductItem[];
  catalogProducts: CatalogProductItem[];
  productRequests: ProductRequestItem[];
  productRequestsError?: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const shopId = auth.shopId;

  // 1. Fetch shop info directly from database
  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, description, locality, pincode, is_active")
    .eq("id", shopId)
    .single();

  const shopName = shopRow?.name || auth.shopName;
  const shopDescription = shopRow?.description || "";

  // 2. Fetch active categories
  const { data: catRows } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, accent_color")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const categories: CategoryItem[] = (catRows || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parent_id,
    accentColor: c.accent_color,
  }));

  const detectedCategory = inferShopCategory(shopName, shopDescription, categories);

  const shop: ShopIdentityWithCategory = {
    id: shopRow?.id || shopId,
    name: shopName,
    description: shopDescription,
    locality: shopRow?.locality || "Renukoot",
    pincode: shopRow?.pincode || "231217",
    isActive: Boolean(shopRow?.is_active ?? true),
    detectedCategory,
  };

  // 3. Pending orders count
  const { count: pendingCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "PLACED");

  // 4. Shop's currently listed products
  const { data: spRows, error: spErr } = await supabase
    .from("shop_products")
    .select(`
      id,
      product_id,
      price,
      stock,
      available,
      products (
        id,
        name,
        unit,
        image_url,
        categories (
          id,
          name
        )
      )
    `)
    .eq("shop_id", shopId)
    .order("stock", { ascending: false });

  let shopProducts: ShopProductItem[] = [];
  const existingProductMap = new Map<string, { shopProductId: string; price: number; stock: number }>();

  if (!spErr && Array.isArray(spRows)) {
    shopProducts = spRows
      .filter((row: any) => row.products)
      .map((row: any) => {
        existingProductMap.set(row.product_id, {
          shopProductId: row.id,
          price: Number(row.price || 0),
          stock: Number(row.stock || 0),
        });
        return {
          id: row.id,
          productId: row.product_id,
          name: row.products.name,
          categoryName: row.products.categories?.name || "General",
          categoryId: row.products.categories?.id,
          unit: row.products.unit || "unit",
          price: Number(row.price || 0),
          stock: Number(row.stock || 0),
          isAvailable: Boolean(row.available && row.stock > 0),
          imageUrl: row.products.image_url,
        };
      });
  }

  // 5. Fetch central catalog products for category-aware suggestions
  const { data: catalogRows } = await supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      unit,
      image_url,
      category_id,
      categories (
        id,
        name
      )
    `)
    .limit(100);

  const allCatalogProducts: CatalogProductItem[] = (catalogRows || []).map((cp: any) => {
    const existing = existingProductMap.get(cp.id);
    return {
      id: cp.id,
      name: cp.name,
      description: cp.description,
      categoryId: cp.category_id,
      categoryName: cp.categories?.name || "General",
      unit: cp.unit || "unit",
      imageUrl: cp.image_url,
      isAlreadyListed: Boolean(existing),
      currentShopProductId: existing?.shopProductId,
      currentPrice: existing?.price,
      currentStock: existing?.stock,
    };
  });

  // Sort suggestions: category-matching products first, unlisted products before listed ones
  allCatalogProducts.sort((a, b) => {
    const aMatch = a.categoryId === detectedCategory.id ? 1 : 0;
    const bMatch = b.categoryId === detectedCategory.id ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    if (a.isAlreadyListed !== b.isAlreadyListed) {
      return a.isAlreadyListed ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  const { requests: productRequests, error: productRequestsError } =
    await queryShopProductRequests(supabase, shopId);

  return {
    shop,
    pendingCount: pendingCount || 0,
    categories,
    shopProducts,
    catalogProducts: allCatalogProducts,
    productRequests,
    productRequestsError,
  };
}

/**
 * Action: Smart debounced search in the central product catalog.
 * Supports searching by product name, category, description, and unit.
 * When exact matches are 0, falls back to broader matches and category browsing.
 */
export async function searchCatalogProductsAction(
  searchQuery: string,
  categoryId?: string
): Promise<{
  exactMatches: CatalogProductItem[];
  broaderMatches: CatalogProductItem[];
  query: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const cleanQuery = (searchQuery || "").trim();

  // 1. Map existing shop product IDs
  const { data: spRows } = await supabase
    .from("shop_products")
    .select("id, product_id, price, stock")
    .eq("shop_id", auth.shopId);

  const existingMap = new Map<string, { shopProductId: string; price: number; stock: number }>();
  (spRows || []).forEach((r: any) => {
    existingMap.set(r.product_id, {
      shopProductId: r.id,
      price: Number(r.price || 0),
      stock: Number(r.stock || 0),
    });
  });

  const transformRow = (row: any): CatalogProductItem => {
    const existing = existingMap.get(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.categories?.name || "General",
      unit: row.unit || "unit",
      imageUrl: row.image_url,
      isAlreadyListed: Boolean(existing),
      currentShopProductId: existing?.shopProductId,
      currentPrice: existing?.price,
      currentStock: existing?.stock,
    };
  };

  // If query is empty, return category items
  if (!cleanQuery) {
    let queryBuilder = supabase
      .from("products")
      .select(`
        id,
        name,
        description,
        unit,
        image_url,
        category_id,
        categories (
          id,
          name
        )
      `)
      .limit(60);

    if (categoryId && categoryId !== "ALL") {
      queryBuilder = queryBuilder.eq("category_id", categoryId);
    }

    const { data } = await queryBuilder;
    const exactMatches = (data || []).map(transformRow);
    return { exactMatches, broaderMatches: [], query: "" };
  }

  // 2. Exact / Substring Search across name, description, unit
  let exactQuery = supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      unit,
      image_url,
      category_id,
      categories (
        id,
        name
      )
    `)
    .or(`name.ilike.%${cleanQuery}%,description.ilike.%${cleanQuery}%,unit.ilike.%${cleanQuery}%`)
    .limit(40);

  if (categoryId && categoryId !== "ALL") {
    exactQuery = exactQuery.eq("category_id", categoryId);
  }

  const { data: exactRows } = await exactQuery;
  const exactMatches = (exactRows || []).map(transformRow);

  // 3. If exact matches are empty, perform a broader search
  let broaderMatches: CatalogProductItem[] = [];
  if (exactMatches.length === 0) {
    const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length > 0) {
      const orFilter = tokens.map((t) => `name.ilike.%${t}%`).join(",");
      let broaderQuery = supabase
        .from("products")
        .select(`
          id,
          name,
          description,
          unit,
          image_url,
          category_id,
          categories (
            id,
            name
          )
        `)
        .or(orFilter)
        .limit(20);

      if (categoryId && categoryId !== "ALL") {
        broaderQuery = broaderQuery.eq("category_id", categoryId);
      }

      const { data: broaderRows } = await broaderQuery;
      broaderMatches = (broaderRows || []).map(transformRow);
    }

    // If still empty and a category is selected, offer top products from that category
    if (broaderMatches.length === 0 && categoryId && categoryId !== "ALL") {
      const { data: catRows } = await supabase
        .from("products")
        .select(`
          id,
          name,
          description,
          unit,
          image_url,
          category_id,
          categories (
            id,
            name
          )
        `)
        .eq("category_id", categoryId)
        .limit(10);
      broaderMatches = (catRows || []).map(transformRow);
    }
  }

  return {
    exactMatches,
    broaderMatches,
    query: cleanQuery,
  };
}

/**
 * Action: Checks if a product with the same or very similar name already exists
 * in the central catalog before creating or requesting a new product.
 */
export async function checkProductDuplicateAction(
  name: string,
  categoryId?: string
): Promise<{
  isDuplicate: boolean;
  matches: CatalogProductItem[];
}> {
  await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();
  const cleanName = (name || "").trim().toLowerCase();

  if (!cleanName) return { isDuplicate: false, matches: [] };

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      unit,
      image_url,
      category_id,
      categories (
        id,
        name
      )
    `)
    .ilike("name", `%${cleanName}%`)
    .limit(5);

  if (categoryId && categoryId !== "ALL") {
    query = query.eq("category_id", categoryId);
  }

  const { data } = await query;
  const matches: CatalogProductItem[] = (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.categories?.name || "General",
    unit: row.unit || "unit",
    imageUrl: row.image_url,
  }));

  const isExactDuplicate = matches.some((m) => m.name.toLowerCase().trim() === cleanName);

  return {
    isDuplicate: isExactDuplicate,
    matches,
  };
}

/**
/**
 * Action: Add or update a central catalog product listing in the shopkeeper's store.
 * - Prioritizes atomic PostgreSQL RPC `upsert_shop_product_and_inventory`.
 * - Coordinated fallback ensures price and stock are updated safely and isolated to auth.shopId.
 * - Never modifies global `products` table attributes.
 */
export async function addCatalogProductToShopAction(
  productId: string,
  price: number,
  stock: number
): Promise<{ success: boolean; message: string }> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  if (!productId || typeof productId !== "string") {
    throw new Error("Invalid product selection.");
  }
  if (typeof price !== "number" || isNaN(price) || price < 0) {
    throw new Error("Please enter a valid selling price of ₹0 or more.");
  }
  if (typeof stock !== "number" || isNaN(stock) || stock < 0) {
    throw new Error("Please enter a valid stock quantity of 0 or more.");
  }

  // Execute atomic transactional PostgreSQL RPC to ensure shop_products and inventory update together
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    "upsert_shop_product_and_inventory",
    {
      p_shop_id: auth.shopId,
      p_product_id: productId,
      p_price: price,
      p_stock: Math.floor(stock),
    }
  );

  if (rpcErr) {
    console.error("upsert_shop_product_and_inventory RPC error:", rpcErr.message);
    if (rpcErr.code === "42883") {
      throw new Error(
        "Product listing is temporarily unavailable: atomic database migration 012 has not been applied. Please contact an administrator."
      );
    }
    throw new Error(`Failed to update product listing and inventory: ${rpcErr.message}`);
  }

  if (!rpcRes?.success) {
    throw new Error("Atomic listing and inventory synchronization did not confirm success.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/inventory");

  return {
    success: true,
    message: "Product listing and inventory successfully updated.",
  };
}

/**
 * Action: Submits a new-product request to the central catalog governance system.
 * Security & Integrity Guarantees:
 * - requested_by is strictly derived from authenticated session (never caller-supplied).
 * - status is hardcoded to 'PENDING'.
 * - Review fields (reviewed_by, rejection_reason) are never set by shopkeepers.
 * - Rejects identical duplicates if product already exists in central catalog.
 * - NEVER reports false success: returns true ONLY when canonical request is persisted.
 * - NEVER returns fabricated request IDs.
 */
export async function submitProductRequestAction(params: {
  productName: string;
  categoryId: string;
  unit: string;
  suggestedPrice: number;
  brand?: string;
  notes?: string;
  imageUrl?: string;
}): Promise<{
  success: boolean;
  message: string;
  requestId?: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  const cleanName = (params.productName || "").trim();
  if (cleanName.length < 2) {
    throw new Error("Product name must be at least 2 characters.");
  }
  if (!params.categoryId) {
    throw new Error("Please select a category.");
  }
  if (!params.unit || !params.unit.trim()) {
    throw new Error("Please specify a pack size or unit.");
  }
  if (params.suggestedPrice !== undefined && params.suggestedPrice !== null) {
    const numPrice = Number(params.suggestedPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      throw new Error("Suggested price must be greater than or equal to 0.");
    }
  }

  // 1. Check for duplicate in central catalog
  const { isDuplicate, matches } = await checkProductDuplicateAction(cleanName, params.categoryId);
  if (isDuplicate && matches.length > 0) {
    return {
      success: false,
      message: `An identical product "${matches[0].name}" already exists in the central catalog. Please select it from search results.`,
    };
  }

  // 2. Canonical insert into public.product_requests
  try {
    const { data: reqData, error: reqErr } = await supabase
      .from("product_requests")
      .insert({
        shop_id: auth.shopId,
        requested_by: auth.userId,
        category_id: params.categoryId,
        product_name: cleanName,
        brand: params.brand?.trim() || null,
        unit: params.unit.trim(),
        suggested_price: params.suggestedPrice != null ? Number(params.suggestedPrice) : null,
        notes: params.notes?.trim() || null,
        image_url: params.imageUrl?.trim() || null,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (!reqErr && reqData?.id) {
      // Also log activity for audit trail
      try {
        await supabase.from("activity_logs").insert({
          actor_id: auth.userId,
          action: "PRODUCT_REQUEST_SUBMITTED",
          entity_type: "product_request",
          entity_id: reqData.id,
          metadata: {
            productName: cleanName,
            categoryId: params.categoryId,
            shopId: auth.shopId,
          },
        });
      } catch {}

      return {
        success: true,
        requestId: reqData.id,
        message: `Your request for "${cleanName}" has been submitted for central catalog approval.`,
      };
    }

    // Handle database error without false success
    if (reqErr) {
      console.error("product_requests insert error:", reqErr.message);

      // Distinguish unapplied migration from permission or constraint errors
      if (reqErr.code === "42P01") {
        return {
          success: false,
          message: "Product request submission is temporarily unavailable: catalog governance migration has not been applied to the database. Please contact support.",
        };
      }

      return {
        success: false,
        message: `Failed to submit product request: ${reqErr.message}`,
      };
    }
  } catch (err: any) {
    console.error("submitProductRequestAction exception:", err?.message);
    return {
      success: false,
      message: err?.message || "An unexpected error occurred while submitting your product request.",
    };
  }

  // Fail-safe: Never return success or fabricated ID if code path somehow falls through
  return {
    success: false,
    message: "Failed to persist product request. Please try again.",
  };
}

/**
 * Action: Updates a shop-specific listing's selling price and stock.
 */
export async function updateShopProductAction(
  shopProductId: string,
  price: number,
  stock: number
): Promise<{ success: boolean }> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  if (price < 0 || stock < 0) {
    throw new Error("Price and stock must be positive numbers.");
  }

  // 1. Fetch product_id for this shopProductId scoped strictly to auth.shopId
  const { data: current, error: fetchErr } = await supabase
    .from("shop_products")
    .select("product_id")
    .eq("id", shopProductId)
    .eq("shop_id", auth.shopId)
    .single();

  if (fetchErr || !current) {
    throw new Error("Product listing not found or unauthorized.");
  }

  // 2. Execute atomic transactional RPC
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    "upsert_shop_product_and_inventory",
    {
      p_shop_id: auth.shopId,
      p_product_id: current.product_id,
      p_price: price,
      p_stock: Math.floor(stock),
    }
  );

  if (rpcErr) {
    console.error("upsert_shop_product_and_inventory error:", rpcErr.message);
    if (rpcErr.code === "42883") {
      throw new Error(
        "Product update is temporarily unavailable: atomic database migration 012 has not been applied. Please contact an administrator."
      );
    }
    throw new Error(`Failed to update product: ${rpcErr.message}`);
  }

  if (!rpcRes?.success) {
    throw new Error("Atomic product and inventory synchronization did not confirm success.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/inventory");
  return { success: true };
}

/**
 * Action: Toggles in-stock / out-of-stock availability for a shop product.
 */
export async function toggleProductAvailabilityAction(
  shopProductId: string,
  isAvailable: boolean
): Promise<{ success: boolean }> {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  if (!shopProductId || typeof shopProductId !== "string") {
    throw new Error("Invalid product listing identifier.");
  }

  const { data: updatedRows, error } = await supabase
    .from("shop_products")
    .update({ available: Boolean(isAvailable) })
    .eq("id", shopProductId)
    .eq("shop_id", auth.shopId)
    .select("id");

  if (error) {
    console.error("[Products] Availability update error:", error.code, error.message);
    throw new Error("Unable to update product availability right now.");
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("Product listing not found or unauthorized.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/inventory");
  return { success: true };
}

/**
 * Action: Safely removes a shop-specific product listing without touching the global catalog,
 * other merchants' listings, or historical order snapshots.
 * If referenced by active customer carts (FK SQLSTATE 23503), atomically marks listing unavailable & 0 stock.
 */
export async function removeShopProductAction(shopProductId: string): Promise<{
  success: boolean;
  mode: "DELETED" | "UNAVAILABLE_FALLBACK";
  message: string;
}> {
  const auth = await requireApprovedShopkeeper();
  const parsedId = shopProductIdSchema.safeParse(shopProductId);
  if (!parsedId.success) {
    throw new Error(parsedId.error.issues[0]?.message || "Invalid product listing identifier.");
  }

  const supabase = createServerSupabaseClient();

  const { data: existingRow, error: fetchErr } = await supabase
    .from("shop_products")
    .select("id, product_id, price")
    .eq("id", parsedId.data)
    .eq("shop_id", auth.shopId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[Products] Failed to verify listing before removal:", fetchErr.code, fetchErr.message);
    throw new Error("Unable to verify storefront listing right now.");
  }

  if (!existingRow) {
    throw new Error("Product listing not found or unauthorized.");
  }

  const { data: deletedRows, error: delErr } = await supabase
    .from("shop_products")
    .delete()
    .eq("id", parsedId.data)
    .eq("shop_id", auth.shopId)
    .select("id");

  if (delErr) {
    if (delErr.code === "23503") {
      // Active customer cart references this shop_product_id; hide & zero stock atomically
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "upsert_shop_product_and_inventory",
        {
          p_shop_id: auth.shopId,
          p_product_id: existingRow.product_id,
          p_price: Number(existingRow.price ?? 0),
          p_stock: 0,
        }
      );

      if (rpcErr || !rpcRes?.success) {
        console.error(
          "[Products] Fallback unavailable update failed:",
          rpcErr?.code,
          rpcErr?.message
        );
        throw new Error(
          "This item is currently in a customer's active cart and could not be removed automatically."
        );
      }

      revalidatePath("/dashboard");
      revalidatePath("/products");
      revalidatePath("/inventory");
      return {
        success: true,
        mode: "UNAVAILABLE_FALLBACK",
        message:
          "This product is currently in an active customer cart, so it has been marked Out of Stock (hidden from new orders) to protect cart integrity.",
      };
    }

    console.error("[Products] Delete shop_product error:", delErr.code, delErr.message);
    throw new Error(`Failed to remove product from storefront: ${delErr.message}`);
  }

  if (!deletedRows || deletedRows.length === 0) {
    throw new Error("Product listing not found or unauthorized.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/inventory");

  return {
    success: true,
    mode: "DELETED",
    message: "Product removed from your storefront catalog.",
  };
}
