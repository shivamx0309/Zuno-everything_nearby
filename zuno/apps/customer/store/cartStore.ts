import { create } from "zustand";

export interface CartItem {
  /** Unique shop_products.id listing identifier */
  id: string;
  shopProductId: string;
  productId?: string;
  name: string;
  price: number;
  mrp?: number;
  discountPercentage?: number;
  unit: string;
  quantity: number;
  shopId: string;
  shopName: string;
  shopDistance?: string;
  image_url?: string | null;
  emoji?: string;
  color?: string;
  stock?: number;
}

export interface ShopCartGroup {
  shopId: string;
  shopName: string;
  shopDistance: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  estimatedTotal: number;
}

export function calculateDeliveryFeeForSubtotal(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= 500 ? 0 : 20;
}

export function groupCartItemsByShop(
  itemsMap: Record<string, CartItem>
): ShopCartGroup[] {
  const grouped: Record<string, ShopCartGroup> = {};
  for (const item of Object.values(itemsMap)) {
    if (!item.shopId) continue;
    if (!grouped[item.shopId]) {
      grouped[item.shopId] = {
        shopId: item.shopId,
        shopName: item.shopName || "Local Shop",
        shopDistance: item.shopDistance || "Nearby",
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        estimatedTotal: 0,
      };
    }
    grouped[item.shopId].items.push(item);
    grouped[item.shopId].subtotal += item.price * item.quantity;
  }

  return Object.values(grouped).map((g) => {
    const subtotal = Math.round(g.subtotal * 100) / 100;
    const deliveryFee = calculateDeliveryFeeForSubtotal(subtotal);
    return {
      ...g,
      subtotal,
      deliveryFee,
      estimatedTotal: Math.round((subtotal + deliveryFee) * 100) / 100,
    };
  });
}

interface CartState {
  activeCheckoutShopId: string | null;
  items: Record<string, CartItem>;
  savedForLater: Record<string, CartItem>;
  setActiveCheckoutShopId: (shopId: string | null) => void;
  addToCart: (product: {
    id: string;
    shopProductId?: string;
    productId?: string;
    name: string;
    price: number;
    mrp?: number;
    discountPercentage?: number;
    unit: string;
    shopId: string;
    shopName?: string;
    shopDistance?: string;
    image_url?: string | null;
    emoji?: string;
    color?: string;
    stock?: number;
  }) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  removeFromCart: (listingId: string) => void;
  removeItemCompletely: (listingId: string) => void;
  moveToSavedForLater: (listingId: string) => void;
  moveToCartFromSaved: (listingId: string) => void;
  clearShopCart: (shopId: string) => void;
  clearCart: () => void;
  getShopGroups: () => ShopCartGroup[];
  getShopItems: (shopId: string) => CartItem[];
  getCartCount: () => number;
  getCartTotal: () => number;
  getDeliveryFee: () => number;
  getPlatformFee: () => number;
  getEstimatedTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  activeCheckoutShopId: null,
  items: {},
  savedForLater: {},

  setActiveCheckoutShopId: (shopId) => set({ activeCheckoutShopId: shopId }),

  addToCart: (product) => {
    if (!product.shopId) {
      return;
    }
    const listingKey = product.shopProductId || product.id;

    set((state) => {
      const existing = state.items[listingKey];
      const nextQty = existing ? existing.quantity + 1 : 1;
      if (
        typeof product.stock === "number" &&
        product.stock >= 0 &&
        nextQty > product.stock
      ) {
        return state;
      }

      return {
        activeCheckoutShopId: state.activeCheckoutShopId || product.shopId,
        items: {
          ...state.items,
          [listingKey]: {
            ...product,
            id: listingKey,
            shopProductId: listingKey,
            shopId: product.shopId,
            shopName: product.shopName || "Local Shop",
            quantity: nextQty,
          },
        },
      };
    });
  },

  updateQuantity: (listingId, quantity) => {
    set((state) => {
      if (quantity <= 0) {
        const nextItems = { ...state.items };
        delete nextItems[listingId];
        return { items: nextItems };
      }

      const existing = state.items[listingId];
      if (!existing) return state;

      const boundedQty =
        typeof existing.stock === "number" && existing.stock > 0
          ? Math.min(quantity, existing.stock)
          : quantity;

      return {
        items: {
          ...state.items,
          [listingId]: {
            ...existing,
            quantity: boundedQty,
          },
        },
      };
    });
  },

  removeFromCart: (listingId) => {
    set((state) => {
      const existing = state.items[listingId];
      if (!existing) return state;

      const nextItems = { ...state.items };
      if (existing.quantity <= 1) {
        delete nextItems[listingId];
      } else {
        nextItems[listingId] = {
          ...existing,
          quantity: existing.quantity - 1,
        };
      }

      return { items: nextItems };
    });
  },

  removeItemCompletely: (listingId) => {
    set((state) => {
      const nextItems = { ...state.items };
      delete nextItems[listingId];
      return { items: nextItems };
    });
  },

  moveToSavedForLater: (listingId) => {
    set((state) => {
      const item = state.items[listingId];
      if (!item) return state;

      const nextItems = { ...state.items };
      delete nextItems[listingId];

      return {
        items: nextItems,
        savedForLater: {
          ...state.savedForLater,
          [listingId]: item,
        },
      };
    });
  },

  moveToCartFromSaved: (listingId) => {
    set((state) => {
      const item = state.savedForLater[listingId];
      if (!item) return state;

      const nextSaved = { ...state.savedForLater };
      delete nextSaved[listingId];

      return {
        savedForLater: nextSaved,
        items: {
          ...state.items,
          [listingId]: item,
        },
      };
    });
  },

  clearShopCart: (shopId) => {
    set((state) => {
      const nextItems: Record<string, CartItem> = {};
      for (const [k, item] of Object.entries(state.items)) {
        if (item.shopId !== shopId) {
          nextItems[k] = item;
        }
      }
      const remainingShopIds = Array.from(
        new Set(Object.values(nextItems).map((i) => i.shopId))
      );
      return {
        items: nextItems,
        activeCheckoutShopId:
          state.activeCheckoutShopId === shopId
            ? remainingShopIds[0] || null
            : state.activeCheckoutShopId,
      };
    });
  },

  clearCart: () =>
    set({ items: {}, savedForLater: {}, activeCheckoutShopId: null }),

  getShopGroups: () => groupCartItemsByShop(get().items),

  getShopItems: (shopId) =>
    Object.values(get().items).filter((item) => item.shopId === shopId),

  getCartCount: () => {
    const items = get().items;
    return Object.values(items).reduce((sum, item) => sum + item.quantity, 0);
  },

  getCartTotal: () => {
    const items = get().items;
    return Object.values(items).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  },

  getDeliveryFee: () => calculateDeliveryFeeForSubtotal(get().getCartTotal()),

  getPlatformFee: () => 0,

  getEstimatedTotal: () => {
    const subtotal = get().getCartTotal();
    if (subtotal === 0) return 0;
    return subtotal + calculateDeliveryFeeForSubtotal(subtotal);
  },
}));
