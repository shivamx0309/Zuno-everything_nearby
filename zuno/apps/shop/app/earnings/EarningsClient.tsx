"use client";

import React, { useState } from "react";
import {
  IndianRupee,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Wallet,
  RefreshCw,
  Info,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import {
  TransactionSummary,
  getShopEarningsAction,
} from "../../features/earnings/api";

export default function EarningsClient({
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
    pendingCount: number;
    metrics: {
      grossMerchandiseRevenue: number;
      todayMerchandiseRevenue: number;
      deliveredMerchandiseValue: number;
      totalDeliveryFees: number;
      completedOrdersCount: number;
      averageOrderValue: number;
    };
    settlementSupported: boolean;
    transactions: TransactionSummary[];
    error?: string;
  };
}) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);

  const refreshEarnings = async () => {
    try {
      setRefreshing(true);
      const refreshed = await getShopEarningsAction();
      setData(refreshed);
    } catch (err: any) {
      alert(err?.message || "Failed to refresh earnings.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Merchandise Sales & Order Ledger"
      subtitle={`Order merchandise subtotals and payment records for ${data.shop.name}`}
      actions={
        <button
          onClick={refreshEarnings}
          disabled={refreshing}
          title="Refresh earnings"
          aria-label="Refresh earnings"
          className="p-2 text-gray-600 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
        >
          <RefreshCw
            size={18}
            className={refreshing ? "animate-spin text-[#0F5D3A]" : ""}
          />
        </button>
      }
    >
      {/* Honest Disclosure: Commission / Payout / Refund schema not yet modeled */}
      {!data.settlementSupported && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <Info size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold block">
              Payouts, Commissions &amp; Refunds Ledger Not Yet Supported
            </span>
            <span className="text-amber-800/90 leading-relaxed">
              Figures below reflect gross merchandise order subtotals (excluding customer delivery fees: ₹
              {data.metrics.totalDeliveryFees.toLocaleString("en-IN")}). Platform commissions, refunds, and bank payout settlements will appear once settlement tracking is added.
            </span>
          </div>
        </div>
      )}

      {data.error ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-3"
        >
          <h3 className="text-sm font-extrabold text-red-900">
            Could Not Load Merchandise Earnings
          </h3>
          <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
            {data.error}
          </p>
          <button
            type="button"
            onClick={refreshEarnings}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>{refreshing ? "Retrying..." : "Retry Loading Earnings"}</span>
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Merchandise Sales (Gross)
                </span>
                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0F5D3A] flex items-center justify-center">
                  <IndianRupee size={16} strokeWidth={2} />
                </span>
              </div>
              <span className="text-2xl font-black text-[#17231D] mt-3 block">
                ₹{data.metrics.grossMerchandiseRevenue.toLocaleString("en-IN")}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                Excludes ₹{data.metrics.totalDeliveryFees.toLocaleString("en-IN")} delivery fees
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Today&apos;s Merchandise Sales
                </span>
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Calendar size={16} strokeWidth={2} />
                </span>
              </div>
              <span className="text-2xl font-black text-blue-600 mt-3 block">
                ₹{data.metrics.todayMerchandiseRevenue.toLocaleString("en-IN")}
              </span>
              <p className="text-xs text-gray-400 mt-1">Active orders today (excl. delivery)</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Delivered Order Value
                </span>
                <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <CheckCircle2 size={16} strokeWidth={2} />
                </span>
              </div>
              <span className="text-2xl font-black text-purple-600 mt-3 block">
                ₹{data.metrics.deliveredMerchandiseValue.toLocaleString("en-IN")}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                {data.metrics.completedOrdersCount} delivered orders (pre-commission)
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Avg Merchandise Order
                </span>
                <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <TrendingUp size={16} strokeWidth={2} />
                </span>
              </div>
              <span className="text-2xl font-black text-amber-600 mt-3 block">
                ₹{data.metrics.averageOrderValue.toLocaleString("en-IN")}
              </span>
              <p className="text-xs text-gray-400 mt-1">Per delivered order</p>
            </div>
          </div>

          {/* Transaction Ledger Table */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-black text-base text-[#17231D]">Order Merchandise Ledger</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Historical order subtotals separated from customer delivery fees
                </p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                Total {data.transactions.length} records
              </span>
            </div>

            {data.transactions.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
                  <Wallet size={26} strokeWidth={1.75} />
                </div>
                <h4 className="text-sm font-bold text-gray-800">No transactions recorded yet</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Customer orders for your shop will appear here with merchandise subtotals.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Date &amp; Time</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Payment</th>
                      <th className="py-3 px-3">Order Status</th>
                      <th className="py-3 px-3 text-right">Delivery Fee</th>
                      <th className="py-3 px-3 text-right">Merchandise Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3 px-3 font-black text-[#0F5D3A]">{tx.displayId}</td>
                        <td className="py-3 px-3 text-gray-500">
                          {new Date(tx.createdAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-3 font-semibold text-gray-800">{tx.customerName}</td>
                        <td className="py-3 px-3 font-bold text-gray-700 uppercase">
                          {tx.paymentMethod} • {tx.paymentStatus}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              tx.status === "DELIVERED"
                                ? "bg-emerald-100 text-emerald-800"
                                : tx.status === "CANCELLED" || tx.status === "REJECTED"
                                ? "bg-red-100 text-red-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-gray-500">
                          ₹{tx.deliveryFee.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-gray-900">
                          ₹{tx.merchandiseSubtotal.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </ShopLayoutShell>
  );
}
