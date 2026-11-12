import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StatusBar,
  Image,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Trash2,
  Store,
  ChevronRight,
  ArrowRight,
  ShoppingBag,
  Info,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react-native";
import { posthog } from "@/lib/posthog";
import { analytics } from "@/lib/analytics";
import {
  useCartStore,
  CartItem,
  calculateDeliveryFeeForSubtotal,
} from "@/store/cartStore";
import { getPopularProducts, type CategoryProduct } from "@/features/products/api";
import { getPublicStorefrontsByIds, type ShopData } from "@/features/shops/api";
import { getProductImageSource } from "@/assets/productImages";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

export default function CartScreen() {
  const router = useRouter();

  const cartItemsObj = useCartStore((state) => state.items);
  const savedForLaterObj = useCartStore((state) => state.savedForLater);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItemCompletely = useCartStore((state) => state.removeItemCompletely);
  const moveToSavedForLater = useCartStore((state) => state.moveToSavedForLater);
  const moveToCartFromSaved = useCartStore((state) => state.moveToCartFromSaved);
  const clearCart = useCartStore((state) => state.clearCart);
  const addToCartStore = useCartStore((state) => state.addToCart);
  const setActiveCheckoutShopId = useCartStore(
    (state) => state.setActiveCheckoutShopId
  );

  const cartCount = useCartStore((state) => state.getCartCount());
  const cartSubtotal = useCartStore((state) => state.getCartTotal());
  const deliveryFee = useCartStore((state) => state.getDeliveryFee());
  const platformFee = useCartStore((state) => state.getPlatformFee());
  const estimatedTotal = useCartStore((state) => state.getEstimatedTotal());

  const [showSavedSection, setShowSavedSection] = useState(true);
  const [liveStorefronts, setLiveStorefronts] = useState<
    Record<string, ShopData>
  >({});
  const [loadingStorefronts, setLoadingStorefronts] = useState(false);
  const [popularSuggestions, setPopularSuggestions] = useState<
    CategoryProduct[]
  >([]);

  const cartItemsList = useMemo(() => Object.values(cartItemsObj), [cartItemsObj]);
  const savedForLaterList = useMemo(() => Object.values(savedForLaterObj), [savedForLaterObj]);

  // Group items strictly by shop_id (One order = one shop)
  const itemsByShop = useMemo(() => {
    const map: Record<
      string,
      {
        shopName: string;
        shopDistance: string;
        items: CartItem[];
        subtotal: number;
        deliveryFee: number;
        total: number;
      }
    > = {};
    cartItemsList.forEach((item) => {
      const sId = item.shopId;
      if (!sId) return;
      const sName = item.shopName || "Local Shop";
      const sDist = item.shopDistance || "Nearby";

      if (!map[sId]) {
        map[sId] = {
          shopName: sName,
          shopDistance: sDist,
          items: [],
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
        };
      }
      map[sId].items.push(item);
      map[sId].subtotal += item.price * item.quantity;
    });

    Object.values(map).forEach((group) => {
      group.subtotal = Math.round(group.subtotal * 100) / 100;
      group.deliveryFee = calculateDeliveryFeeForSubtotal(group.subtotal);
      group.total =
        Math.round((group.subtotal + group.deliveryFee) * 100) / 100;
    });

    return map;
  }, [cartItemsList]);

  const shopKeys = Object.keys(itemsByShop);
  const isSingleShop = shopKeys.length <= 1;

  useEffect(() => {
    let mounted = true;
    async function loadStorefronts() {
      if (shopKeys.length === 0) {
        if (mounted) setLiveStorefronts({});
        return;
      }
      setLoadingStorefronts(true);
      try {
        const res = await getPublicStorefrontsByIds(shopKeys);
        if (mounted) setLiveStorefronts(res);
      } finally {
        if (mounted) setLoadingStorefronts(false);
      }
    }
    loadStorefronts();
    return () => {
      mounted = false;
    };
  }, [shopKeys.join(",")]);

  useEffect(() => {
    let mounted = true;
    if (cartCount === 0) {
      getPopularProducts()
        .then((list) => {
          if (mounted) setPopularSuggestions(list.slice(0, 4));
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [cartCount]);

  const handleProceedToShopCheckout = (targetShopId: string) => {
    const group = itemsByShop[targetShopId];
    if (!group) return;
    setActiveCheckoutShopId(targetShopId);
    analytics.trackCheckoutStarted?.({
      cartTotal: group.total,
      cartCount: group.items.reduce((s, i) => s + i.quantity, 0),
    });
    posthog?.capture("checkout_clicked", {
      shop_id: targetShopId,
      cart_total: group.total,
      cart_count: group.items.length,
      shop_count: shopKeys.length,
    });
    router.push(`/checkout?shopId=${encodeURIComponent(targetShopId)}` as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/" as never);
              }
            }}
          >
            <ArrowLeft size={20} color={DARK} />
          </Pressable>

          <Text style={styles.headerTitle}>
            Your Cart ({cartCount})
          </Text>

          {cartCount > 0 ? (
            <Pressable onPress={clearCart}>
              <Text style={styles.clearCartText}>Clear Cart</Text>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {cartCount === 0 && savedForLaterList.length === 0 ? (
          /* Empty Cart State (Matching Screen 3) */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.emptyScroll}
          >
            <View style={styles.emptyIllustrationBox}>
              <View style={styles.emptyIconCircle}>
                <ShoppingBag size={48} color={GREEN} />
              </View>
              <Text style={styles.emptyTitle}>Your cart is empty</Text>
              <Text style={styles.emptySub}>
                Looks like you haven't added anything yet.
              </Text>
              <Pressable
                style={styles.continueShopBtn}
                onPress={() => router.push("/categories" as never)}
              >
                <Text style={styles.continueShopBtnText}>Continue Shopping</Text>
              </Pressable>
            </View>

            {/* Popular Near You Shortcuts */}
            <View style={styles.emptySection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Popular near you</Text>
                <Pressable onPress={() => router.push("/categories" as never)}>
                  <Text style={styles.seeAll}>See all →</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}
              >
                {popularSuggestions.map((item) => (
                  <View key={item.id} style={styles.popularCard}>
                    <View style={[styles.popularImgContainer, { backgroundColor: item.color || LIGHT_GREEN }]}>
                      <Text style={{ fontSize: 32 }}>{item.emoji || "📦"}</Text>
                    </View>
                    <Text style={styles.popularName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.popularUnit}>{item.unit}</Text>
                    <View style={styles.popularBottom}>
                      <Text style={styles.popularPrice}>₹{item.price}</Text>
                      <Pressable
                        style={styles.popularAddBtn}
                        onPress={() =>
                          addToCartStore({
                            id: item.id,
                            shopProductId: item.shopProductId,
                            productId: item.productId,
                            name: item.name,
                            price: item.price,
                            unit: item.unit,
                            shopId: item.shopId,
                            shopName: item.shopName,
                            stock: item.stock,
                          })
                        }
                      >
                        <Text style={styles.popularAddText}>Add</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        ) : (
          /* Active Cart State */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Single Shop / Multi Shop Context Banner */}
            {shopKeys.length > 0 && (
              <View style={styles.singleShopBanner}>
                <View style={styles.singleShopIconCircle}>
                  <Store size={18} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.singleShopTitle}>
                    {isSingleShop
                      ? "Items from a single shop"
                      : `One order per shop (${shopKeys.length} shops in cart)`}
                  </Text>
                  <Text style={styles.singleShopSub}>
                    {isSingleShop
                      ? `You're shopping from ${itemsByShop[shopKeys[0]].shopName}`
                      : "Each shop is checked out separately so orders, stock, and delivery stay independent."}
                  </Text>
                </View>
                <ChevronRight size={16} color={MUTED} />
              </View>
            )}

            {/* Cart Items Grouped By Shop */}
            {shopKeys.map((sId) => {
              const shopGroup = itemsByShop[sId];
              const liveSf = liveStorefronts[sId];
              const avail = liveSf?.availability;
              const isChecking = loadingStorefronts && !liveSf;
              const isShopOpen = avail ? avail.isOpenNow : false;
              const canCheckoutGroup = Boolean(
                liveSf && avail?.canAcceptDeliveryOrder
              );
              const statusText = isChecking
                ? "Checking live status..."
                : !liveSf
                ? "Offline / Unavailable"
                : `${avail?.openStatusLabel || "Closed"} · ${
                    avail?.deliveryStatusLabel || "Delivery Unavailable"
                  }`;

              return (
                <View key={sId} style={styles.shopGroupCard}>
                  {/* Shop Info Header */}
                  <Pressable
                    style={styles.shopGroupHeader}
                    onPress={() => router.push(`/shop/${sId}` as never)}
                  >
                    <View style={styles.shopHeaderIconBox}>
                      <Store size={16} color={GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shopGroupTitle}>
                        {liveSf?.name || shopGroup.shopName}
                      </Text>
                      <View style={styles.shopStatusRow}>
                        <View
                          style={[
                            styles.greenDot,
                            !isShopOpen && !isChecking && { backgroundColor: "#DC2626" },
                          ]}
                        />
                        <Text style={styles.shopStatusText}>
                          {statusText} · {shopGroup.shopDistance}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={16} color={MUTED} />
                  </Pressable>

                  {/* Cart Item Cards */}
                  {shopGroup.items.map((item) => (
                    <View key={item.id} style={styles.cartItemRow}>
                      <View style={[styles.itemImgBox, { backgroundColor: item.color || LIGHT_GREEN }]}>
                        {getProductImageSource(item) ? (
                          <Image
                            source={getProductImageSource(item)!}
                            style={styles.itemImg}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={{ fontSize: 32 }}>{item.emoji || "🍅"}</Text>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemUnit}>{item.unit}</Text>

                        <View style={styles.itemPriceRow}>
                          <Text style={styles.itemPrice}>₹{item.price}</Text>
                          {item.mrp && item.mrp > item.price && (
                            <Text style={styles.itemMrp}>₹{item.mrp}</Text>
                          )}
                          {item.discountPercentage && (
                            <View style={styles.itemDiscountBadge}>
                              <Text style={styles.itemDiscountText}>
                                {item.discountPercentage}% OFF
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Stepper + Actions */}
                      <View style={styles.itemActionCol}>
                        <Pressable
                          style={styles.trashBtn}
                          onPress={() => removeItemCompletely(item.id)}
                        >
                          <Trash2 size={16} color={MUTED} />
                        </Pressable>

                        <View style={styles.stepperBox}>
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Text style={styles.stepperText}>−</Text>
                          </Pressable>
                          <Text style={styles.stepperQty}>{item.quantity}</Text>
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Text style={styles.stepperText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* Shop Group Summary & Independent Checkout Button */}
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F2", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: "600" }}>
                        Subtotal ₹{shopGroup.subtotal} · Delivery{" "}
                        {shopGroup.deliveryFee === 0 ? "FREE" : `₹${shopGroup.deliveryFee}`}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "900", color: DARK }}>
                        Order Total: ₹{shopGroup.total}
                      </Text>
                    </View>

                    <Pressable
                      style={[
                        styles.checkoutBtn,
                        (!canCheckoutGroup || isChecking) && { opacity: 0.5 },
                      ]}
                      disabled={!canCheckoutGroup || isChecking}
                      onPress={() => handleProceedToShopCheckout(sId)}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={styles.checkoutBtnText}>
                          {isChecking
                            ? "Checking..."
                            : canCheckoutGroup
                            ? "Checkout Shop"
                            : "Unavailable"}
                        </Text>
                        <ArrowRight size={14} color="#FFFFFF" />
                      </View>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Saved For Later Accordion Section */}
            {savedForLaterList.length > 0 && (
              <View style={styles.savedSection}>
                <Pressable
                  style={styles.savedHeader}
                  onPress={() => setShowSavedSection(!showSavedSection)}
                >
                  <Text style={styles.savedTitle}>
                    Saved for later ({savedForLaterList.length})
                  </Text>
                  {showSavedSection ? (
                    <ChevronUp size={18} color={MUTED} />
                  ) : (
                    <ChevronDown size={18} color={MUTED} />
                  )}
                </Pressable>

                {showSavedSection && (
                  <View style={styles.savedContent}>
                    {savedForLaterList.map((item) => (
                      <View key={item.id} style={styles.savedRow}>
                        <Text style={{ fontSize: 24 }}>{item.emoji || "📦"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.savedName}>{item.name}</Text>
                          <Text style={styles.savedPrice}>
                            ₹{item.price} · {item.unit}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.moveToCartBtn}
                          onPress={() => moveToCartFromSaved(item.id)}
                        >
                          <Text style={styles.moveToCartText}>Move to Cart</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Add More Items Banner */}
            <Pressable
              style={styles.addMoreBanner}
              onPress={() => router.push("/categories" as never)}
            >
              <View style={styles.addMoreIconBox}>
                <Plus size={16} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addMoreTitle}>Want to add more items?</Text>
                <Text style={styles.addMoreSub}>Browse fruits, vegetables, dairy & snacks</Text>
              </View>
              <Text style={styles.addMoreBtnText}>Continue Shopping →</Text>
            </Pressable>

            {/* Price Breakdown Summary */}
            <View style={styles.billBox}>
              <Text style={styles.billTitle}>Bill Summary</Text>

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Items total</Text>
                <Text style={styles.billValue}>₹{cartSubtotal}</Text>
              </View>

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery fee</Text>
                <Text style={styles.billValue}>
                  {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                </Text>
              </View>

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Platform fee</Text>
                <Text style={styles.billValue}>₹{platformFee}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.billRowTotal}>
                <Text style={styles.totalLabel}>Estimated Total</Text>
                <Text style={styles.totalValue}>₹{estimatedTotal}</Text>
              </View>

              <View style={styles.disclaimerRow}>
                <Info size={14} color={MUTED} />
                <Text style={styles.disclaimerText}>
                  Final amount may vary slightly based on availability, offers and shop confirmation.
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Sticky Bottom Checkout Action Bar */}
        {cartCount > 0 && (
          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.bottomCount}>{cartCount} item{cartCount > 1 ? "s" : ""}</Text>
              <Text style={styles.bottomTotal}>₹{estimatedTotal}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                style={styles.continueShoppingSecondaryBtn}
                onPress={() => router.push("/categories" as never)}
              >
                <Text style={styles.continueShoppingSecondaryText}>+ Add More</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.checkoutBtn,
                  (!isSingleShop ||
                    shopKeys.length === 0 ||
                    !liveStorefronts[shopKeys[0]]?.availability
                      ?.canAcceptDeliveryOrder) && { opacity: 0.5 },
                ]}
                disabled={
                  !isSingleShop ||
                  shopKeys.length === 0 ||
                  !liveStorefronts[shopKeys[0]]?.availability
                    ?.canAcceptDeliveryOrder
                }
                onPress={() => handleProceedToShopCheckout(shopKeys[0])}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.checkoutBtnText}>
                    {isSingleShop ? "Confirm Order" : "Select Shop Above"}
                  </Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </View>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEFEA",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8EEE8",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: DARK,
  },
  clearCartText: {
    color: "#E53935",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  emptyScroll: {
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  emptyIllustrationBox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 30,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: DARK,
  },
  emptySub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    textAlign: "center",
  },
  continueShopBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  continueShopBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  emptySection: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN,
  },
  popularRow: {
    gap: 12,
  },
  popularCard: {
    width: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  popularImgContainer: {
    height: 80,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  popularName: {
    fontSize: 12,
    fontWeight: "800",
    color: DARK,
  },
  popularUnit: {
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
  },
  popularBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  popularPrice: {
    fontSize: 12.5,
    fontWeight: "900",
    color: DARK,
  },
  popularAddBtn: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  popularAddText: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
  },
  singleShopBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT_GREEN,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  singleShopIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  singleShopTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: GREEN,
  },
  singleShopSub: {
    fontSize: 10.5,
    color: "#40564A",
  },
  shopGroupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  shopGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F6F4",
    gap: 10,
    marginBottom: 10,
  },
  shopHeaderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  shopGroupTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
  },
  shopStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#22A06B",
  },
  shopStatusText: {
    fontSize: 10.5,
    color: MUTED,
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAF8",
    gap: 12,
  },
  itemImgBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemImg: {
    width: "80%",
    height: "80%",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
  },
  itemUnit: {
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
  },
  itemPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
  },
  itemMrp: {
    fontSize: 10.5,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  itemDiscountBadge: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemDiscountText: {
    color: GREEN,
    fontSize: 9,
    fontWeight: "800",
  },
  itemActionCol: {
    alignItems: "flex-end",
    gap: 10,
  },
  trashBtn: {
    padding: 2,
  },
  stepperBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT_GREEN,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 6,
  },
  stepperBtn: {
    paddingHorizontal: 4,
  },
  stepperText: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "900",
  },
  stepperQty: {
    fontSize: 12,
    fontWeight: "800",
    color: DARK,
  },
  savedSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    overflow: "hidden",
  },
  savedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  savedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  savedContent: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  savedName: {
    fontSize: 12.5,
    fontWeight: "800",
    color: DARK,
  },
  savedPrice: {
    fontSize: 11,
    color: MUTED,
  },
  moveToCartBtn: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  moveToCartText: {
    color: GREEN,
    fontSize: 11,
    fontWeight: "800",
  },
  billBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  billTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK,
    marginBottom: 12,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 12.5,
    color: MUTED,
  },
  billValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: DARK,
  },
  divider: {
    height: 1,
    backgroundColor: "#EAEFEA",
    marginVertical: 10,
  },
  billRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 12,
    backgroundColor: "#F4F6F4",
    padding: 10,
    borderRadius: 10,
  },
  disclaimerText: {
    fontSize: 10.5,
    color: MUTED,
    flex: 1,
    lineHeight: 15,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EAEFEA",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  bottomCount: {
    fontSize: 11,
    color: MUTED,
  },
  bottomTotal: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
  },
  checkoutBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  checkoutBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  continueShoppingSecondaryBtn: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN,
  },
  continueShoppingSecondaryText: {
    color: GREEN,
    fontSize: 12.5,
    fontWeight: "800",
  },
  addMoreBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  addMoreIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  addMoreTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: DARK,
  },
  addMoreSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
  },
  addMoreBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: GREEN,
  },
});
