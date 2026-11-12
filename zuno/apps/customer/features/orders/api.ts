import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OrderStatus } from "@zuno/types";

export interface OrderDetailItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  subtotal: number;
  image_url?: string | null;
}

export interface OrderDetailData {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  shopId: string;
  shopName: string;
  shopDistance: string;
  addressLabel: string;
  addressLine: string;
  recipientName: string;
  phone: string;
  items: OrderDetailItem[];
  paymentMethod: string;
  paymentStatus: string;
  deliveryPartnerName?: string;
  deliveryPartnerPhone?: string;
  deliveryPartnerVehicle?: string;
  deliveryEta?: string;
  timeline: {
    status: OrderStatus;
    title: string;
    description: string;
    timestamp?: string;
    completed: boolean;
  }[];
}

export interface CustomerOrderListItem {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopDistance: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  itemsCount: number;
  itemPreview: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    emoji?: string;
  }[];
  addressLine: string;
}

const PLACED_ORDERS_STORAGE_KEY = "zuno_user_placed_orders";
const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FALLBACK_CUSTOMER_ORDERS: CustomerOrderListItem[] = [
  {
    id: "ord-123",
    orderNumber: "ZUNO-123456",
    shopId: "shop-1",
    shopName: "Eureka Fresh Mart",
    shopDistance: "2.5 km away",
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    status: OrderStatus.PLACED,
    total: 121,
    subtotal: 96,
    itemsCount: 4,
    itemPreview: "Fresh Tomato (2 kg), Fresh Onion (1 kg), Fresh Potato (1 kg)",
    items: [
      { id: "1", name: "Fresh Tomato", price: 22, quantity: 2, unit: "1 kg", emoji: "🍅" },
      { id: "2", name: "Fresh Onion", price: 28, quantity: 1, unit: "1 kg", emoji: "🧅" },
      { id: "3", name: "Fresh Potato", price: 24, quantity: 1, unit: "1 kg", emoji: "🥔" },
    ],
    addressLine: "Near Railway Station, Renukoot - 231217",
  },
  {
    id: "ord-100",
    orderNumber: "ZUNO-987654",
    shopId: "shop-1",
    shopName: "Eureka Fresh Mart",
    shopDistance: "2.5 km away",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: OrderStatus.DELIVERED,
    total: 215,
    subtotal: 190,
    itemsCount: 3,
    itemPreview: "Fresh Apples (1 kg), Amul Taaza Milk (1L), Fresh Paneer (200g)",
    items: [
      { id: "4", name: "Fresh Apples", price: 120, quantity: 1, unit: "1 kg", emoji: "🍎" },
      { id: "5", name: "Amul Taaza Milk", price: 55, quantity: 1, unit: "1L", emoji: "🥛" },
      { id: "6", name: "Fresh Paneer", price: 40, quantity: 1, unit: "200g", emoji: "🧀" },
    ],
    addressLine: "Near Railway Station, Renukoot - 231217",
  },
];

export async function getLocalPlacedOrders(): Promise<CustomerOrderListItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PLACED_ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

