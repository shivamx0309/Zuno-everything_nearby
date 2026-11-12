import { supabase } from "../../lib/supabase";
import {
  calculateDeliveryFeeForSubtotal,
  type CartItem,
} from "../../store/cartStore";
import { evaluateShopAvailability } from "@zuno/utils";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateOrderRpcItem {
  shop_product_id: string;
  quantity: number;
}

export interface CreateOrderRpcPayload {
  p_shop_id: string;
  p_address_id: string;
  p_items: CreateOrderRpcItem[];
  p_idempotency_key: string;
}

export function validateSingleShopCartItems(items: CartItem[]): {
  valid: boolean;
  shopId?: string;
  error?: string;
} {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: "Your cart is empty." };
  }

  const shopIds = Array.from(
    new Set(items.map((item) => item.shopId).filter(Boolean))
  );

  if (shopIds.length === 0) {
    return { valid: false, error: "Shop information missing for cart items." };
  }

  if (shopIds.length > 1) {
    return {
      valid: false,
      error:
        "One order can only include items from one shop. Checkout one shop group at a time.",
    };
  }

  const shopId = shopIds[0];
  if (!UUID_REGEX.test(shopId)) {
    return { valid: false, error: "Invalid shop identifier selected." };
  }

  for (const item of items) {
    const listingId = item.shopProductId || item.id;
    if (!listingId || !UUID_REGEX.test(listingId)) {
      return {
        valid: false,
        error: `Invalid product listing identifier for "${item.name}".`,
      };
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return {
        valid: false,
        error: `Invalid quantity for "${item.name}".`,
      };
    }
  }

  return { valid: true, shopId };
}

export function buildCreateCustomerOrderRpcPayload(
  shopId: string,
  addressId: string,
  items: CartItem[],
  idempotencyKey: string
): CreateOrderRpcPayload {
  return {
    p_shop_id: shopId,
    p_address_id: addressId,
    p_items: items.map((item) => ({
      shop_product_id: item.shopProductId || item.id,
      quantity: item.quantity,
    })),
    p_idempotency_key: idempotencyKey,
  };
}

export async function validateCheckoutShopAvailability(
  shopId: string
): Promise<{
  available: boolean;
  reasonCode: string;
  message?: string;
  shopName?: string;
}> {
  if (!shopId || !UUID_REGEX.test(shopId)) {
    return {
      available: false,
      reasonCode: "INVALID_SHOP",
      message: "Invalid shop selected for checkout.",
    };
  }

  try {
    const { data, error } = await supabase
      .from("public_storefronts")
      .select("id, name, is_active, is_delivery_available, opening_hours")
      .eq("id", shopId)
      .maybeSingle();

    if (error) {
      return {
        available: false,
        reasonCode: "LOOKUP_FAILED",
        message: "Unable to verify shop availability right now. Please retry.",
      };
    }

    if (!data) {
      return {
        available: false,
        reasonCode: "SHOP_OFFLINE",
        message: "This shop is currently offline or unavailable.",
      };
    }

    const evaluation = evaluateShopAvailability({
      isActive: data.is_active,
      isDeliveryAvailable: data.is_delivery_available,
      openingHours: data.opening_hours,
    });

    if (!evaluation.canAcceptDeliveryOrder) {
      return {
        available: false,
        reasonCode: evaluation.reasonCode,
        message:
          evaluation.blockingMessage ||
          "This shop is not accepting delivery orders right now.",
        shopName: data.name,
      };
    }

    return {
      available: true,
      reasonCode: "OPEN",
      shopName: data.name,
    };
  } catch {
    return {
      available: false,
      reasonCode: "LOOKUP_FAILED",
      message: "Unable to verify shop availability right now. Please retry.",
    };
  }
}

export interface CheckoutQuoteInput {
  addressId?: string;
  pincode: string;
  items: CartItem[];
  paymentMethod: "COD" | "UPI" | "ONLINE";
  couponCode?: string;
  deliveryInstructions?: string;
}

export interface CheckoutQuoteResult {
  isServiceable: boolean;
  shopAvailable: boolean;
  serviceMessage?: string;
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  discount: number;
  total: number;
  items: CartItem[];
  shopId: string;
  shopName: string;
}

export interface PlaceOrderInput extends CheckoutQuoteInput {
  quote: CheckoutQuoteResult;
  idempotencyKey: string;
}

export interface PlaceOrderResult {
  success: boolean;
  code?: "UNAUTHENTICATED" | "VALIDATION_ERROR" | "REJECTED";
  orderId?: string;
  orderNumber?: string;
  total?: number;
  idempotentReplay?: boolean;
  message?: string;
}

