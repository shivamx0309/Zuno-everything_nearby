import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  Image,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  MapPin,
  Search,
  ChevronDown,
  ArrowRight,
  X,
  Clock,
  Bike,
  Store,
  ShoppingBag,
  Package,
  PackageCheck,
  ChevronRight,
} from "lucide-react-native";
import { posthog } from "@/lib/posthog";
import { posthogLog } from "@/lib/posthog-logs";
import { analytics } from "@/lib/analytics";
import { useCartStore } from "@/store/cartStore";
import { getNearbyShops, ShopData } from "@/features/shops/api";
import { getPopularProducts, ProductData } from "@/features/products/api";
import {
  getCustomerOrders,
  getActiveCustomerOrder,
  subscribeToOrderRealtime,
  CustomerOrder,
  ActiveOrderSummary,
} from "@/features/orders/api";
import {
  getUnreadNotificationCount,
  subscribeToNotificationsRealtime,
} from "@/features/notifications/api";
import { getProductImageSource } from "@/assets/productImages";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

const categories = [
  {
    id: "1",
    name: "Vegetables",
    image: require("../../assets/vegetable_head.png"),
    emoji: "🥦",
  },
  {
    id: "2",
    name: "Fruits",
    image: require("../../assets/Fruit_head.png"),
    emoji: "🍎",
  },
  {
    id: "3",
    name: "Grocery",
    image: require("../../assets/grocery_head.png"),
    emoji: "🛒",
  },
  {
    id: "4",
    name: "Dairy",
    image: require("../../assets/dairy_head.png"),
    emoji: "🥛",
  },
  {
    id: "6",
    name: "Snacks",
    image: require("../../assets/snacks_head.jpg"),
    emoji: "🍿",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [shops, setShops] = useState<ShopData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [recentOrders, setRecentOrders] = useState<CustomerOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSummary | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const cartItems = useCartStore((state) => state.items);
  const addToCartStore = useCartStore((state) => state.addToCart);
  const removeFromCartStore = useCartStore((state) => state.removeFromCart);
  const cartCount = useCartStore((state) => state.getCartCount());
  const cartTotal = useCartStore((state) => state.getCartTotal());

  const fetchActiveOrder = async () => {
    try {
      const active = await getActiveCustomerOrder();
      setActiveOrder(active);
    } catch {
      setActiveOrder(null);
    }
  };

  const fetchUnreadNotifs = async () => {
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    analytics.trackAppOpened();

    async function loadData() {
      setLoading(true);
      try {
        const [shopsData, productsData, ordersData, activeData, unreadData] = await Promise.all([
          getNearbyShops(),
          getPopularProducts(),
          getCustomerOrders(),
          getActiveCustomerOrder(),
          getUnreadNotificationCount(),
        ]);
        setShops(shopsData);
        setProducts(productsData);
        setRecentOrders(ordersData);
        setActiveOrder(activeData);
        setUnreadCount(unreadData);
      } catch (err) {
        console.error("Error loading home page data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Subscribe to notifications realtime
    const unsubNotifs = subscribeToNotificationsRealtime(() => {
      fetchUnreadNotifs();
      fetchActiveOrder();
    });

    return () => {
      unsubNotifs();
    };
  }, []);

  useEffect(() => {
    if (!activeOrder?.id) return;

    // Subscribe to realtime status updates for current active order
    const unsubOrder = subscribeToOrderRealtime(activeOrder.id, (newStatus) => {
      const isFinal =
        newStatus === "DELIVERED" ||
        newStatus === "CANCELLED" ||
        newStatus === "REJECTED";

      if (isFinal) {
        setActiveOrder(null);
      } else {
        setActiveOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    });

    return () => {
      unsubOrder();
    };
  }, [activeOrder?.id]);

  const filteredProducts = useMemo(() => {
    if (search.trim().length > 0) {
      analytics.trackSearchPerformed({
        query: search,
        resultsCount: products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase())
        ).length,
      });
    }
    return products.filter((product) =>
      product.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, products]);

  const handleAddToCart = (product: ProductData) => {
    if (!product.inStock || !product.shop?.canOrder) return;

    addToCartStore({
      id: product.id,
      shopProductId: product.shopProductId || product.id,
      productId: product.productId,
      name: product.name,
      price: product.price,
      unit: product.unit,
      shopId: product.shopId,
      shopName: product.shopName,
      shopDistance: product.shop?.distance,
      stock: product.stock,
      image_url: product.image_url,
      emoji: product.emoji,
      color: product.color,
    });
    analytics.trackAddToCart({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: (cartItems[product.id]?.quantity || 0) + 1,
    });
    posthog?.capture("product_added_to_cart", {
      product_id: product.id,
      shop_id: product.shopId,
      unit_price: product.price,
      currency: "INR",
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    removeFromCartStore(productId);
    posthog?.capture("product_removed_from_cart", {
      product_id: productId,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.screen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Image
                source={require("../../assets/brandlogo.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <Pressable
              style={styles.notification}
              onPress={() => router.push("/notifications" as never)}
            >
              <Bell size={18} color={GREEN} />
              {unreadCount > 0 && <View style={styles.notificationDot} />}
            </Pressable>
          </View>

          {/* Location Bar */}
          <Pressable style={styles.locationRow}>
            <View style={styles.locationPinBadge}>
              <MapPin size={16} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>Delivering to</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
                <Text style={styles.locationName}>Renukoot - 231217</Text>
                <ChevronDown size={14} color={DARK} style={{ marginLeft: 3 }} />
              </View>
            </View>
            <Text style={styles.locationChange}>Change</Text>
          </Pressable>

          {/* Search Input */}
          <View style={styles.searchBox}>
            <Search size={18} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search groceries, fruits, shops..."
              placeholderTextColor="#89948D"
              style={[styles.searchInput, { outlineStyle: "none", outlineWidth: 0 } as any]}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <X size={16} color={MUTED} style={{ paddingHorizontal: 4 }} />
              </Pressable>
            )}
          </View>

          {/* Promotional Hero Banner */}
          <View style={styles.hero}>
            <View style={styles.heroContent}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>EVERYTHING NEARBY</Text>
              </View>

              <Text style={styles.heroTitle}>
                Fresh groceries,{"\n"}
                <Text style={styles.heroHighlight}>local shops.</Text>
              </Text>

              <Text style={styles.heroDescription}>
                Fruits, vegetables & daily essentials delivered fast.
              </Text>

              <Pressable
                style={styles.heroButton}
                onPress={() => router.push("/categories" as never)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={styles.heroButtonText}>Shop Now</Text>
                  <ArrowRight size={12} color="#FFFFFF" />
                </View>
              </Pressable>
            </View>

            <View style={styles.heroArt}>
              <Image
                source={require("../../assets/HeroHome.png")}
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.heroCircle} />
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Shop by category</Text>
            <Pressable onPress={() => router.push("/categories" as never)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={styles.seeAll}>See all</Text>
                <ArrowRight size={13} color="#22A06B" />
              </View>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
          >
            {categories.map((category) => (
              <Pressable
                key={category.id}
                style={styles.categoryItem}
                onPress={() => {
                  posthog?.capture("category_selected", {
                    category_id: category.id,
                    category_name: category.name,
                  });
                  setSelectedCategory(category.name);
                }}
              >
                <View
                  style={[
                    styles.categoryIcon,
                    selectedCategory === category.name && styles.categorySelected,
                  ]}
                >
                  {category.image ? (
                    <Image
                      source={category.image}
                      style={styles.categoryImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.categoryName,
                    selectedCategory === category.name && styles.categoryNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Nearby Shops */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Nearby shops</Text>
              <Text style={styles.sectionSubtitle}>Discover stores around you</Text>
            </View>
            <Pressable onPress={() => router.push("/categories" as never)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={styles.seeAll}>See all</Text>
                <ArrowRight size={13} color="#22A06B" />
              </View>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shopList}
          >
            {shops.map((shop) => (
              <Pressable
                key={shop.id}
                style={styles.shopCard}
                onPress={() => {
                  posthog?.capture("shop_opened", {
                    shop_id: shop.id,
                    shop_type: shop.type,
                  });
                  posthogLog.shopOpened({
                    shopId: shop.id,
                    shopType: shop.type,
                  });
                  router.push(`/shop/${shop.id}` as never);
                }}
              >
                <View style={[styles.shopImage, { backgroundColor: shop.color || "#EAF4E5" }]}>
                  {shop.image ? (
                    <Image
                      source={shop.image}
                      style={styles.shopCardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.shopEmoji}>{shop.emoji || "🏪"}</Text>
                  )}
                  <View style={styles.openBadge}>
                    <View
                      style={[
                        styles.openDot,
                        shop.isOpenNow === false && styles.closedDot,
                      ]}
                    />
                    <Text style={styles.openText}>
                      {shop.availability?.openStatusLabel ||
                        (shop.isOpenNow === false ? "Closed" : "Open")}
                    </Text>
                  </View>
                  {shop.isDeliveryAvailable === false && (
                    <View style={styles.deliveryPausedBadge}>
                      <Text style={styles.deliveryPausedText}>Delivery Paused</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.shopName} numberOfLines={1}>
                  {shop.name}
                </Text>
                <Text style={styles.shopType} numberOfLines={1}>
                  {shop.type}
                </Text>
                <View style={styles.shopMeta}>
                  <Text style={styles.rating}>★ {shop.rating}</Text>
                  <Text style={styles.distance}>· {shop.distance}</Text>
                </View>
                <Text
                  style={[
                    styles.shopDeliveryMeta,
                    shop.isDeliveryAvailable === false &&
                      styles.shopDeliveryMetaPaused,
                  ]}
                  numberOfLines={1}
                >
                  {shop.deliveryStatusLabel ||
                    (shop.isDeliveryAvailable === false
                      ? "Delivery Temporarily Paused"
                      : "Delivery Available")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Popular Near You Products */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Popular near you</Text>
              <Text style={styles.sectionSubtitle}>Everyday essentials for you</Text>
            </View>
            <Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={styles.seeAll}>See all</Text>
                <ArrowRight size={13} color="#22A06B" />
              </View>
            </Pressable>
          </View>

          <View style={styles.productGrid}>
            {filteredProducts.map((product) => {
              const currentQty = cartItems[product.id]?.quantity || 0;

              return (
                <View key={product.id} style={styles.productCard}>
                  <View style={[styles.productImage, { backgroundColor: product.color || "#EAF4E5" }]}>
                    {getProductImageSource(product) ? (
                      <Image
                        source={getProductImageSource(product)!}
                        style={{ width: "85%", height: "85%" }}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.productEmoji}>{product.emoji || "📦"}</Text>
                    )}
                  </View>

                  <Text style={styles.productName} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={styles.productUnit} numberOfLines={1}>
                    {product.unit} · {product.shopName}
                  </Text>

                  <View style={styles.productBottom}>
                    <Text style={styles.productPrice}>₹{product.price}</Text>

                    {!product.inStock || !product.shop?.canOrder ? (
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#B45309" }}>
                        {!product.inStock
                          ? "Out of stock"
                          : !product.shop?.isOpen
                          ? "Closed"
                          : "Paused"}
                      </Text>
                    ) : currentQty > 0 ? (
                      <View style={styles.quantityControl}>
                        <Pressable
                          onPress={() => handleRemoveFromCart(product.id)}
                          style={styles.quantityButton}
                        >
                          <Text style={styles.quantityButtonText}>−</Text>
                        </Pressable>
                        <Text style={styles.quantityText}>{currentQty}</Text>
                        <Pressable
                          onPress={() => handleAddToCart(product)}
                          style={styles.quantityButton}
                        >
                          <Text style={styles.quantityButtonText}>+</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.addButton}
                        onPress={() => handleAddToCart(product)}
                      >
                        <Text style={styles.addButtonText}>+ Add</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {filteredProducts.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 28 }}>🔎</Text>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptyDescription}>
                Try searching for something else.
              </Text>
            </View>
          )}

          {/* Recently Ordered (Rendered ONLY when logged-in customer has order history) */}
          {recentOrders.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Recently ordered</Text>
                  <Text style={styles.sectionSubtitle}>Reorder from your recent purchases</Text>
                </View>
                <Pressable onPress={() => router.push("/orders" as never)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={styles.seeAll}>View all</Text>
                    <ArrowRight size={13} color="#22A06B" />
                  </View>
                </Pressable>
              </View>

              {recentOrders.map((order) => (
                <Pressable
                  key={order.id}
                  style={styles.recentOrderCard}
                  onPress={() => router.push("/orders" as never)}
                >
                  <View style={styles.orderIconBox}>
                    <Clock size={18} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderTitle}>
                      {order.shop_name || "Local Shop Order"}
                    </Text>
                    <Text style={styles.orderSubtext}>
                      {new Date(order.created_at).toLocaleDateString()} · ₹{order.total}
                    </Text>
                  </View>
                  <Text style={styles.reorderBtn}>Reorder</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Support Local Banner */}
          <View style={styles.localBanner}>
            <Text style={styles.localEmoji}>🏪</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.localTitle}>Support your local shops</Text>
              <Text style={styles.localText}>
                Find the essentials you need in your neighborhood.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Persistent Live Order Status Bottom Card */}
        {activeOrder && (
          <Pressable
            style={[
              styles.activeOrderCard,
              cartCount > 0 && { bottom: 70 },
            ]}
            onPress={() => router.push(`/order/${activeOrder.id}` as never)}
          >
            <View style={styles.activeOrderRow}>
              <View
                style={[
                  styles.activeOrderIconBox,
                  { backgroundColor: getActiveOrderCardStyle(activeOrder.status).bg },
                ]}
              >
                {getActiveOrderCardStyle(activeOrder.status).icon}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.activeOrderTitle} numberOfLines={1}>
                  {getActiveOrderCardStyle(activeOrder.status).title}
                </Text>
                <Text style={styles.activeOrderSubtext} numberOfLines={1}>
                  {activeOrder.eta
                    ? `Arriving in ${activeOrder.eta}`
                    : getActiveOrderCardStyle(activeOrder.status).subtext}
                </Text>

                {/* Status Progress Track */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${getActiveOrderCardStyle(activeOrder.status).progress}%` },
                    ]}
                  />
                </View>
              </View>

              <ChevronRight size={20} color={DARK} style={{ marginLeft: 8 }} />
            </View>
          </Pressable>
        )}

        {/* Floating Cart Access Bar */}
        {cartCount > 0 && (
          <Pressable
            style={styles.cartBar}
            onPress={() => router.push("/cart" as never)}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{cartCount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartBarTitle}>View your cart</Text>
              <Text style={styles.cartBarSubtitle}>
                {cartCount} item{cartCount > 1 ? "s" : ""}
              </Text>
            </View>
            <Text style={styles.cartTotal}>₹{cartTotal}  →</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function getActiveOrderCardStyle(status: string) {
  switch (status) {
    case "ACCEPTED":
      return {
        title: "Shop accepted your order",
        subtext: "Preparing your items",
        icon: <Store size={20} color="#D97706" />,
        bg: "#FEF3C7",
        progress: 40,
      };
    case "PREPARING":
      return {
        title: "Your order is being prepared",
        subtext: "Fresh items are being packed",
        icon: <Package size={20} color="#D97706" />,
        bg: "#FEF3C7",
        progress: 60,
      };
    case "READY_FOR_PICKUP":
      return {
        title: "Your order is ready",
        subtext: "Waiting for delivery pickup",
        icon: <PackageCheck size={20} color={GREEN} />,
        bg: LIGHT_GREEN,
        progress: 75,
      };
    case "OUT_FOR_DELIVERY":
      return {
        title: "Your order is on the way",
        subtext: "Rider is on the way to you",
        icon: <Bike size={20} color={GREEN} />,
        bg: LIGHT_GREEN,
        progress: 90,
      };
    case "PLACED":
    default:
      return {
        title: "Order Placed",
        subtext: "Waiting for shop confirmation",
        icon: <ShoppingBag size={20} color={GREEN} />,
        bg: LIGHT_GREEN,
        progress: 20,
      };
  }
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    height: 36,
    width: 120,
  },
  notification: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8EEE8",
  },
  notificationDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#22A06B",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  locationPinBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  locationLabel: {
    color: MUTED,
    fontSize: 10.5,
  },
  locationName: {
    color: DARK,
    fontSize: 13,
    fontWeight: "700",
  },
  locationChange: {
    color: GREEN,
    fontSize: 11.5,
    fontWeight: "700",
  },
  searchBox: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8E2",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    outlineStyle: "none",
  } as any,
  searchInput: {
    flex: 1,
    height: "100%",
    color: DARK,
    fontSize: 14,
    fontWeight: "500",
    outlineStyle: "none",
  } as any,
  hero: {
    height: 148,
    backgroundColor: LIGHT_GREEN,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    position: "relative",
  },
  heroContent: {
    flex: 1.15,
    zIndex: 2,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#D6EBC9",
    borderRadius: 14,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  heroBadgeText: {
    color: GREEN,
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: DARK,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 6,
  },
  heroHighlight: {
    color: "#22A06B",
  },
  heroDescription: {
    color: "#50675A",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  heroButton: {
    alignSelf: "flex-start",
    backgroundColor: GREEN,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 8,
  },
  heroButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 10.5,
  },
  heroArt: {
    flex: 0.95,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  heroImage: {
    width: "100%",
    height: 130,
  },
  heroCircle: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#D6EBC9",
    right: -25,
    top: -30,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    color: DARK,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 10.5,
    marginTop: 1,
  },
  seeAll: {
    color: "#22A06B",
    fontSize: 11.5,
    fontWeight: "700",
  },
  categoryList: {
    gap: 14,
    paddingBottom: 14,
  },
  categoryItem: {
    alignItems: "center",
    width: 62,
  },
  categoryIcon: {
    height: 56,
    width: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAF0EA",
    overflow: "hidden",
  },
  categorySelected: {
    borderColor: GREEN,
    borderWidth: 2,
    backgroundColor: LIGHT_GREEN,
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 10.5,
    color: DARK,
    fontWeight: "600",
    marginTop: 5,
    textAlign: "center",
  },
  categoryNameSelected: {
    color: GREEN,
    fontWeight: "800",
  },
  shopList: {
    gap: 12,
    paddingBottom: 16,
  },
  shopCard: {
    width: 170,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  shopImage: {
    height: 95,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 8,
    position: "relative",
  },
  shopCardImage: {
    width: "100%",
    height: "100%",
  },
  shopEmoji: {
    fontSize: 32,
  },
  openBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#22A06B",
  },
  closedDot: {
    backgroundColor: "#DC2626",
  },
  deliveryPausedBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(254, 243, 199, 0.95)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deliveryPausedText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#92400E",
  },
  shopDeliveryMeta: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F5D3A",
    marginTop: 4,
  },
  shopDeliveryMetaPaused: {
    color: "#B45309",
  },
  openText: {
    fontSize: 9,
    fontWeight: "800",
    color: DARK,
  },
  shopName: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  shopType: {
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
  },
  shopMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  rating: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E67E22",
  },
  distance: {
    fontSize: 11,
    color: MUTED,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginBottom: 16,
  },
  productCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  productImage: {
    height: 90,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  productEmoji: {
    fontSize: 32,
  },
  productName: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  productUnit: {
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
  },
  productBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
  },
  addButton: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBE4BD",
  },
  addButtonText: {
    color: GREEN,
    fontWeight: "800",
    fontSize: 11,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 6,
  },
  quantityButton: {
    paddingHorizontal: 4,
  },
  quantityButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },
  quantityText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11.5,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK,
    marginTop: 6,
  },
  emptyDescription: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  recentOrderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 10,
  },
  orderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  orderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  orderSubtext: {
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
  },
  reorderBtn: {
    color: GREEN,
    fontSize: 11.5,
    fontWeight: "800",
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  localBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 12,
  },
  localEmoji: {
    fontSize: 28,
  },
  localTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  localText: {
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
  },
  cartBar: {
    position: "absolute",
    bottom: 74,
    left: 16,
    right: 16,
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    elevation: 8,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  cartCount: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cartCountText: {
    color: GREEN,
    fontWeight: "900",
    fontSize: 12,
  },
  cartBarTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12.5,
  },
  cartBarSubtitle: {
    color: "#C5E6D5",
    fontSize: 10,
  },
  cartTotal: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },
  activeOrderCard: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: LIGHT_GREEN,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  activeOrderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeOrderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activeOrderTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: DARK,
  },
  activeOrderSubtext: {
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
    marginBottom: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: GREEN,
    borderRadius: 2,
  },
});