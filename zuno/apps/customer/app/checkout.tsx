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
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Plus,
  ArrowRight,
  Check,
  ShieldCheck,
  X,
  Edit2,
  Store,
  Tag,
} from "lucide-react-native";
import { posthog } from "@/lib/posthog";
import { analytics } from "@/lib/analytics";
import { useCartStore } from "@/store/cartStore";
import {
  getCustomerAddresses,
  saveCustomerAddress,
} from "@/features/location/api";
import {
  calculateCheckoutQuote,
  placeOrder,
  CheckoutQuoteResult,
} from "@/features/checkout/api";
import type { Address } from "@zuno/types";

const GREEN = "#0F5D3A";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#17231D";
const MUTED = "#718078";

type CheckoutStep = 1 | 2 | 3 | 4;
type PaymentMethod = "COD" | "UPI" | "ONLINE";

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shopId?: string }>();

  // Cart State — strictly one shop per order
  const cartItemsObj = useCartStore((state) => state.items);
  const activeCheckoutShopId = useCartStore(
    (state) => state.activeCheckoutShopId
  );
  const clearShopCart = useCartStore((state) => state.clearShopCart);

  const targetShopId = useMemo(() => {
    const paramShopId = params.shopId ? String(params.shopId) : null;
    if (paramShopId) return paramShopId;
    if (activeCheckoutShopId) return activeCheckoutShopId;
    const first = Object.values(cartItemsObj)[0];
    return first?.shopId || null;
  }, [params.shopId, activeCheckoutShopId, cartItemsObj]);

  const cartItemsList = useMemo(
    () =>
      targetShopId
        ? Object.values(cartItemsObj).filter((item) => item.shopId === targetShopId)
        : [],
    [cartItemsObj, targetShopId]
  );

  // Steps & Selection State
  const [currentStep, setCurrentStep] = useState<CheckoutStep>(1);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");

  // Edit / Add Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState({
    label: "Home",
    line1: "",
    line2: "",
    city: "Renukoot",
    state: "Uttar Pradesh",
    pincode: "231217",
    recipient_name: "Customer",
    phone_number: "+91 98765 43210",
  });

  // Quote & Order Status State
  const [quote, setQuote] = useState<CheckoutQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>("");
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string>("");

  const idempotencyKey = useMemo(() => {
    const itemsSig = cartItemsList
      .map((i) => `${i.shopProductId || i.id}:${i.quantity}`)
      .sort()
      .join("|");
    return `chk-${targetShopId || "none"}-${selectedAddressId || "none"}-${itemsSig}`.slice(
      0,
      120
    );
  }, [targetShopId, selectedAddressId, cartItemsList]);

  useEffect(() => {
    analytics.trackCheckoutStarted?.({
      cartTotal: 0,
      cartCount: cartItemsList.reduce((s, i) => s + i.quantity, 0),
    });
    posthog?.capture("checkout_viewed", {
      shop_id: targetShopId,
      item_count: cartItemsList.length,
    });

    async function initCheckout() {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const authed = Boolean(userData?.user);
        setIsAuthenticated(authed);

        if (authed) {
          const savedAddresses = await getCustomerAddresses();
          if (savedAddresses.length > 0) {
            setAddresses(savedAddresses);
            const defaultAddr =
              savedAddresses.find((a) => a.is_default) || savedAddresses[0];
            setSelectedAddressId(defaultAddr.id);
          } else {
            setAddresses([]);
            setSelectedAddressId("");
          }
        } else {
          setAddresses([]);
          setSelectedAddressId("");
        }
      } catch (err) {
        console.error("Error initializing checkout:", err);
      } finally {
        setLoading(false);
      }
    }

    initCheckout();
  }, [targetShopId]);

  const handleOpenEditAddress = (addr: any) => {
    setEditingAddressId(addr.id);
    setAddressForm({
      label: addr.label || "Home",
      line1: addr.line1 || "",
      line2: addr.line2 || "",
      city: addr.city || "Renukoot",
      state: addr.state || "Uttar Pradesh",
      pincode: addr.pincode || "231217",
      recipient_name: addr.recipient_name || "Customer",
      phone_number: addr.phone_number || "+91 98765 43210",
    });
    setShowAddressModal(true);
  };

  const handleOpenAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm({
      label: "Home",
      line1: "",
      line2: "",
      city: "Renukoot",
      state: "Uttar Pradesh",
      pincode: "231217",
      recipient_name: "Customer",
      phone_number: "+91 98765 43210",
    });
    setShowAddressModal(true);
  };

  const handleSaveAddress = async () => {
    if (!addressForm.line1.trim() || !isAuthenticated) return;

    try {
      const saved = await saveCustomerAddress({
        label: addressForm.label,
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || null,
        city: addressForm.city.trim() || "Renukoot",
        state: addressForm.state.trim() || "Uttar Pradesh",
        pincode: addressForm.pincode.trim() || "231217",
        recipient_name: addressForm.recipient_name.trim() || "Customer",
        phone_number: addressForm.phone_number.trim() || "+919876543210",
        lat: 24.2185,
        lng: 83.0326,
        is_default: addresses.length === 0,
      });

      setAddresses((prev) => {
        const filtered = editingAddressId
          ? prev.filter((a) => a.id !== editingAddressId)
          : prev;
        return [...filtered, saved];
      });
      setSelectedAddressId(saved.id);
      setShowAddressModal(false);
    } catch (err: any) {
      setOrderError(err?.message || "Failed to save delivery address.");
    }
  };

  // Update Quote whenever items, coupon or address changes
  useEffect(() => {
    async function updateQuote() {
      const selectedAddr = addresses.find((a) => a.id === selectedAddressId);
      const res = await calculateCheckoutQuote({
        addressId: selectedAddressId,
        pincode: selectedAddr?.pincode || "231217",
        items: cartItemsList,
        paymentMethod,
        couponCode: appliedCoupon,
        deliveryInstructions,
      });
      setQuote(res);
    }

    if (cartItemsList.length > 0) {
      updateQuote();
    }
  }, [addresses, selectedAddressId, cartItemsList, paymentMethod, appliedCoupon, deliveryInstructions]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) || addresses[0];

  const handleApplyCoupon = () => {
    if (couponCode.trim().toUpperCase() === "ZUNO50") {
      setAppliedCoupon("ZUNO50");
      posthog?.capture("coupon_applied", { coupon: "ZUNO50" });
    }
  };

  const handlePlaceOrder = async () => {
    if (
      !quote ||
      submitting ||
      !isAuthenticated ||
      !selectedAddressId ||
      !quote.isServiceable ||
      quote.shopAvailable === false
    ) {
      return;
    }

    setSubmitting(true);
    setOrderError(null);
    posthog?.capture("checkout_order_submission_started", {
      shop_id: targetShopId,
    });

    try {
      const result = await placeOrder({
        addressId: selectedAddressId,
        pincode: selectedAddress?.pincode || "231217",
        items: cartItemsList,
        paymentMethod,
        couponCode: appliedCoupon,
        deliveryInstructions,
        quote,
        idempotencyKey,
      });

      if (result.success && result.orderId) {
        setPlacedOrderId(result.orderId);
        setPlacedOrderNumber(result.orderNumber || "ZUNO-ORDER");
        if (targetShopId) {
          clearShopCart(targetShopId);
        }
        setShowSuccessModal(true);
        posthog?.capture("checkout_order_created", {
          order_id: result.orderId,
          order_number: result.orderNumber || "ZUNO-ORDER",
          shop_id: targetShopId,
          total: result.total ?? quote.total,
        });
      } else {
        setOrderError(result.message || "Unable to place order right now.");
      }
    } catch (err: any) {
      console.error("Error placing order:", err);
      setOrderError(err?.message || "Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Preparing checkout...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
                router.push("/cart" as never);
              }
            }}
          >
            <ArrowLeft size={20} color={DARK} />
          </Pressable>

          <Text style={styles.headerTitle}>Checkout</Text>

          <View style={{ width: 38 }} />
        </View>

        {/* Multi-Step Progress Bar */}
        <View style={styles.progressBarRow}>
          {[
            { step: 1, label: "Address" },
            { step: 2, label: "Order" },
            { step: 3, label: "Payment" },
            { step: 4, label: "Review" },
          ].map((item, index) => {
            const isActive = currentStep >= item.step;
            const isCurrent = currentStep === item.step;
            return (
              <React.Fragment key={item.step}>
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isActive && styles.stepCircleActive,
                      isCurrent && styles.stepCircleCurrent,
                    ]}
                  >
                    {isActive ? (
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    ) : (
                      <Text style={styles.stepNumber}>{item.step}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      isActive && styles.stepLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>

                {index < 3 && (
                  <View
                    style={[
                      styles.stepConnector,
                      currentStep > item.step && styles.stepConnectorActive,
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* STEP 1: DELIVERY ADDRESS SELECTION */}
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              {!isAuthenticated && (
                <View style={styles.availabilityAlertBox}>
                  <Text style={styles.availabilityAlertText}>
                    Sign in with your ZUNO customer account before placing a delivery order.
                  </Text>
                  <Pressable
                    style={{ marginTop: 8, alignSelf: "flex-start", backgroundColor: GREEN, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}
                    onPress={() => router.push("/login" as never)}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>
                      Sign In / Register
                    </Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.sectionHeading}>Delivery Address</Text>
              <Text style={styles.sectionSub}>Select a saved delivery address</Text>

              {isAuthenticated && addresses.length === 0 && (
                <View style={styles.availabilityAlertBox}>
                  <Text style={styles.availabilityAlertText}>
                    No saved delivery address found on your account. Please add a verified address before placing an order.
                  </Text>
                </View>
              )}

              {addresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <Pressable
                    key={addr.id}
                    style={[styles.addressCard, isSelected && styles.addressCardSelected]}
                    onPress={() => setSelectedAddressId(addr.id)}
                  >
                    <View style={styles.radioRow}>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addressLabel}>{addr.label || "Home"}</Text>
                        <Text style={styles.addressLine}>
                          {addr.city} - {addr.pincode}
                        </Text>
                        <Text style={styles.addressSub}>{addr.line1}</Text>
                        {addr.phone_number && (
                          <Text style={styles.addressPhone}>{addr.phone_number}</Text>
                        )}
                      </View>
                      <Pressable style={styles.editBtn} onPress={() => handleOpenEditAddress(addr)}>
                        <Text style={styles.editText}>Edit</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}

              <Pressable style={styles.addAddressBtn} onPress={handleOpenAddAddress}>
                <Plus size={16} color={GREEN} />
                <Text style={styles.addAddressText}>Add New Address</Text>
              </Pressable>

              {/* Delivery Instructions Input */}
              <View style={styles.instructionsBox}>
                <Text style={styles.inputLabel}>Delivery Instructions (Optional)</Text>
                <TextInput
                  value={deliveryInstructions}
                  onChangeText={setDeliveryInstructions}
                  placeholder="e.g. Leave at door, call before delivery"
                  placeholderTextColor="#89948D"
                  style={styles.textInput}
                />
              </View>
            </View>
          )}

          {/* STEP 2: ORDER SUMMARY */}
          {currentStep === 2 && quote && (
            <View style={styles.stepContainer}>
              <Text style={styles.sectionHeading}>Order Summary</Text>

              <View style={styles.shopCard}>
                <View style={styles.shopHeader}>
                  <Store size={18} color={GREEN} />
                  <Text style={styles.shopTitle}>
                    Items from {quote.shopName} ({quote.items.length})
                  </Text>
                </View>

                {quote.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={{ fontSize: 24 }}>{item.emoji || "📦"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemUnit}>
                        {item.unit} · ₹{item.price}
                      </Text>
                    </View>
                    <Text style={styles.itemQty}>{item.quantity}</Text>
                    <Text style={styles.itemSubtotal}>
                      ₹{item.price * item.quantity}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Price Details */}
              <View style={styles.priceBox}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Items total</Text>
                  <Text style={styles.priceValue}>₹{quote.subtotal}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Delivery fee</Text>
                  <Text style={styles.priceValue}>
                    {quote.deliveryFee === 0 ? "FREE" : `₹${quote.deliveryFee}`}
                  </Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Platform fee</Text>
                  <Text style={styles.priceValue}>₹{quote.platformFee}</Text>
                </View>
                {quote.discount > 0 && (
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceLabel, { color: GREEN }]}>Coupon Discount</Text>
                    <Text style={[styles.priceValue, { color: GREEN }]}>−₹{quote.discount}</Text>
                  </View>
                )}

                <View style={styles.divider} />

                <View style={styles.priceRowTotal}>
                  <Text style={styles.totalLabel}>Estimated total</Text>
                  <Text style={styles.totalValue}>₹{quote.total}</Text>
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: PAYMENT METHOD */}
          {currentStep === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.sectionHeading}>Payment Method</Text>
              <Text style={styles.sectionSub}>Choose a payment method</Text>

              {[
                {
                  id: "COD",
                  title: "Cash on Delivery",
                  subtitle: "Pay at the time of delivery",
                  icon: Banknote,
                },
                {
                  id: "UPI",
                  title: "UPI",
                  subtitle: "PhonePe, Google Pay, Paytm",
                  icon: CreditCard,
                },
                {
                  id: "ONLINE",
                  title: "Credit / Debit Card",
                  subtitle: "Pay securely with card",
                  icon: CreditCard,
                },
              ].map((method) => {
                const isSelected = paymentMethod === method.id;
                const IconComp = method.icon;
                return (
                  <Pressable
                    key={method.id}
                    style={[styles.paymentCard, isSelected && styles.paymentCardSelected]}
                    onPress={() => setPaymentMethod(method.id as PaymentMethod)}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.methodIconBox}>
                      <IconComp size={20} color={GREEN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.methodTitle}>{method.title}</Text>
                      <Text style={styles.methodSub}>{method.subtitle}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* Apply Coupon Box */}
              <View style={styles.couponBox}>
                <View style={styles.couponHeader}>
                  <Tag size={16} color={GREEN} />
                  <Text style={styles.couponTitle}>Apply Coupon</Text>
                </View>

                <View style={styles.couponInputRow}>
                  <TextInput
                    value={couponCode}
                    onChangeText={setCouponCode}
                    placeholder="Enter coupon code (try ZUNO50)"
                    placeholderTextColor="#89948D"
                    style={styles.couponInput}
                    autoCapitalize="characters"
                  />
                  <Pressable style={styles.applyBtn} onPress={handleApplyCoupon}>
                    <Text style={styles.applyBtnText}>Apply</Text>
                  </Pressable>
                </View>

                {appliedCoupon.length > 0 && (
                  <View style={styles.couponSuccessBadge}>
                    <Check size={12} color={GREEN} />
                    <Text style={styles.couponSuccessText}>
                      Coupon '{appliedCoupon}' applied! ₹50 saved.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* STEP 4: REVIEW & PLACE ORDER */}
          {currentStep === 4 && quote && (
            <View style={styles.stepContainer}>
              <Text style={styles.sectionHeading}>Review & Place Order</Text>
              <Text style={styles.sectionSub}>Please review your order details</Text>

              {(!isAuthenticated || !selectedAddressId || !quote.isServiceable || quote.shopAvailable === false || orderError) && (
                <View style={styles.availabilityAlertBox}>
                  <Text style={styles.availabilityAlertText}>
                    {orderError ||
                      (!isAuthenticated
                        ? "Please sign in with your customer account before placing an order."
                        : !selectedAddressId
                        ? "Please select a saved delivery address from your account."
                        : quote.serviceMessage ||
                          "This shop is not accepting orders right now.")}
                  </Text>
                </View>
              )}

              {/* Delivery Address Card Review */}
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <MapPin size={18} color={GREEN} />
                  <Text style={styles.reviewTitle}>Delivery Address</Text>
                  <Pressable onPress={() => setCurrentStep(1)}>
                    <Text style={styles.editLink}>Edit</Text>
                  </Pressable>
                </View>
                <Text style={styles.reviewBodyTitle}>{selectedAddress?.label || "Home"}</Text>
                <Text style={styles.reviewBodyText}>
                  {selectedAddress?.line1}, {selectedAddress?.city} - {selectedAddress?.pincode}
                </Text>
              </View>

              {/* Order Items Review */}
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Store size={18} color={GREEN} />
                  <Text style={styles.reviewTitle}>
                    Order Items ({quote.items.length})
                  </Text>
                  <Pressable onPress={() => setCurrentStep(2)}>
                    <Text style={styles.editLink}>Edit</Text>
                  </Pressable>
                </View>
                {quote.items.map((it) => (
                  <View key={it.id} style={styles.reviewItemRow}>
                    <Text style={styles.reviewItemName}>{it.name}</Text>
                    <Text style={styles.reviewItemQty}>{it.unit} x {it.quantity}</Text>
                    <Text style={styles.reviewItemSub}>₹{it.price * it.quantity}</Text>
                  </View>
                ))}
              </View>

              {/* Payment Method Review */}
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Banknote size={18} color={GREEN} />
                  <Text style={styles.reviewTitle}>Payment Method</Text>
                  <Pressable onPress={() => setCurrentStep(3)}>
                    <Text style={styles.editLink}>Edit</Text>
                  </Pressable>
                </View>
                <Text style={styles.reviewBodyTitle}>
                  {paymentMethod === "COD"
                    ? "Cash on Delivery"
                    : paymentMethod === "UPI"
                    ? "UPI Payment"
                    : "Online Payment"}
                </Text>
              </View>

              {/* Final Price Breakdown */}
              <View style={styles.priceBox}>
                <Text style={styles.billTitle}>Price Details</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Items total</Text>
                  <Text style={styles.priceValue}>₹{quote.subtotal}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Delivery fee</Text>
                  <Text style={styles.priceValue}>
                    {quote.deliveryFee === 0 ? "FREE" : `₹${quote.deliveryFee}`}
                  </Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Platform fee</Text>
                  <Text style={styles.priceValue}>₹{quote.platformFee}</Text>
                </View>
                {quote.discount > 0 && (
                  <View style={styles.priceRow}>
                    <Text style={[styles.priceLabel, { color: GREEN }]}>Discount</Text>
                    <Text style={[styles.priceValue, { color: GREEN }]}>−₹{quote.discount}</Text>
                  </View>
                )}

                <View style={styles.divider} />

                <View style={styles.priceRowTotal}>
                  <Text style={styles.totalLabel}>Estimated total</Text>
                  <Text style={styles.totalValue}>₹{quote.total}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Sticky Bottom Action CTA */}
        {quote && (
          <View style={styles.bottomBar}>
            {currentStep === 1 && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setCurrentStep(2)}
              >
                <View style={styles.btnRow}>
                  <Text style={styles.primaryBtnText}>Continue to Order Summary</Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </View>
              </Pressable>
            )}

            {currentStep === 2 && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setCurrentStep(3)}
              >
                <View style={styles.btnRow}>
                  <Text style={styles.primaryBtnText}>Continue to Payment</Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </View>
              </Pressable>
            )}

            {currentStep === 3 && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setCurrentStep(4)}
              >
                <View style={styles.btnRow}>
                  <Text style={styles.primaryBtnText}>Review Order</Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </View>
              </Pressable>
            )}

            {currentStep === 4 && (
              <Pressable
                style={[
                  styles.primaryBtn,
                  (submitting ||
                    !isAuthenticated ||
                    !selectedAddressId ||
                    !quote.isServiceable ||
                    quote.shopAvailable === false) &&
                    styles.btnDisabled,
                ]}
                onPress={handlePlaceOrder}
                disabled={
                  submitting ||
                  !isAuthenticated ||
                  !selectedAddressId ||
                  !quote.isServiceable ||
                  quote.shopAvailable === false
                }
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Place Order</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* Order Confirmed Success Modal (Matching Screen 5) */}
        <Modal
          visible={showSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.successRaysCircle}>
                <Check size={36} color="#FFFFFF" strokeWidth={3} />
              </View>

              <Text style={styles.successTitle}>Order Placed Successfully!</Text>
              <Text style={styles.successSub}>
                Your order #{placedOrderNumber} has been placed and is being confirmed by the shop.
              </Text>

              <View style={styles.estDeliveryBox}>
                <Text style={styles.estLabel}>Estimated delivery</Text>
                <Text style={styles.estTime}>25–35 min</Text>
              </View>

              <Pressable
                style={styles.viewOrderBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push(`/order/${placedOrderId}` as never);
                }}
              >
                <Text style={styles.viewOrderText}>View Order Details</Text>
              </Pressable>

              <Pressable
                style={styles.continueShopBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push("/" as never);
                }}
              >
                <Text style={styles.continueShopText}>Continue Shopping</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit / Add Address Modal */}
        <Modal
          visible={showAddressModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddressModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.addressModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>
                  {editingAddressId ? "Edit Delivery Address" : "Add New Address"}
                </Text>
                <Pressable
                  style={styles.modalCloseBtn}
                  onPress={() => setShowAddressModal(false)}
                >
                  <X size={18} color={DARK} />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 380 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalFieldLabel}>Address Tag / Label</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  {["Home", "Work", "Other"].map((lbl) => (
                    <Pressable
                      key={lbl}
                      style={[
                        styles.labelChip,
                        addressForm.label === lbl && styles.labelChipSelected,
                      ]}
                      onPress={() => setAddressForm({ ...addressForm, label: lbl })}
                    >
                      <Text
                        style={[
                          styles.labelChipText,
                          addressForm.label === lbl && styles.labelChipTextSelected,
                        ]}
                      >
                        {lbl}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.modalFieldLabel}>
                  House / Flat No., Street, Landmark *
                </Text>
                <TextInput
                  value={addressForm.line1}
                  onChangeText={(txt) => setAddressForm({ ...addressForm, line1: txt })}
                  placeholder="e.g. House No. 42, Near Railway Station"
                  placeholderTextColor="#89948D"
                  style={styles.modalTextInput}
                />

                <Text style={styles.modalFieldLabel}>Area / Locality / Sector</Text>
                <TextInput
                  value={addressForm.line2}
                  onChangeText={(txt) => setAddressForm({ ...addressForm, line2: txt })}
                  placeholder="e.g. Sector 4, Renukoot"
                  placeholderTextColor="#89948D"
                  style={styles.modalTextInput}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalFieldLabel}>City</Text>
                    <TextInput
                      value={addressForm.city}
                      onChangeText={(txt) => setAddressForm({ ...addressForm, city: txt })}
                      placeholder="City"
                      placeholderTextColor="#89948D"
                      style={styles.modalTextInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalFieldLabel}>PIN Code</Text>
                    <TextInput
                      value={addressForm.pincode}
                      onChangeText={(txt) => setAddressForm({ ...addressForm, pincode: txt })}
                      placeholder="PIN Code"
                      keyboardType="number-pad"
                      placeholderTextColor="#89948D"
                      style={styles.modalTextInput}
                    />
                  </View>
                </View>

                <Text style={styles.modalFieldLabel}>Recipient Name</Text>
                <TextInput
                  value={addressForm.recipient_name}
                  onChangeText={(txt) =>
                    setAddressForm({ ...addressForm, recipient_name: txt })
                  }
                  placeholder="Full Name"
                  placeholderTextColor="#89948D"
                  style={styles.modalTextInput}
                />

                <Text style={styles.modalFieldLabel}>Phone Number</Text>
                <TextInput
                  value={addressForm.phone_number}
                  onChangeText={(txt) =>
                    setAddressForm({ ...addressForm, phone_number: txt })
                  }
                  placeholder="Mobile Number"
                  keyboardType="phone-pad"
                  placeholderTextColor="#89948D"
                  style={styles.modalTextInput}
                />
              </ScrollView>

              <Pressable
                style={styles.saveAddressModalBtn}
                onPress={handleSaveAddress}
              >
                <Text style={styles.saveAddressModalBtnText}>
                  {editingAddressId ? "Save Changes" : "Save & Use Address"}
                </Text>
              </Pressable>
            </View>
          </View>
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
  },
  loadingText: {
    marginTop: 12,
    color: MUTED,
    fontSize: 13,
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
  progressBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEFEA",
  },
  stepItem: {
    alignItems: "center",
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E2E8E2",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: GREEN,
  },
  stepCircleCurrent: {
    borderWidth: 2,
    borderColor: LIGHT_GREEN,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
  },
  stepLabel: {
    fontSize: 9.5,
    color: MUTED,
    marginTop: 3,
    fontWeight: "600",
  },
  stepLabelActive: {
    color: GREEN,
    fontWeight: "800",
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8E2",
    marginHorizontal: 6,
    marginTop: -12,
  },
  stepConnectorActive: {
    backgroundColor: GREEN,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 90,
  },
  stepContainer: {
    gap: 12,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
  },
  sectionSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: -4,
  },
  addressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  addressCardSelected: {
    borderColor: GREEN,
    backgroundColor: LIGHT_GREEN,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: MUTED,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioCircleSelected: {
    borderColor: GREEN,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
  },
  addressLine: {
    fontSize: 12,
    color: DARK,
    marginTop: 2,
  },
  addressSub: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  addressPhone: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "700",
  },
  addAddressBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: GREEN,
    gap: 6,
  },
  addAddressText: {
    color: GREEN,
    fontWeight: "800",
    fontSize: 13,
  },
  instructionsBox: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8E2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: DARK,
  },
  shopCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  shopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F6F4",
    marginBottom: 10,
  },
  shopTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  itemUnit: {
    fontSize: 11,
    color: MUTED,
  },
  itemQty: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
  },
  itemSubtotal: {
    fontSize: 13,
    fontWeight: "900",
    color: DARK,
  },
  priceBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  billTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  priceLabel: {
    fontSize: 12,
    color: MUTED,
  },
  priceValue: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
  },
  divider: {
    height: 1,
    backgroundColor: "#EAEFEA",
    marginVertical: 8,
  },
  priceRowTotal: {
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
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    gap: 12,
  },
  paymentCardSelected: {
    borderColor: GREEN,
    backgroundColor: LIGHT_GREEN,
  },
  methodIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  methodSub: {
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },
  couponBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    marginTop: 8,
  },
  couponHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  couponTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  couponInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  couponInput: {
    flex: 1,
    backgroundColor: "#F8FAF6",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8E2",
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: DARK,
  },
  applyBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  couponSuccessBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  couponSuccessText: {
    color: GREEN,
    fontSize: 11,
    fontWeight: "700",
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F6F4",
    marginBottom: 8,
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
    flex: 1,
    marginLeft: 8,
  },
  editLink: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "700",
  },
  reviewBodyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
  },
  reviewBodyText: {
    fontSize: 11.5,
    color: MUTED,
    marginTop: 2,
  },
  reviewItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  reviewItemName: {
    fontSize: 12,
    color: DARK,
    flex: 1,
  },
  reviewItemQty: {
    fontSize: 12,
    color: MUTED,
    marginHorizontal: 8,
  },
  reviewItemSub: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
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
  },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalSheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  successRaysCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#22A06B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: DARK,
  },
  successSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  estDeliveryBox: {
    backgroundColor: LIGHT_GREEN,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    marginVertical: 16,
  },
  estLabel: {
    fontSize: 10.5,
    color: GREEN,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  estTime: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
    marginTop: 2,
  },
  viewOrderBtn: {
    width: "100%",
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  viewOrderText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  continueShopBtn: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  continueShopText: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "800",
  },
  addressModalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    maxHeight: 520,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEFEA",
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: DARK,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
    marginBottom: 4,
    marginTop: 8,
  },
  modalTextInput: {
    backgroundColor: "#F8FAF8",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: DARK,
    marginBottom: 6,
  },
  labelChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  labelChipSelected: {
    backgroundColor: LIGHT_GREEN,
    borderColor: GREEN,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  labelChipTextSelected: {
    color: GREEN,
    fontWeight: "800",
  },
  saveAddressModalBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  saveAddressModalBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  availabilityAlertBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  availabilityAlertText: {
    color: "#B91C1C",
    fontSize: 12.5,
    fontWeight: "700",
  },
});
