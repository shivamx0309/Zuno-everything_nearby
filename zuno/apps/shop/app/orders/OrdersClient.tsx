"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Search,
  PackageOpen,
  Phone,
  Truck,
  Check,
  Package,
  Boxes,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import RejectOrderDialog from "../../components/RejectOrderDialog";
import {
  ShopOrderDetail,
  getShopOrdersAction,
  updateShopOrderStatusAction,
} from "../../features/orders/api";
import { useShopOrdersRealtime } from "../../hooks/useShopOrdersRealtime";

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "PLACED":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "ACCEPTED":
    case "PREPARING":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "READY_FOR_PICKUP":
    case "OUT_FOR_DELIVERY":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "DELIVERED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "CANCELLED":
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export default function OrdersClient({
  initialData,
}: {
  initialData: {
    shop: {
      id: string;
      name: string;
      locality: string;
      pincode: string;
      isActive: boolean;
    };
    orders: ShopOrderDetail[];
    pendingCount: number;
    error?: string;
  };
}) {
  const [data, setData] = useState(initialData);
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ShopOrderDetail | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const refreshOrders = useCallback(async () => {
    try {
      setRefreshing(true);
      const refreshed = await getShopOrdersAction();
      setData(refreshed);
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to refresh orders.",
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const { status: realtimeStatus } = useShopOrdersRealtime(
    data.shop.id,
    refreshOrders
  );

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    if (updatingId) return;
    setUpdatingId(orderId);
    setFeedback(null);
    setRejectError(null);
    try {
      const res = await updateShopOrderStatusAction(orderId, nextStatus);
      await refreshOrders();
      setFeedback({
        type: "success",
        text: res.message || `Order status updated to ${nextStatus}.`,
      });
      if (nextStatus === "REJECTED") {
        setRejectTarget(null);
      }
    } catch (err: any) {
      const message = err?.message || `Failed to update order to ${nextStatus}.`;
      if (nextStatus === "REJECTED" && rejectTarget?.id === orderId) {
        setRejectError(message);
      } else {
        setFeedback({ type: "error", text: message });
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = data.orders.filter((order) => {
    const matchesFilter =
      selectedFilter === "ALL"
        ? true
        : selectedFilter === "PENDING"
        ? order.status === "PLACED"
        : order.status === selectedFilter;

    const matchesSearch =
      order.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.itemsSummary.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Orders Management"
      subtitle="Track, accept and fulfill customer orders in real time"
      actions={
        <div className="flex items-center gap-2">
          {realtimeStatus === "SUBSCRIBED" && (
            <span
              title="Real-time order updates connected"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-[#0F5D3A]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22A06B] animate-pulse" />
              <span>Live</span>
            </span>
          )}
          <button
            onClick={refreshOrders}
            disabled={refreshing}
            title="Refresh orders list"
            aria-label="Refresh orders list"
            className="p-2 text-gray-600 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
          >
            <RefreshCw
              size={18}
              className={refreshing ? "animate-spin text-[#0F5D3A]" : ""}
            />
          </button>
        </div>
      }
    >
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "error" ? (
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-700 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Filter Tabs & Search */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "ALL", label: `All (${data.orders.length})` },
            { id: "PENDING", label: `Pending (${data.pendingCount})` },
            { id: "ACCEPTED", label: "Accepted" },
            { id: "PREPARING", label: "Preparing" },
            { id: "READY_FOR_PICKUP", label: "Ready" },
            { id: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
            { id: "DELIVERED", label: "Delivered" },
            { id: "REJECTED", label: "Rejected" },
            { id: "CANCELLED", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedFilter === tab.id
                  ? "bg-[#0F5D3A] text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by ID, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 text-xs bg-[#F8FAF6] border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-gray-800 focus:outline-none focus:border-[#22A06B]"
          />
        </div>
      </div>

      {/* Explicit Error State (never masked as empty list) */}
      {data.error ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-3"
        >
          <h3 className="text-sm font-extrabold text-red-900">
            Could Not Load Store Orders
          </h3>
          <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
            {data.error}
          </p>
          <button
            type="button"
            onClick={refreshOrders}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>{refreshing ? "Retrying..." : "Retry Loading Orders"}</span>
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
            <PackageOpen size={26} strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-bold text-gray-800">
            {searchQuery || selectedFilter !== "ALL"
              ? "No orders match the selected filter"
              : "No customer orders placed yet"}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchQuery || selectedFilter !== "ALL"
              ? "Try resetting filters or search terms."
              : `Customer orders placed for ${data.shop.name} in Renukoot will appear here with live notification.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isUpdating = updatingId === order.id;
            const isExpanded = expandedOrderId === order.id;

            return (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition space-y-4"
              >
                {/* Header: ID, Customer, Status, Amount */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-black text-[#0F5D3A]">
                      {order.displayId}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadgeClass(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {order.timeAgo}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-base font-black text-gray-900">
                      ₹{order.total.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-bold uppercase">
                      {order.paymentMethod} • {order.paymentStatus}
                    </span>
                  </div>
                </div>

                {/* Customer and Items Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="font-bold text-gray-400 block text-[10px] uppercase">
                      Customer
                    </span>
                    <span className="font-bold text-gray-800 text-sm">
                      {order.customerName}
                    </span>
                    {order.customerPhone && (
                      <span className="text-gray-500 flex items-center gap-1 text-[11px] mt-0.5">
                        <Phone size={11} className="text-gray-400" />
                        <span>{order.customerPhone}</span>
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="font-bold text-gray-400 block text-[10px] uppercase">
                      Items Ordered ({order.items.length})
                    </span>
                    <p className="text-gray-700 font-medium truncate">
                      {order.itemsSummary}
                    </p>
                    <button
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      className="text-[#0F5D3A] font-bold text-[11px] hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      <span>{isExpanded ? "Hide item details" : "View item breakdown"}</span>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  <div>
                    <span className="font-bold text-gray-400 block text-[10px] uppercase">
                      Delivery Details
                    </span>
                    <p className="text-gray-700 font-medium truncate">
                      {order.deliveryAddress || "Renukoot Service Area"}
                    </p>
                    {order.deliveryPartner && (
                      <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px] mt-0.5">
                        <Truck size={12} />
                        <span>{order.deliveryPartner.fullName} ({order.deliveryPartner.vehicleNumber})</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Expandable Item Details Table */}
                {isExpanded && (
                  <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 space-y-2">
                    <h4 className="text-xs font-black text-[#17231D]">Order Items</h4>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-[10px] uppercase">
                          <th className="py-1">Item</th>
                          <th className="py-1 text-center">Qty</th>
                          <th className="py-1 text-right">Price</th>
                          <th className="py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {order.items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-1.5 font-semibold text-gray-800">
                              {item.productName}
                            </td>
                            <td className="py-1.5 text-center text-gray-600">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="py-1.5 text-right text-gray-600">
                              ₹{item.unitPrice}
                            </td>
                            <td className="py-1.5 text-right font-bold text-gray-900">
                              ₹{item.totalPrice}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action Buttons based on Status */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-xs font-bold text-[#0F5D3A] hover:underline"
                  >
                    View Order Details →
                  </Link>

                  <div className="flex items-center justify-end gap-2">
                  {order.status === "PLACED" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectError(null);
                          setRejectTarget(order);
                        }}
                        disabled={isUpdating || Boolean(updatingId)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition border border-red-200 disabled:opacity-50"
                      >
                        Reject Order
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(order.id, "ACCEPTED")}
                        disabled={isUpdating || Boolean(updatingId)}
                        className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition shadow-sm disabled:opacity-50"
                      >
                        <Check size={14} strokeWidth={2.2} />
                        <span>{isUpdating ? "Updating..." : "Accept Order"}</span>
                      </button>
                    </>
                  )}

                  {order.status === "ACCEPTED" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(order.id, "PREPARING")}
                      disabled={isUpdating || Boolean(updatingId)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                      <Package size={14} strokeWidth={2} />
                      <span>{isUpdating ? "Updating..." : "Start Preparing"}</span>
                    </button>
                  )}

                  {order.status === "PREPARING" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(order.id, "READY_FOR_PICKUP")}
                      disabled={isUpdating || Boolean(updatingId)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-sm disabled:opacity-50"
                    >
                      <Boxes size={14} strokeWidth={2} />
                      <span>{isUpdating ? "Updating..." : "Mark Ready for Pickup"}</span>
                    </button>
                  )}

                  {order.status === "READY_FOR_PICKUP" && (
                    <span className="text-xs text-purple-700 font-bold bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
                      Awaiting delivery partner pickup
                    </span>
                  )}

                  {order.status === "DELIVERED" && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                      <CheckCircle2 size={13} />
                      <span>Order successfully delivered</span>
                    </span>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RejectOrderDialog
        open={Boolean(rejectTarget)}
        orderDisplayId={rejectTarget?.displayId || ""}
        customerName={rejectTarget?.customerName}
        isSubmitting={Boolean(rejectTarget && updatingId === rejectTarget.id)}
        error={rejectError}
        onConfirm={() => {
          if (rejectTarget) {
            void handleUpdateStatus(rejectTarget.id, "REJECTED");
          }
        }}
        onCancel={() => {
          if (!updatingId) {
            setRejectTarget(null);
            setRejectError(null);
          }
        }}
      />
    </ShopLayoutShell>
  );
}
