import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Clock, MapPin, ShoppingCart, Store, Truck } from "lucide-react-native";
import { getPublicStorefrontById, ShopData } from "@/features/shops/api";
import { getProductsByShop, type CategoryProduct } from "@/features/products/api";
import { useCartStore } from "@/store/cartStore";
import {
  SHOP_WEEKDAYS,
  WEEKDAY_LABELS,
  formatOpeningHoursDaySummary,
} from "@zuno/utils";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const cartItems = useCartStore((state) => state.items);
  const addToCartStore = useCartStore((state) => state.addToCart);
  const removeFromCartStore = useCartStore((state) => state.removeFromCart);
  const cartCount = useCartStore((state) => state.getCartCount());

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const shopId = id ? String(id) : "";
        const [res, shopProds] = shopId
          ? await Promise.all([
              getPublicStorefrontById(shopId),
              getProductsByShop(shopId),
            ])
          : [null, []];
        if (mounted) {
          setShop(res);
          setProducts(shopProds);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {shop?.name || "Storefront Details"}
        </Text>
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push("/cart" as never)}
        >
          <ShoppingCart size={18} color={GREEN} />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cartCount > 99 ? "99+" : cartCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.mutedText}>Loading shop availability...</Text>
        </View>
      ) : !shop ? (
        <View style={styles.centerBox}>
          <Store size={36} color={MUTED} />
          <Text style={styles.unavailableTitle}>Storefront Currently Unavailable</Text>
          <Text style={styles.mutedText}>
            This shop may be offline right now. Check back later or browse other nearby stores.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/" as never)}
          >
            <Text style={styles.primaryBtnText}>Back to Nearby Shops</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Store size={26} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopTitle}>{shop.name}</Text>
              <Text style={styles.shopSub}>{shop.type}</Text>
              <View style={styles.metaRow}>
                <MapPin size={13} color={MUTED} />
                <Text style={styles.metaText}>
                  {shop.locality || "Renukoot"}
                  {shop.pincode ? ` - ${shop.pincode}` : ""}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.pill,
                  shop.isOpenNow === false ? styles.pillClosed : styles.pillOpen,
                ]}
              >
                <Clock
                  size={13}
                  color={shop.isOpenNow === false ? "#B91C1C" : GREEN}
                />
                <Text
                  style={[
                    styles.pillText,
                    shop.isOpenNow === false
                      ? styles.pillTextClosed
                      : styles.pillTextOpen,
                  ]}
                >
                  {shop.availability?.openStatusLabel ||
                    (shop.isOpenNow === false ? "Closed" : "Open")}
                </Text>
              </View>

              <View
                style={[
                  styles.pill,
                  shop.isDeliveryAvailable === false
                    ? styles.pillPaused
                    : styles.pillOpen,
                ]}
              >
                <Truck
                  size={13}
                  color={
                    shop.isDeliveryAvailable === false ? "#92400E" : GREEN
                  }
                />
                <Text
                  style={[
                    styles.pillText,
                    shop.isDeliveryAvailable === false
                      ? styles.pillTextPaused
                      : styles.pillTextOpen,
                  ]}
                >
                  {shop.isDeliveryAvailable === false
                    ? "Delivery Temporarily Unavailable"
                    : "Delivery Available"}
                </Text>
              </View>
            </View>

            <Text style={styles.todayText}>
              Today&apos;s Hours (IST):{" "}
              <Text style={{ fontWeight: "800", color: DARK }}>
                {shop.todayHoursText || "Hours not set"}
              </Text>
            </Text>

            {shop.isDeliveryAvailable === false && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>
                  Delivery is temporarily paused by this shop. You can browse catalog items and check back once delivery resumes.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.hoursCard}>
            <Text style={styles.sectionTitle}>Available Products ({products.length})</Text>
            {products.length === 0 ? (
              <Text style={styles.mutedText}>
                No products are currently listed by this storefront.
              </Text>
            ) : (
              products.map((prod) => {
                const qty = cartItems[prod.id]?.quantity || 0;
                const canOrderItem = prod.inStock && prod.shop.canOrder;
                return (
                  <View key={prod.id} style={styles.productRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{prod.name}</Text>
                      <Text style={styles.productMeta}>
                        {prod.unit} · ₹{prod.price} ·{" "}
                        {prod.inStock ? `In stock (${prod.stock})` : "Out of stock"}
                      </Text>
                    </View>
                    {!canOrderItem ? (
                      <Text style={styles.unavailableChip}>
                        {!prod.inStock
                          ? "Out of stock"
                          : !prod.shop.isOpen
                          ? "Closed"
                          : "Paused"}
                      </Text>
                    ) : qty > 0 ? (
                      <View style={styles.qtyRow}>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() => removeFromCartStore(prod.id)}
                        >
                          <Text style={styles.qtyBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyCount}>{qty}</Text>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() =>
                            addToCartStore({
                              id: prod.id,
                              shopProductId: prod.shopProductId,
                              productId: prod.productId,
                              name: prod.name,
                              price: prod.price,
                              unit: prod.unit,
                              shopId: prod.shopId,
                              shopName: prod.shopName,
                              stock: prod.stock,
                            })
                          }
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.addBtn}
                        onPress={() =>
                          addToCartStore({
                            id: prod.id,
                            shopProductId: prod.shopProductId,
                            productId: prod.productId,
                            name: prod.name,
                            price: prod.price,
                            unit: prod.unit,
                            shopId: prod.shopId,
                            shopName: prod.shopName,
                            stock: prod.stock,
                          })
                        }
                      >
                        <Text style={styles.addBtnText}>+ Add</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.hoursCard}>
            <Text style={styles.sectionTitle}>Weekly Opening Hours (IST)</Text>
            {shop.openingHours ? (
              SHOP_WEEKDAYS.map((day) => {
                const slot = shop.openingHours![day];
                return (
                  <View key={day} style={styles.dayRow}>
                    <Text style={styles.dayName}>{WEEKDAY_LABELS[day]}</Text>
                    <Text
                      style={[
                        styles.dayTime,
                        !slot.enabled && styles.dayTimeClosed,
                      ]}
                    >
                      {formatOpeningHoursDaySummary(slot)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.mutedText}>
                Opening schedule has not been configured for this storefront yet.
              </Text>
            )}
          </View>

          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/categories" as never)}
          >
            <Text style={styles.primaryBtnText}>Browse Store Catalog</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
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
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: DARK,
    marginHorizontal: 8,
  },
  centerBox: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  unavailableTitle: { fontSize: 16, fontWeight: "800", color: DARK },
  mutedText: { fontSize: 13, color: MUTED, textAlign: "center" },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  shopTitle: { fontSize: 18, fontWeight: "900", color: DARK },
  shopSub: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  metaText: { fontSize: 12, color: MUTED, fontWeight: "600" },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 10,
  },
  statusBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillOpen: { backgroundColor: LIGHT_GREEN },
  pillClosed: { backgroundColor: "#FEE2E2" },
  pillPaused: { backgroundColor: "#FEF3C7" },
  pillText: { fontSize: 11.5, fontWeight: "800" },
  pillTextOpen: { color: GREEN },
  pillTextClosed: { color: "#B91C1C" },
  pillTextPaused: { color: "#92400E" },
  todayText: { fontSize: 13, color: MUTED },
  noticeBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  noticeText: { fontSize: 12, color: "#92400E", fontWeight: "600" },
  hoursCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: DARK, marginBottom: 4 },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F6F3",
  },
  dayName: { fontSize: 12.5, fontWeight: "700", color: DARK },
  dayTime: { fontSize: 12.5, fontWeight: "700", color: GREEN },
  dayTimeClosed: { color: MUTED },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F6F3",
    gap: 10,
  },
  productName: { fontSize: 13.5, fontWeight: "800", color: DARK },
  productMeta: { fontSize: 11.5, color: MUTED, marginTop: 2 },
  unavailableChip: { fontSize: 11, fontWeight: "700", color: "#B45309" },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: LIGHT_GREEN,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  qtyBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  qtyBtnText: { fontSize: 15, fontWeight: "900", color: GREEN },
  qtyCount: { fontSize: 13, fontWeight: "800", color: DARK },
  addBtn: {
    backgroundColor: LIGHT_GREEN,
    borderColor: "#CBE3C7",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: GREEN, fontSize: 12, fontWeight: "800" },
});
