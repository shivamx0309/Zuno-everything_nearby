import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StatusBar,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ShoppingCart,
  Heart,
  ChevronRight,
  CheckCircle2,
  X,
  Leaf,
  ShieldCheck,
  Check,
  Store,
} from "lucide-react-native";
import { posthog } from "@/lib/posthog";
import { analytics } from "@/lib/analytics";
import { useCartStore } from "@/store/cartStore";
import {
  getProductDetails,
  getSimilarProducts,
  CategoryProduct,
  ProductVariant,
} from "@/features/products/api";
import { getProductImageSource } from "@/assets/productImages";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

export default function ProductDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = params.id || "veg-1";

  const [product, setProduct] = useState<CategoryProduct | null>(null);
  const [similarProducts, setSimilarProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Variant & Quantity
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Cart Store
  const cartItems = useCartStore((state) => state.items);
  const addToCartStore = useCartStore((state) => state.addToCart);
  const cartCount = useCartStore((state) => state.getCartCount());

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const prod = await getProductDetails(productId);
        setProduct(prod);

        if (prod) {
          if (prod.variants && prod.variants.length > 0) {
            setSelectedVariant(prod.variants[0]);
          }

          analytics.trackProductViewed?.({
            productId: prod.id,
            productName: prod.name,
            price: prod.price,
          });

          posthog?.capture("product_details_viewed", {
            product_id: prod.id,
            product_name: prod.name,
            price: prod.price,
            category: prod.categorySlug,
          });

          const similars = await getSimilarProducts(prod.id, prod.categorySlug);
          setSimilarProducts(similars);
        }
      } catch (err) {
        setError("Failed to load product details.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [productId]);

  const activePrice = selectedVariant ? selectedVariant.price : product?.price || 0;
  const activeMrp = selectedVariant ? selectedVariant.mrp : product?.mrp;
  const activeUnit = selectedVariant ? selectedVariant.label : product?.unit || "1 kg";

  const handleAddToCart = () => {
    if (!product || !product.inStock || !product.shop?.canOrder) return;

    for (let i = 0; i < quantity; i++) {
      addToCartStore({
        id: product.id,
        shopProductId: product.shopProductId || product.id,
        productId: product.productId,
        name: product.name,
        price: activePrice,
        unit: activeUnit,
        shopId: product.shopId,
        shopName: product.shopName,
        shopDistance: product.shop?.distance,
        stock: product.stock,
        image_url: product.image_url,
        emoji: product.emoji,
        color: product.color,
      });
    }

    analytics.trackAddToCart({
      productId: product.id,
      productName: product.name,
      price: activePrice,
      quantity,
    });

    posthog?.capture("add_to_cart_succeeded", {
      product_id: product.id,
      shop_id: product.shopId,
      product_name: product.name,
      price: activePrice,
      quantity,
    });

    setShowSuccessModal(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Loading product details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Product Not Found</Text>
          <Text style={styles.errorSub}>{error || "The requested item is unavailable."}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.screen}>
        {/* A. Top Navigation Header */}
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
            {product.name}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setIsWishlisted(!isWishlisted)}
            >
              <Heart
                size={20}
                color={isWishlisted ? "#E53935" : DARK}
                fill={isWishlisted ? "#E53935" : "none"}
              />
            </Pressable>

            <Pressable
              style={styles.iconBtn}
              onPress={() => router.push("/cart" as never)}
            >
              <ShoppingCart size={20} color={GREEN} />
              {cartCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* B. Product Image Gallery */}
          <View style={[styles.imageCard, { backgroundColor: product.color || LIGHT_GREEN }]}>
            {product.offerBadge && (
              <View style={styles.offerBadge}>
                <Text style={styles.offerBadgeText}>{product.offerBadge}</Text>
              </View>
            )}

            {getProductImageSource(product) ? (
              <Image
                source={getProductImageSource(product)!}
                style={styles.productImage}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ fontSize: 90 }}>{product.emoji || "🍅"}</Text>
            )}
          </View>

          {/* C. Product Information */}
          <View style={styles.infoSection}>
            <Text style={styles.productTitle}>{product.name}</Text>
            <Text style={styles.productSubtext}>
              {product.description || "Fresh, quality sourced item from nearby local shops."}
            </Text>

            {/* Price & Discount Row */}
            <View style={styles.priceRow}>
              <Text style={styles.mainPrice}>₹{activePrice}</Text>
              {activeMrp && activeMrp > activePrice && (
                <Text style={styles.mrpPrice}>₹{activeMrp}</Text>
              )}
              {product.discountPercentage && (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>{product.discountPercentage}% OFF</Text>
                </View>
              )}
            </View>

            {/* Package Variant Chips */}
            {product.variants && product.variants.length > 0 && (
              <View style={styles.variantSection}>
                {product.variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      style={[styles.variantChip, isSelected && styles.variantChipSelected]}
                      onPress={() => setSelectedVariant(v)}
                    >
                      <Text style={[styles.variantText, isSelected && styles.variantTextSelected]}>
                        {v.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Product Highlights */}
            {product.highlights && product.highlights.length > 0 && (
              <View style={styles.highlightsBox}>
                {product.highlights.map((h, i) => (
                  <View key={i} style={styles.highlightRow}>
                    <Leaf size={15} color={GREEN} />
                    <Text style={styles.highlightText}>{h}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Shop Information Card */}
            {product.shop && (
              <Pressable
                style={styles.shopCard}
                onPress={() => router.push(`/shop/${product.shop.id}` as never)}
              >
                <View style={styles.shopIconBox}>
                  <Store size={20} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shopLabel}>Sold by Shop</Text>
                  <Text style={styles.shopTitle}>{product.shop.name}</Text>
                  <View style={styles.shopMetaRow}>
                    <View
                      style={[
                        styles.greenDot,
                        !product.shop.isOpen && { backgroundColor: "#DC2626" },
                      ]}
                    />
                    <Text style={styles.shopStatusText}>
                      {product.shop.isOpen ? "Open" : "Closed"} ·{" "}
                      {product.shop.deliveryStatusLabel} · {product.shop.distance}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={MUTED} />
              </Pressable>
            )}

            {/* Product Details Specs Table */}
            <View style={styles.specsBox}>
              <Text style={styles.sectionHeading}>Product details</Text>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Category</Text>
                <Text style={styles.specValue}>{product.categorySlug} &gt; Fresh</Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Origin</Text>
                <Text style={styles.specValue}>{product.origin || "Local farms"}</Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Storage</Text>
                <Text style={styles.specValue}>{product.storage || "Keep in a cool, dry place"}</Text>
              </View>
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Best before</Text>
                <Text style={styles.specValue}>{product.bestBefore || "5–7 days"}</Text>
              </View>
            </View>

            {/* Nutritional Info Section */}
            {product.nutrition && product.nutrition.length > 0 && (
              <View style={styles.specsBox}>
                <Text style={styles.sectionHeading}>Nutritional Information (Per 100 g)</Text>
                {product.nutrition.map((n, i) => (
                  <View key={i} style={styles.specRow}>
                    <Text style={styles.specLabel}>{n.label}</Text>
                    <Text style={styles.specValue}>{n.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Health Benefits Section */}
            {product.healthBenefits && product.healthBenefits.length > 0 && (
              <View style={styles.specsBox}>
                <Text style={styles.sectionHeading}>Health Benefits</Text>
                {product.healthBenefits.map((b, i) => (
                  <View key={i} style={styles.benefitRow}>
                    <CheckCircle2 size={16} color="#22A06B" />
                    <Text style={styles.benefitText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Similar Products Carousel */}
            {similarProducts.length > 0 && (
              <View style={styles.similarSection}>
                <Text style={styles.similarTitle}>Similar Products</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.similarRow}
                >
                  {similarProducts.map((sp) => (
                    <Pressable
                      key={sp.id}
                      style={styles.similarCard}
                      onPress={() => router.push(`/product/${sp.id}` as never)}
                    >
                      <View style={[styles.similarImageContainer, { backgroundColor: sp.color || LIGHT_GREEN }]}>
                        <Text style={{ fontSize: 32 }}>{sp.emoji || "📦"}</Text>
                      </View>
                      <Text style={styles.similarName} numberOfLines={1}>
                        {sp.name}
                      </Text>
                      <Text style={styles.similarUnit}>{sp.unit}</Text>
                      <View style={styles.similarBottom}>
                        <Text style={styles.similarPrice}>₹{sp.price}</Text>
                        <View style={styles.similarAddBtn}>
                          <Text style={styles.similarAddText}>Add</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>

        {/* J. Sticky Bottom Purchase Bar */}
        <View style={styles.bottomBar}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={styles.bottomPrice}>₹{activePrice * quantity}</Text>
              {activeMrp && (
                <Text style={styles.bottomMrp}>₹{activeMrp * quantity}</Text>
              )}
            </View>
            <Text style={styles.bottomUnit}>{activeUnit}</Text>
          </View>

          {/* Stepper + Add To Cart Button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.stepperContainer}>
              <Pressable
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                style={styles.stepperBtn}
              >
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <Text style={styles.stepperQty}>{quantity}</Text>
              <Pressable
                onPress={() => setQuantity((q) => q + 1)}
                style={styles.stepperBtn}
              >
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.addToCartBtn,
                (!product.inStock || !product.shop.canOrder) && styles.btnDisabled,
              ]}
              onPress={handleAddToCart}
              disabled={!product.inStock || !product.shop.canOrder}
            >
              <Text style={styles.addToCartText}>
                {!product.inStock
                  ? "Out of Stock"
                  : !product.shop.isOpen
                  ? "Shop Closed"
                  : !product.shop.isDeliveryAvailable
                  ? "Delivery Paused"
                  : "Add to Cart"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Added to Cart Feedback Modal Sheet (Matching Screen 6) */}
        <Modal
          visible={showSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowSuccessModal(false)}>
            <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
              <Pressable style={styles.closeBtn} onPress={() => setShowSuccessModal(false)}>
                <X size={18} color={MUTED} />
              </Pressable>

              <View style={styles.successIconCircle}>
                <Check size={28} color="#FFFFFF" strokeWidth={3} />
              </View>

              <Text style={styles.successModalTitle}>Added to Cart</Text>
              <Text style={styles.successModalSub}>
                {product.name} ({activeUnit}) has been added to your cart.
              </Text>

              <Pressable
                style={styles.viewCartBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push("/cart" as never);
                }}
              >
                <Text style={styles.viewCartText}>View Cart</Text>
              </Pressable>

              <Pressable
                style={styles.continueBtn}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={styles.continueText}>Continue Shopping</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
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
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: MUTED,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: DARK,
  },
  errorSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    textAlign: "center",
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
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
    position: "relative",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  scrollContent: {
    paddingBottom: 100,
  },
  imageCard: {
    height: 250,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  offerBadge: {
    position: "absolute",
    top: 14,
    left: 16,
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  offerBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  productImage: {
    width: "80%",
    height: "80%",
  },
  infoSection: {
    padding: 16,
  },
  productTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: DARK,
  },
  productSubtext: {
    fontSize: 12.5,
    color: MUTED,
    marginTop: 4,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 12,
  },
  mainPrice: {
    fontSize: 24,
    fontWeight: "900",
    color: DARK,
  },
  mrpPrice: {
    fontSize: 14,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  discountBadge: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountText: {
    color: GREEN,
    fontWeight: "800",
    fontSize: 11,
  },
  variantSection: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  variantChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  variantChipSelected: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  variantText: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
  },
  variantTextSelected: {
    color: "#FFFFFF",
  },
  highlightsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 10,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  highlightText: {
    fontSize: 12,
    color: DARK,
    fontWeight: "600",
  },
  shopCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 12,
  },
  shopIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  shopLabel: {
    fontSize: 10,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shopTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
    marginTop: 1,
  },
  shopMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22A06B",
  },
  shopStatusText: {
    fontSize: 11,
    color: MUTED,
  },
  specsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
    marginBottom: 10,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F6F4",
  },
  specLabel: {
    fontSize: 12,
    color: MUTED,
  },
  specValue: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  benefitText: {
    fontSize: 12,
    fontWeight: "600",
    color: DARK,
  },
  similarSection: {
    marginTop: 20,
  },
  similarTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK,
    marginBottom: 12,
  },
  similarRow: {
    gap: 12,
  },
  similarCard: {
    width: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  similarImageContainer: {
    height: 80,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  similarName: {
    fontSize: 12,
    fontWeight: "800",
    color: DARK,
  },
  similarUnit: {
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
  },
  similarBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  similarPrice: {
    fontSize: 12.5,
    fontWeight: "900",
    color: DARK,
  },
  similarAddBtn: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  similarAddText: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
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
  bottomPrice: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
  },
  bottomMrp: {
    fontSize: 12,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  bottomUnit: {
    fontSize: 11,
    color: MUTED,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT_GREEN,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 8,
  },
  stepperBtn: {
    paddingHorizontal: 6,
  },
  stepperText: {
    fontSize: 14,
    fontWeight: "900",
    color: GREEN,
  },
  stepperQty: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  addToCartBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  addToCartText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: "center",
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#22A06B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successModalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: DARK,
  },
  successModalSub: {
    fontSize: 12.5,
    color: MUTED,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  viewCartBtn: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  viewCartText: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "800",
  },
  continueBtn: {
    width: "100%",
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  continueText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
