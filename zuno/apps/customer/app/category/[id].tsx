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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Search,
  ShoppingCart,
  Heart,
  ChevronDown,
  X,
  SlidersHorizontal,
  Check,
} from "lucide-react-native";
import { posthog } from "@/lib/posthog";
import { analytics } from "@/lib/analytics";
import { useCartStore } from "@/store/cartStore";
import { getCategoryByIdOrSlug, CategoryItem, SubcategoryItem } from "@/features/categories/api";
import {
  fetchProductsByCategory,
  CategoryProduct,
} from "@/features/products/api";
import { getProductImageSource } from "@/assets/productImages";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

type SortOption = "popularity" | "low_high" | "high_low" | "name_az";

export default function CategoryListingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryIdOrSlug = params.id || "vegetables";

  const [category, setCategory] = useState<CategoryItem | null>(null);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("popularity");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  // Modals
  const [showSortModal, setShowSortModal] = useState(false);

  // Cart Store
  const cartItems = useCartStore((state) => state.items);
  const addToCartStore = useCartStore((state) => state.addToCart);
  const removeFromCartStore = useCartStore((state) => state.removeFromCart);
  const cartCount = useCartStore((state) => state.getCartCount());
  const cartTotal = useCartStore((state) => state.getCartTotal());

  useEffect(() => {
    async function loadCategoryData() {
      setLoading(true);
      setError(null);
      try {
        const catData = await getCategoryByIdOrSlug(categoryIdOrSlug);
        setCategory(catData);

        if (catData) {
          posthog?.capture("category_viewed", {
            category_id: catData.id,
            category_name: catData.name,
          });
        }

        const prods = await fetchProductsByCategory({
          categorySlugOrId: categoryIdOrSlug,
          subcategoryId: selectedSubcategory,
          searchQuery: search,
          sortBy,
          inStockOnly,
        });

        setProducts(prods);
      } catch (err) {
        setError("Failed to load category products. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    loadCategoryData();
  }, [categoryIdOrSlug, selectedSubcategory, sortBy, inStockOnly]);

  // Handle live search filter locally as user types
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase().trim();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const handleSubcategorySelect = (subId: string) => {
    setSelectedSubcategory(subId);
    posthog?.capture("subcategory_selected", {
      category: category?.name || "General",
      subcategory_id: subId,
    });
  };

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const handleAddToCart = (product: CategoryProduct) => {
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

    posthog?.capture("add_to_cart", {
      product_id: product.id,
      shop_id: product.shopId,
      product_name: product.name,
      price: product.price,
      category: category?.name || "General",
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    removeFromCartStore(productId);
    posthog?.capture("remove_from_cart", {
      product_id: productId,
    });
  };

  const categoryTitle = category?.name || "Products";
  const subcategoriesList: SubcategoryItem[] = category?.subcategories || [
    { id: "all", name: "All", slug: "all" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.screen}>
        {/* A. Top Navigation Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.headerButton}
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
            {categoryTitle}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              style={styles.headerButton}
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
          {/* B. Category Banner */}
          <View style={[styles.banner, { backgroundColor: category?.accent_color ? `${category.accent_color}18` : LIGHT_GREEN }]}>
            <View style={styles.bannerTextContainer}>
              <View style={styles.bannerBadge}>
                <Text style={styles.bannerBadgeText}>ZUNO HYPERLOCAL</Text>
              </View>
              <Text style={styles.bannerTitle}>Fresh {categoryTitle}</Text>
              <Text style={styles.bannerSubtitle}>
                {category?.description || "Local farms, fresh daily."}
              </Text>
            </View>

            <View style={styles.bannerArt}>
              {category?.image ? (
                <Image
                  source={category.image}
                  style={styles.bannerImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ fontSize: 48 }}>🥦</Text>
              )}
            </View>
          </View>

          {/* C. Subcategory Horizontal Chips */}
          {subcategoriesList.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {subcategoriesList.map((sub) => {
                const isSelected = selectedSubcategory === sub.id;
                return (
                  <Pressable
                    key={sub.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => handleSubcategorySelect(sub.id)}
                  >
                    <Text
                      style={[styles.chipText, isSelected && styles.chipTextSelected]}
                    >
                      {sub.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* D. Search Bar */}
          <View style={styles.searchBox}>
            <Search size={18} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${categoryTitle.toLowerCase()}...`}
              placeholderTextColor="#89948D"
              style={[styles.searchInput, { outlineStyle: "none" } as any]}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <X size={16} color={MUTED} style={{ paddingHorizontal: 4 }} />
              </Pressable>
            )}
          </View>

          {/* E. Sort and Filter Controls */}
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.filterPill, sortBy !== "popularity" && styles.filterPillActive]}
              onPress={() => setShowSortModal(true)}
            >
              <SlidersHorizontal size={13} color={sortBy !== "popularity" ? GREEN : DARK} />
              <Text style={[styles.filterPillText, sortBy !== "popularity" && styles.filterPillTextActive]}>
                Sort {sortBy === "low_high" ? ": Low-High" : sortBy === "high_low" ? ": High-Low" : ""}
              </Text>
              <ChevronDown size={13} color={MUTED} />
            </Pressable>

            <Pressable
              style={[styles.filterPill, inStockOnly && styles.filterPillActive]}
              onPress={() => setInStockOnly(!inStockOnly)}
            >
              <Text style={[styles.filterPillText, inStockOnly && styles.filterPillTextActive]}>
                In Stock Only
              </Text>
            </Pressable>
          </View>

          {/* F. Loading, Error, Empty & Product Grid */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>Loading {categoryTitle}...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Oops! Something went wrong</Text>
              <Text style={styles.errorSub}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={() => setSelectedSubcategory("all")}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 36 }}>🔎</Text>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySub}>
                Try adjusting your search query or filters.
              </Text>
              <Pressable
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearch("");
                  setSelectedSubcategory("all");
                  setInStockOnly(false);
                }}
              >
                <Text style={styles.clearFilterText}>Clear Filters</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {filteredProducts.map((product) => {
                const currentQty = cartItems[product.id]?.quantity || 0;
                const isWishlisted = !!wishlist[product.id];

                return (
                  <Pressable
                    key={product.id}
                    style={styles.productCard}
                    onPress={() => router.push(`/product/${product.id}` as never)}
                  >
                    {/* Top Row: Offer Badge & Wishlist */}
                    <View style={styles.cardTopRow}>
                      {product.offerBadge ? (
                        <View style={styles.offerBadge}>
                          <Text style={styles.offerBadgeText}>{product.offerBadge}</Text>
                        </View>
                      ) : (
                        <View />
                      )}

                      <Pressable
                        style={styles.wishlistBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                        }}
                      >
                        <Heart
                          size={16}
                          color={isWishlisted ? "#E53935" : MUTED}
                          fill={isWishlisted ? "#E53935" : "none"}
                        />
                      </Pressable>
                    </View>

                    {/* Product Image */}
                    <View style={[styles.productImageContainer, { backgroundColor: product.color || "#EAF4E5" }]}>
                      {getProductImageSource(product) ? (
                        <Image
                          source={getProductImageSource(product)!}
                          style={styles.productImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={styles.productEmoji}>{product.emoji || "📦"}</Text>
                      )}
                    </View>

                    {/* Product Details */}
                    <Text style={styles.productName} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.productUnit}>{product.unit}</Text>

                    {/* Price Row & Add / Stepper Controls */}
                    <View style={styles.productBottomRow}>
                      <View>
                        <Text style={styles.sellingPrice}>₹{product.price}</Text>
                        {product.mrp && product.mrp > product.price && (
                          <Text style={styles.mrpPrice}>₹{product.mrp}</Text>
                        )}
                      </View>

                      {currentQty > 0 ? (
                        <View
                          style={styles.stepperContainer}
                          onStartShouldSetResponder={() => true}
                        >
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleRemoveFromCart(product.id);
                            }}
                            style={styles.stepperBtn}
                          >
                            <Text style={styles.stepperText}>−</Text>
                          </Pressable>
                          <Text style={styles.stepperQty}>{currentQty}</Text>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleAddToCart(product);
                            }}
                            style={styles.stepperBtn}
                          >
                            <Text style={styles.stepperText}>+</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.addBtn, !product.inStock && styles.addBtnDisabled]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product);
                          }}
                          disabled={!product.inStock}
                        >
                          <Text style={styles.addBtnText}>
                            {product.inStock ? "Add" : "Out of Stock"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Floating Cart Access Bar */}
        {cartCount > 0 && (
          <Pressable
            style={styles.cartBar}
            onPress={() => router.push("/cart" as never)}
          >
            <View style={styles.cartCountCircle}>
              <Text style={styles.cartCountCircleText}>{cartCount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartBarTitle}>View your cart</Text>
              <Text style={styles.cartBarSubtitle}>
                {cartCount} item{cartCount > 1 ? "s" : ""}
              </Text>
            </View>
            <Text style={styles.cartBarTotal}>₹{cartTotal}  →</Text>
          </Pressable>
        )}

        {/* Sort Options Modal Sheet */}
        <Modal
          visible={showSortModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSortModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowSortModal(false)}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Sort Products</Text>
                <Pressable onPress={() => setShowSortModal(false)}>
                  <X size={18} color={MUTED} />
                </Pressable>
              </View>

              {[
                { id: "popularity", label: "Popularity" },
                { id: "low_high", label: "Price: Low to High" },
                { id: "high_low", label: "Price: High to Low" },
                { id: "name_az", label: "Name: A to Z" },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  style={styles.sortOptionRow}
                  onPress={() => {
                    setSortBy(opt.id as SortOption);
                    setShowSortModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      sortBy === opt.id && styles.sortOptionTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {sortBy === opt.id && <Check size={18} color={GREEN} />}
                </Pressable>
              ))}
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
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
  headerButton: {
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
    fontSize: 17,
    fontWeight: "800",
    color: DARK,
    textAlign: "center",
    flex: 1,
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
  banner: {
    height: 136,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 14,
    position: "relative",
    overflow: "hidden",
  },
  bannerTextContainer: {
    flex: 1.2,
    zIndex: 2,
  },
  bannerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15, 93, 58, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 4,
  },
  bannerBadgeText: {
    color: GREEN,
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  bannerTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: DARK,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: "#40564A",
    marginTop: 3,
  },
  bannerArt: {
    flex: 0.8,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  bannerImage: {
    width: "100%",
    height: 110,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  chipSelected: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: DARK,
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  searchBox: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8E2",
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    color: DARK,
    fontSize: 13.5,
    fontWeight: "500",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  filterPillActive: {
    borderColor: GREEN,
    backgroundColor: LIGHT_GREEN,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: DARK,
  },
  filterPillTextActive: {
    color: GREEN,
    fontWeight: "800",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    color: MUTED,
    fontSize: 12,
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK,
  },
  errorSub: {
    fontSize: 11.5,
    color: MUTED,
    marginTop: 4,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 11.5,
    color: MUTED,
    marginTop: 4,
  },
  clearFilterBtn: {
    marginTop: 14,
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  clearFilterText: {
    color: GREEN,
    fontWeight: "800",
    fontSize: 11.5,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  productCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  offerBadge: {
    backgroundColor: "#0F5D3A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offerBadgeText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "900",
  },
  wishlistBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F8FAF6",
    alignItems: "center",
    justifyContent: "center",
  },
  productImageContainer: {
    height: 95,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  productImage: {
    width: "85%",
    height: "85%",
  },
  productEmoji: {
    fontSize: 34,
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
  productBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sellingPrice: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
  },
  mrpPrice: {
    fontSize: 10,
    color: MUTED,
    textDecorationLine: "line-through",
    marginTop: 1,
  },
  addBtn: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBE4BD",
  },
  addBtnDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  addBtnText: {
    color: GREEN,
    fontWeight: "800",
    fontSize: 11,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 6,
  },
  stepperBtn: {
    paddingHorizontal: 5,
  },
  stepperText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },
  stepperQty: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11.5,
  },
  cartBar: {
    position: "absolute",
    bottom: 16,
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
  cartCountCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cartCountCircleText: {
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
  cartBarTotal: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEFEA",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK,
  },
  sortOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: DARK,
  },
  sortOptionTextSelected: {
    color: GREEN,
    fontWeight: "800",
  },
});
