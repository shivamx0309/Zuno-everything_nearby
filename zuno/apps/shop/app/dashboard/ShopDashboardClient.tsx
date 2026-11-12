"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import {
  IndianRupee,
  ShoppingBag,
  Clock,
  Plus,
  Boxes,
  ClipboardList,
  Store,
  Truck,
  Package,
  PackageOpen,
  Search,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import {
  getShopDashboardDataAction,
  DashboardData,
} from "../../features/dashboard/api";
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

function getGreetingTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function ShopDashboardClient({
  initialData,
}: {
  initialData: DashboardData;
}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialData.error || null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getShopDashboardDataAction();
      setData(res);
      if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const { status: realtimeStatus } = useShopOrdersRealtime(
    data.shop.id,
    loadData
  );

  const filteredOrders = (data.recentOrders || []).filter(
    (order) =>
      order.displayId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.itemsSummary.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.metrics.pendingOrdersCount}
      title="Shop Dashboard"
      subtitle="Manage your storefront, inventory and live customer orders in Renukoot"
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
            onClick={loadData}
            disabled={loading}
            title="Refresh live dashboard data"
            aria-label="Refresh live dashboard data"
            className="p-2 text-gray-600 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
          >
            <RefreshCw
              size={18}
              strokeWidth={2}
              className={`text-gray-600 hover:text-[#0F5D3A] transition-transform ${
                loading ? "animate-spin" : ""
              }`}
            />
          </button>
        </div>
      }
    >
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Clean Welcome Banner */}
      <div className="bg-gradient-to-r from-[#0F5D3A] to-[#157248] rounded-2xl p-6 text-white shadow-sm border border-emerald-900/10">
        <div className="max-w-2xl">
          <span className="bg-[#A7D56B] text-[#0F5D3A] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-block">
            Hyperlocal Merchant
          </span>
          <h2 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
            {getGreetingTime()}, {data.shop.name}
          </h2>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Here’s what’s happening with your store today. You have{" "}
            <span className="font-bold text-white underline decoration-[#A7D56B] underline-offset-4">
              {data.metrics.pendingOrdersCount} pending order
              {data.metrics.pendingOrdersCount === 1 ? "" : "s"}
            </span>{" "}
            ready for packing.
          </p>
        </div>
      </div>

      {/* Metric KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            title: "Today's Merchandise",
            value: `₹${data.metrics.todayRevenue.toLocaleString("en-IN")}`,
            change: "Excl. delivery fees",
            isPositive: true,
            icon: IndianRupee,
            iconBg: "bg-emerald-50 text-[#0F5D3A] border-emerald-100",
          },
          {
            title: "Today's Orders",
            value: `${data.metrics.todayOrdersCount} Orders`,
            change: `${data.metrics.fulfilledOrdersCount} fulfilled`,
            isPositive: true,
            icon: ShoppingBag,
            iconBg: "bg-blue-50 text-blue-700 border-blue-100",
          },
          {
            title: "Pending Orders",
            value: `${data.metrics.pendingOrdersCount} Orders`,
            change:
              data.metrics.pendingOrdersCount > 0
                ? "Requires action"
                : "All caught up",
            isPositive: data.metrics.pendingOrdersCount === 0,
            icon: Clock,
            iconBg: "bg-amber-50 text-amber-700 border-amber-100",
          },
          {
            title: "Low & Out of Stock",
            value: `${data.metrics.lowStockCount + data.metrics.outOfStockCount} Items`,
            change:
              data.metrics.totalListedProductsCount === 0
                ? "No products listed yet"
                : data.metrics.lowStockCount + data.metrics.outOfStockCount === 0
                ? "All listed stock healthy"
                : `${data.metrics.outOfStockCount} out of stock • ${data.metrics.lowStockCount} low (<10)`,
            isPositive:
              data.metrics.lowStockCount === 0 &&
              data.metrics.outOfStockCount === 0,
            icon: AlertTriangle,
            iconBg:
              data.metrics.outOfStockCount > 0
                ? "bg-red-50 text-red-700 border-red-100"
                : data.metrics.lowStockCount > 0
                ? "bg-amber-50 text-amber-700 border-amber-100"
                : "bg-emerald-50 text-[#0F5D3A] border-emerald-100",
            href: "/inventory",
          },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          const cardContent = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  {stat.title}
                </span>
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border ${stat.iconBg}`}
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-[#17231D]">
                  {stat.value}
                </span>
                <p className="text-xs font-semibold text-gray-500 mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      stat.isPositive ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span>{stat.change}</span>
                </p>
              </div>
            </>
          );

          if ("href" in stat && stat.href) {
            return (
              <Link
                key={idx}
                href={stat.href}
                aria-label={`${stat.title} — Open Inventory`}
                className="bg-white border border-gray-200/80 hover:border-[#22A06B] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div
              key={idx}
              className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* Main Grid: Orders Management Preview + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col (2 spans): Order Management Table */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h3 className="font-black text-base sm:text-lg text-[#17231D] flex items-center gap-2">
                Recent Orders{" "}
                <span className="bg-emerald-100 text-[#0F5D3A] text-xs font-black px-2 py-0.5 rounded-full">
                  Live
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Incoming grocery and fresh produce customer orders from Supabase
              </p>
            </div>
            <div className="relative flex items-center">
              <Search
                size={14}
                className="absolute left-3 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Filter by ID, customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-56 text-xs bg-[#F8FAF6] border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-gray-800 focus:outline-none focus:border-[#22A06B]"
              />
            </div>
          </div>

          {/* Order List / Table */}
          <div className="overflow-x-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
                  <PackageOpen size={26} strokeWidth={1.75} />
                </div>
                <h4 className="text-sm font-bold text-gray-800">
                  {searchTerm
                    ? "No orders matching search filter"
                    : "No customer orders received yet"}
                </h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  {searchTerm
                    ? "Try clearing the search term to view all orders."
                    : `When customers nearby in Renukoot place orders at ${data.shop.name}, they will appear here in real time.`}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Order ID</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Items Summary</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50/80 transition-colors"
                    >
                      <td className="py-3 px-3 font-extrabold text-[#0F5D3A]">
                        {order.displayId}
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-900">
                        {order.customerName}
                        <span className="block text-[10px] text-gray-400 font-normal">
                          {order.timeAgo}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-600 max-w-[200px] truncate">
                        {order.itemsSummary}
                      </td>
                      <td className="py-3 px-3 font-black text-gray-900">
                        ₹{order.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-block bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Col: Quick Actions & Live Store Info */}
        <div className="space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-black text-base text-[#17231D]">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/products"
                className="p-3 bg-emerald-50/70 border border-emerald-100 hover:bg-emerald-100/70 rounded-xl text-left transition-colors group block focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-[#0F5D3A] flex items-center justify-center mb-2">
                  <Plus size={18} strokeWidth={2.2} />
                </div>
                <span className="text-xs font-extrabold text-[#0F5D3A] group-hover:underline block">
                  Add Product
                </span>
                <span className="text-[10px] text-gray-500 block">
                  Manage catalog
                </span>
              </Link>
              <Link
                href="/inventory"
                className="p-3 bg-blue-50/70 border border-blue-100 hover:bg-blue-100/70 rounded-xl text-left transition-colors group block focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center mb-2">
                  <Boxes size={18} strokeWidth={2} />
                </div>
                <span className="text-xs font-extrabold text-blue-900 group-hover:underline block">
                  Inventory
                </span>
                <span className="text-[10px] text-gray-500 block">
                  Stock & pricing
                </span>
              </Link>
              <Link
                href="/orders"
                className="p-3 bg-purple-50/70 border border-purple-100 hover:bg-purple-100/70 rounded-xl text-left transition-colors group block focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center mb-2">
                  <ClipboardList size={18} strokeWidth={2} />
                </div>
                <span className="text-xs font-extrabold text-purple-900 group-hover:underline block">
                  View Orders
                </span>
                <span className="text-[10px] text-gray-500 block">
                  All active orders
                </span>
              </Link>
              <Link
                href="/shop"
                className="p-3 bg-amber-50/70 border border-amber-100 hover:bg-amber-100/70 rounded-xl text-left transition-colors group block focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center mb-2">
                  <Store size={18} strokeWidth={2} />
                </div>
                <span className="text-xs font-extrabold text-amber-900 group-hover:underline block">
                  Shop Profile
                </span>
                <span className="text-[10px] text-gray-500 block">
                  Store details
                </span>
              </Link>
            </div>
          </div>

          {/* Delivery Partner Assigned Box */}
          <div className="bg-[#F8FAF6] border border-gray-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[#0F5D3A] uppercase tracking-wider flex items-center gap-1.5">
                <Truck size={15} strokeWidth={2} />
                <span>Assigned Delivery Partner</span>
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  data.assignedRider
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-gray-300"
                }`}
              />
            </div>

            {data.assignedRider ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0F5D3A] text-white flex items-center justify-center font-bold text-sm">
                  {data.assignedRider.fullName
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-gray-900">
                    {data.assignedRider.fullName}
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Order {data.assignedRider.orderDisplayId} •{" "}
                    {data.assignedRider.vehicleType} (
                    {data.assignedRider.vehicleNumber})
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-2 text-left space-y-1">
                <p className="text-xs font-bold text-gray-700">
                  No delivery partner assigned yet
                </p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Riders are automatically assigned when orders reach
                  READY_FOR_PICKUP.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Management Preview Grid */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="font-black text-base sm:text-lg text-[#17231D]">
              Storefront Inventory
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Products currently stocked in {data.shop.name}
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-bold text-[#0F5D3A] hover:text-[#22A06B] transition-colors flex items-center gap-1 focus:outline-none focus:underline"
          >
            <span>Manage All Products</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {(data.featuredProducts || []).length === 0 ? (
          <div className="py-12 text-center space-y-3 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
              <PackageOpen size={26} strokeWidth={1.75} />
            </div>
            <h4 className="text-sm font-bold text-gray-800">
              No products listed in your shop catalog yet
            </h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Add grocery and daily essential items with local pricing and
              available stock so customers can purchase from {data.shop.name}.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-xs font-bold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>Add Your First Product</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.featuredProducts.map((prod) => (
              <div
                key={prod.id}
                className="border border-gray-100 rounded-xl p-4 flex flex-col justify-between bg-gray-50/50 hover:bg-white hover:border-emerald-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0F5D3A] flex items-center justify-center">
                    <Package size={20} strokeWidth={1.75} />
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      prod.isAvailable
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {prod.isAvailable ? "In Stock" : "Out of Stock"}
                  </span>
                </div>

                <div className="mt-3">
                  <h4 className="font-black text-sm text-[#17231D] truncate">
                    {prod.name}
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium block">
                    {prod.categoryName}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-[#0F5D3A]">
                      ₹{prod.price} / {prod.unit}
                    </span>
                    <span className="text-[10px] text-gray-400 block">
                      {prod.stock} units left
                    </span>
                  </div>
                  <Link
                    href="/inventory"
                    className="text-xs font-bold text-gray-600 hover:text-[#0F5D3A] border border-gray-200 hover:border-[#0F5D3A] px-2.5 py-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F5D3A]"
                  >
                    Update
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ShopLayoutShell>
  );
}