export async function calculateCheckoutQuote(
  input: CheckoutQuoteInput
): Promise<CheckoutQuoteResult> {
  const { pincode, items } = input;
  const shopCheck = validateSingleShopCartItems(items);

  if (!shopCheck.valid || !shopCheck.shopId) {
    return {
      isServiceable: false,
      shopAvailable: false,
      serviceMessage: shopCheck.error || "Invalid checkout cart items.",
      subtotal: 0,
      deliveryFee: 0,
      platformFee: 0,
      discount: 0,
      total: 0,
      items,
      shopId: items[0]?.shopId || "",
      shopName: items[0]?.shopName || "Local Shop",
    };
  }

  const shopId = shopCheck.shopId;
  const isPincodeServiceable = pincode === "231217";
  let serviceMessage = isPincodeServiceable
    ? "Service available in Renukoot - 231217"
    : "PIN code currently not serviceable by ZUNO (only 231217 supported in local MVP).";

  const availabilityCheck = await validateCheckoutShopAvailability(shopId);
  let shopAvailable = availabilityCheck.available;
  let shopName =
    availabilityCheck.shopName || items[0]?.shopName || "Local Shop";

  if (!availabilityCheck.available && availabilityCheck.message) {
    serviceMessage = availabilityCheck.message;
  }

  // Hydrate authoritative listing price & stock from shop_products
  let pricedItems = items;
  let listingErrorMsg: string | null = null;

  try {
    const listingIds = items.map((it) => it.shopProductId || it.id);
    const { data: liveListings, error: listErr } = await supabase
      .from("shop_products")
      .select("id, shop_id, price, stock, available, inventory(quantity)")
      .in("id", listingIds);

    if (listErr || !liveListings || liveListings.length !== listingIds.length) {
      listingErrorMsg =
        "Some items in this cart are no longer available at the shop.";
      shopAvailable = false;
    } else {
      const byId = new Map<string, any>();
      liveListings.forEach((row: any) => byId.set(row.id, row));

      pricedItems = items.map((it) => {
        const lid = it.shopProductId || it.id;
        const row = byId.get(lid);
        if (!row || row.shop_id !== shopId) {
          listingErrorMsg = `"${it.name}" does not belong to ${shopName}.`;
          return it;
        }
        const inv = Array.isArray(row.inventory)
          ? row.inventory[0]
          : row.inventory;
        const effectiveStock =
          inv && typeof inv.quantity === "number"
            ? Math.min(Number(row.stock), Number(inv.quantity))
            : Number(row.stock);

        if (!row.available || effectiveStock < it.quantity) {
          listingErrorMsg = `Insufficient stock for "${it.name}" (available: ${Math.max(0, effectiveStock)}).`;
        }
        return {
          ...it,
          price: Number(row.price),
          stock: Math.max(0, effectiveStock),
        };
      });

      if (listingErrorMsg) {
        shopAvailable = false;
      }
    }
  } catch {
    listingErrorMsg = "Unable to verify live item prices and stock.";
    shopAvailable = false;
  }

  if (listingErrorMsg) {
    serviceMessage = listingErrorMsg;
  }

  const subtotal =
    Math.round(
      pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0) *
        100
    ) / 100;
  const deliveryFee = calculateDeliveryFeeForSubtotal(subtotal);
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  return {
    isServiceable: isPincodeServiceable && shopAvailable,
    shopAvailable,
    serviceMessage,
    subtotal,
    deliveryFee,
    platformFee: 0,
    discount: 0,
    total,
    items: pricedItems,
    shopId,
    shopName,
  };
}

export async function placeOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return {
        success: false,
        code: "UNAUTHENTICATED",
        message: "Please sign in with your customer account to place an order.",
      };
    }

    if (!input.addressId || !UUID_REGEX.test(input.addressId)) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Please select a saved delivery address from your account.",
      };
    }

    const cartCheck = validateSingleShopCartItems(input.items);
    if (!cartCheck.valid || !cartCheck.shopId) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: cartCheck.error || "Invalid checkout items.",
      };
    }

    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Missing checkout idempotency token. Please retry.",
      };
    }

    const payload = buildCreateCustomerOrderRpcPayload(
      cartCheck.shopId,
      input.addressId,
      input.items,
      input.idempotencyKey.trim()
    );

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "create_customer_order",
      payload
    );

    if (rpcErr || !rpcData || !rpcData.success || !rpcData.order_id) {
      return {
        success: false,
        code: "REJECTED",
        message:
          rpcErr?.message ||
          rpcData?.message ||
          "Order could not be placed. Please review shop availability and stock.",
      };
    }

    const orderId = String(rpcData.order_id);
    const orderNumber = `ZUNO-${orderId.slice(0, 6).toUpperCase()}`;

    return {
      success: true,
      orderId,
      orderNumber,
      total: Number(rpcData.total ?? input.quote.total),
      idempotentReplay: Boolean(rpcData.idempotent_replay),
      message: "Order placed successfully!",
    };
  } catch (err: any) {
    return {
      success: false,
      code: "REJECTED",
      message: err?.message || "Failed to place order. Please try again.",
    };
  }
}