export async function saveLocalPlacedOrder(order: CustomerOrderListItem): Promise<void> {
  try {
    const existing = await getLocalPlacedOrders();
    const updated = [order, ...existing.filter((o) => o.id !== order.id)];
    await AsyncStorage.setItem(PLACED_ORDERS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // fallback
  }
}

export async function getCustomerOrdersList(
  filterType: "ALL" | "ACTIVE" | "COMPLETED" | "CANCELLED" = "ALL"
): Promise<CustomerOrderListItem[]> {
  let remoteOrders: CustomerOrderListItem[] = [];

  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          status,
          subtotal,
          delivery_fee,
          total,
          created_at,
          shop_id,
          addresses (line1, city, pincode),
          order_items (id, product_name_snapshot, unit_price_snapshot, quantity)
        `)
        .eq("customer_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const shopIds = Array.from(new Set(data.map((o: any) => o.shop_id).filter(Boolean)));
        const shopNameMap = new Map<string, string>();
        if (shopIds.length > 0) {
          const { data: storefrontRows } = await supabase
            .from("public_storefronts")
            .select("id, name")
            .in("id", shopIds);
          for (const sf of storefrontRows || []) {
            if (sf?.id && sf?.name) {
              shopNameMap.set(sf.id, sf.name);
            }
          }
        }

        remoteOrders = data.map((o: any) => {
          const itemsList = (o.order_items || []).map((it: any) => ({
            id: it.id,
            name: it.product_name_snapshot,
            price: Number(it.unit_price_snapshot),
            quantity: it.quantity,
            unit: "1 pack",
          }));

          const itemNames = itemsList.map((it: any) => `${it.name} (${it.quantity})`).join(", ");

          return {
            id: o.id,
            orderNumber: `ZUNO-${o.id.slice(0, 6).toUpperCase()}`,
            shopId: o.shop_id || "",
            shopName: shopNameMap.get(o.shop_id) || "Local ZUNO Store",
            shopDistance: "Nearby",
            createdAt: o.created_at,
            status: (o.status as OrderStatus) || OrderStatus.PLACED,
            total: Number(o.total),
            subtotal: Number(o.subtotal),
            itemsCount: itemsList.reduce((acc: number, item: any) => acc + item.quantity, 0),
            itemPreview: itemNames || "Grocery items",
            items: itemsList,
            addressLine: o.addresses
              ? `${o.addresses.line1 || ""}, ${o.addresses.city || "Renukoot"} - ${o.addresses.pincode || "231217"}`
              : "Renukoot - 231217",
          };
        });
      }
    }
  } catch {
    return [];
  }

  const combined = remoteOrders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (filterType === "ACTIVE") {
    const activeStatuses: OrderStatus[] = [
      OrderStatus.PLACED,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.OUT_FOR_DELIVERY,
    ];
    return combined.filter((o) => activeStatuses.includes(o.status));
  }

  if (filterType === "COMPLETED") {
    return combined.filter((o) => o.status === OrderStatus.DELIVERED);
  }

  if (filterType === "CANCELLED") {
    return combined.filter(
      (o) => o.status === OrderStatus.CANCELLED || o.status === OrderStatus.REJECTED
    );
  }

  return combined;
}

export async function getCustomerOrderDetails(orderId: string): Promise<OrderDetailData | null> {

  if (!orderId || !IS_UUID_REGEX.test(orderId)) {
    return getFallbackOrderDetails(orderId);
  }

  try {
    const { data: userData } = await supabase.auth.getUser();

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        subtotal,
        delivery_fee,
        total,
        created_at,
        shop_id,
        address_id,
        addresses (label, line1, line2, pincode),
        order_items (id, product_name_snapshot, unit_price_snapshot, quantity, subtotal)
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (!error && order) {
      let resolvedShopName = "Local ZUNO Store";
      if (order.shop_id) {
        const { data: sf } = await supabase
          .from("public_storefronts")
          .select("name")
          .eq("id", order.shop_id)
          .maybeSingle();
        if (sf?.name) {
          resolvedShopName = sf.name;
        }
      }

      const formattedItems: OrderDetailItem[] = (order.order_items || []).map((it: any) => ({
        id: it.id,
        name: it.product_name_snapshot,
        unit: "1 pack",
        price: Number(it.unit_price_snapshot),
        quantity: it.quantity,
        subtotal: Number(it.subtotal),
      }));

      const addr = (order.addresses as any) || {};

      return {
        id: order.id,
        orderNumber: `ZUNO-${order.id.slice(0, 6).toUpperCase()}`,
        status: (order.status as OrderStatus) || OrderStatus.PLACED,
        createdAt: order.created_at,
        subtotal: Number(order.subtotal),
        deliveryFee: Number(order.delivery_fee),
        platformFee: 5,
        total: Number(order.total),
        shopId: order.shop_id,
        shopName: resolvedShopName,
        shopDistance: "2.5 km away",
        addressLabel: addr.label || "Home",
        addressLine: `${addr.line1 || "Near Railway Station"}, ${addr.line2 || "Renukoot"} - ${addr.pincode || "231217"}`,
        recipientName: "Customer",
        phone: "+91 98765 43210",
        items: formattedItems,
        paymentMethod: "Cash on Delivery",
        paymentStatus: "PENDING",
        deliveryPartnerName: "Ravi Kumar",
        deliveryPartnerPhone: "+91 98765 12345",
        deliveryPartnerVehicle: "DL8S AB 1234 · Honda Activa",
        deliveryEta: "25–35 min",
        timeline: buildTimeline((order.status as OrderStatus) || OrderStatus.PLACED, order.created_at),
      };
    }
  } catch {
    // Fallback
  }

  return getFallbackOrderDetails(orderId);
}

function getFallbackOrderDetails(orderId: string): OrderDetailData {
  const createdTime = new Date().toISOString();
  return {
    id: orderId,
    orderNumber: `ZUNO-${orderId.replace(/[^0-9]/g, "").slice(0, 6) || "123456"}`,
    status: OrderStatus.PLACED,
    createdAt: createdTime,
    subtotal: 96,
    deliveryFee: 20,
    platformFee: 5,
    total: 121,
    shopId: "shop-1",
    shopName: "Eureka Fresh Mart",
    shopDistance: "2.5 km away",
    addressLabel: "Home",
    addressLine: "Near Railway Station, Renukoot - 231217",
    recipientName: "Customer",
    phone: "+91 98765 43210",
    items: [
      { id: "1", name: "Fresh Tomato", unit: "1 kg", price: 22, quantity: 2, subtotal: 44 },
      { id: "2", name: "Fresh Onion", unit: "1 kg", price: 28, quantity: 1, subtotal: 28 },
      { id: "3", name: "Fresh Potato", unit: "1 kg", price: 24, quantity: 1, subtotal: 24 },
    ],
    paymentMethod: "Cash on Delivery",
    paymentStatus: "PENDING",
    deliveryPartnerName: "Ravi Kumar",
    deliveryPartnerPhone: "+91 98765 12345",
    deliveryPartnerVehicle: "DL8S AB 1234 · Honda Activa",
    deliveryEta: "25–35 min",
    timeline: buildTimeline(OrderStatus.PLACED, createdTime),
  };
}

function buildTimeline(status: OrderStatus, createdAt: string) {
  const timeStr = new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const steps = [
    {
      status: OrderStatus.PLACED,
      title: "Order Placed",
      description: "Your order has been confirmed by the shop.",
      timestamp: timeStr,
      completed: true,
    },
    {
      status: OrderStatus.PREPARING,
      title: "Preparing at Shop",
      description: "Items are being packed.",
      timestamp: status !== OrderStatus.PLACED ? "10:22 AM" : undefined,
      completed:
        status === OrderStatus.PREPARING ||
        status === OrderStatus.READY_FOR_PICKUP ||
        status === OrderStatus.OUT_FOR_DELIVERY ||
        status === OrderStatus.DELIVERED,
    },
    {
      status: OrderStatus.READY_FOR_PICKUP,
      title: "Ready for Pickup",
      description: "Your order is ready.",
      timestamp:
        status === OrderStatus.OUT_FOR_DELIVERY || status === OrderStatus.DELIVERED
          ? "10:40 AM"
          : undefined,
      completed:
        status === OrderStatus.READY_FOR_PICKUP ||
        status === OrderStatus.OUT_FOR_DELIVERY ||
        status === OrderStatus.DELIVERED,
    },
    {
      status: OrderStatus.OUT_FOR_DELIVERY,
      title: "Out for Delivery",
      description: "Rider is on the way.",
      timestamp: status === OrderStatus.DELIVERED ? "10:50 AM" : undefined,
      completed: status === OrderStatus.OUT_FOR_DELIVERY || status === OrderStatus.DELIVERED,
    },
    {
      status: OrderStatus.DELIVERED,
      title: "Delivered",
      description: "Enjoy your order!",
      timestamp: status === OrderStatus.DELIVERED ? "11:00 AM" : undefined,
      completed: status === OrderStatus.DELIVERED,
    },
  ];

  return steps;
}

export async function updateOrderStatusByShop(
  orderId: string,
  newStatus: OrderStatus
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) return false;

    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: newStatus,
      changed_by: userData?.user?.id || null,
      note: `Status updated to ${newStatus} by shopkeeper`,
    });

    return true;
  } catch {
    return false;
  }
}

export async function updateDeliveryStatusByPartner(
  deliveryId: string,
  newStatus: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("deliveries")
      .update({ status: newStatus })
      .eq("id", deliveryId);

    return !error;
  } catch {
    return false;
  }
}

export function subscribeToOrderRealtime(
  orderId: string,
  onUpdate: (newStatus: OrderStatus) => void
) {
  const channelName = `order-tracking-${orderId}-${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        if (payload.new && payload.new.status) {
          onUpdate(payload.new.status as OrderStatus);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToAllCustomerOrdersRealtime(onOrdersUpdate: () => void) {
  const channelName = `customer-orders-${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
      },
      () => {
        onOrdersUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export interface DeliveryLocation {
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export async function updateDeliveryLocationByPartner(
  deliveryId: string,
  latitude: number,
  longitude: number
): Promise<boolean> {
  try {
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("deliveries")
      .update({
        current_latitude: latitude,
        current_longitude: longitude,
        location_updated_at: updatedAt,
      })
      .eq("id", deliveryId);

    if (updateError) return false;

    await supabase.from("delivery_locations").insert({
      delivery_id: deliveryId,
      latitude,
      longitude,
      recorded_at: updatedAt,
    });

    return true;
  } catch {
    return false;
  }
}

export async function getAuthorizedDeliveryLocation(orderId: string): Promise<DeliveryLocation | null> {
  const fallbackLocation: DeliveryLocation = {
    latitude: 24.2185,
    longitude: 83.0335,
    updatedAt: new Date().toISOString(),
  };

  if (!orderId || !IS_UUID_REGEX.test(orderId)) {
    return fallbackLocation;
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return fallbackLocation;

    const { data, error } = await supabase
      .from("delivery_locations")
      .select("latitude, longitude, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && data.latitude && data.longitude) {
      return {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        updatedAt: data.recorded_at || new Date().toISOString(),
      };
    }
  } catch {
    // Fallback
  }

  return fallbackLocation;
}

export function subscribeToDeliveryLocationRealtime(
  orderId: string,
  onLocationUpdate: (loc: DeliveryLocation) => void
) {
  const channelName = `delivery-location-${orderId}-${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "deliveries",
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        if (payload.new && payload.new.current_latitude && payload.new.current_longitude) {
          onLocationUpdate({
            latitude: Number(payload.new.current_latitude),
            longitude: Number(payload.new.current_longitude),
            updatedAt: payload.new.location_updated_at || new Date().toISOString(),
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export interface CustomerOrder {
  id: string;
  created_at: string;
  status: string;
  total: number;
  shop_name?: string;
}

export interface ActiveOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  shopName: string;
  shopDistance?: string;
  eta?: string;
  total: number;
  created_at: string;
}

export async function getActiveCustomerOrder(): Promise<ActiveOrderSummary | null> {
  const list = await getCustomerOrdersList("ACTIVE");
  if (list.length > 0) {
    const active = list[0];
    return {
      id: active.id,
      orderNumber: active.orderNumber,
      status: active.status,
      shopName: active.shopName,
      shopDistance: active.shopDistance,
      eta: active.status === OrderStatus.OUT_FOR_DELIVERY ? "12 mins" : undefined,
      total: active.total,
      created_at: active.createdAt,
    };
  }
  return null;
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const list = await getCustomerOrdersList("ALL");
  return list.map((o) => ({
    id: o.id,
    created_at: o.createdAt,
    status: o.status,
    total: o.total,
    shop_name: o.shopName,
  }));
}

export async function cancelCustomerOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return { success: false, message: "User session not found." };
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: OrderStatus.CANCELLED,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("customer_id", userData.user.id)
      .eq("status", OrderStatus.PLACED);

    if (error) {
      return { success: false, message: error.message || "Failed to cancel order." };
    }

    return { success: true, message: "Order cancelled successfully." };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to cancel order." };
  }
}

