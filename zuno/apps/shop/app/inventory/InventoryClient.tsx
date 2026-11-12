"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Plus,
  RefreshCw,
  Search,
  PackageOpen,
  AlertCircle,
  Pencil,
  Check,
  X,
  CheckCircle2,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import {
  InventoryItem,
  getShopInventoryAction,
  updateProductStockAction,
} from "../../features/inventory/api";
import {
  parseStockQuantityInput,
  recalculateInventoryKpis,
} from "../../lib/inventory-utils";

export default function InventoryClient({
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
    items: InventoryItem[];
    lowStockCount: number;
    outOfStockCount: number;
    error?: string;
  };
}) {
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [exactQuantityInput, setExactQuantityInput] = useState<string>("");
  const [inputValidationError, setInputValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(
    initialData.error ? { type: "error", text: initialData.error } : null
  );

  const refreshInventory = async () => {
    try {
      setRefreshing(true);
      const refreshed = await getShopInventoryAction();
      setData(refreshed);
      if (refreshed.error) {
        setFeedback({ type: "error", text: refreshed.error });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to refresh inventory.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const commitStockUpdate = async (
    item: InventoryItem,
    targetStock: number,
    closeEditorAfter = false
  ) => {
    if (updatingId) return;
    const previousSnapshot = data;
    setUpdatingId(item.id);
    setFeedback(null);
    setInputValidationError(null);

    try {
      const res = await updateProductStockAction(
        item.id,
        targetStock,
        item.stock
      );

      setData((prev) => {
        const updatedItems = prev.items.map((it) =>
          it.id === item.id
            ? {
                ...it,
                stock: res.newStock,
                isAvailable: res.newStock > 0,
                status: res.status,
              }
            : it
        );
        const nextKpis = recalculateInventoryKpis(updatedItems);
        return {
          ...prev,
          items: updatedItems,
          lowStockCount: nextKpis.lowStockCount,
          outOfStockCount: nextKpis.outOfStockCount,
        };
      });

      if (closeEditorAfter) {
        setEditingItemId(null);
        setExactQuantityInput("");
      }

      setFeedback({
        type: "success",
        text: `Updated "${item.name}" stock to ${res.newStock} ${item.unit}.`,
      });
    } catch (err: any) {
      setData(previousSnapshot);
      const msg = err?.message || "Failed to update stock.";
      if (closeEditorAfter) {
        setInputValidationError(msg);
      }
      setFeedback({ type: "error", text: msg });
      if (msg.toLowerCase().includes("concurrently")) {
        await refreshInventory();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAdjustStock = async (item: InventoryItem, delta: number) => {
    const newStock = Math.max(0, item.stock + delta);
    await commitStockUpdate(item, newStock, false);
  };

  const handleStartExactEdit = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setExactQuantityInput(String(item.stock));
    setInputValidationError(null);
  };

  const handleCancelExactEdit = () => {
    if (updatingId) return;
    setEditingItemId(null);
    setExactQuantityInput("");
    setInputValidationError(null);
  };

  const handleSaveExactEdit = async (item: InventoryItem) => {
    const parsed = parseStockQuantityInput(exactQuantityInput);
    if (!parsed.valid) {
      setInputValidationError(parsed.error);
      return;
    }
    await commitStockUpdate(item, parsed.stock, true);
  };

  const filteredItems = data.items.filter((item) => {
    const matchesFilter =
      selectedFilter === "ALL" || item.status === selectedFilter;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Inventory Control"
      subtitle={`Live stock levels and unit availability for ${data.shop.name}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/products"
            className="px-3.5 py-1.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
          >
            <Plus size={15} strokeWidth={2.2} />
            <span className="hidden sm:inline">Add Product</span>
          </Link>
          <button
            onClick={refreshInventory}
            disabled={refreshing}
            title="Refresh stock levels"
            aria-label="Refresh stock levels"
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
              Total Stocked Items
            </span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0F5D3A] flex items-center justify-center">
              <Boxes size={17} strokeWidth={2} />
            </span>
          </div>
          <span className="text-2xl font-black text-[#17231D] mt-2 block">
            {data.items.length} Products
          </span>
          <p className="text-xs text-gray-400 mt-1">Listed in your store</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
              Low Stock Alerts
            </span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <AlertCircle size={17} strokeWidth={2} />
            </span>
          </div>
          <span className="text-2xl font-black text-amber-600 mt-2 block">
            {data.lowStockCount} Items
          </span>
          <p className="text-xs text-gray-400 mt-1">Under 10 units remaining</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider block">
              Out of Stock
            </span>
            <span className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
              <X size={17} strokeWidth={2} />
            </span>
          </div>
          <span className="text-2xl font-black text-red-600 mt-2 block">
            {data.outOfStockCount} Items
          </span>
          <p className="text-xs text-gray-400 mt-1">Unavailable for ordering</p>
        </div>
      </div>

      {/* Filter Tabs and Search */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "ALL", label: `All Items (${data.items.length})` },
            { id: "LOW_STOCK", label: `Low Stock (${data.lowStockCount})` },
            { id: "OUT_OF_STOCK", label: `Out of Stock (${data.outOfStockCount})` },
            { id: "HEALTHY", label: "In Stock" },
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
            placeholder="Search inventory items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 text-xs bg-[#F8FAF6] border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-gray-800 focus:outline-none focus:border-[#22A06B]"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
              <PackageOpen size={26} strokeWidth={1.75} />
            </div>
            <h3 className="text-base font-bold text-gray-800">
              No inventory items matching this filter
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Add products to your catalog to track stock units and availability.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-400 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Stock Level</th>
                  <th className="py-3 px-4">Stock Status</th>
                  <th className="py-3 px-4 text-right">Quick Stock Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item) => {
                  const isUpdating = updatingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {item.name}
                      </td>
                      <td className="py-3.5 px-4 text-gray-500">
                        {item.categoryName}
                      </td>
                      <td className="py-3.5 px-4 font-black text-[#0F5D3A]">
                        ₹{item.price} / {item.unit}
                      </td>
                      <td className="py-3.5 px-4 font-black text-gray-900">
                        {item.stock} {item.unit}s
                      </td>
                      <td className="py-3.5 px-4">
                        {item.status === "OUT_OF_STOCK" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">
                            Out of Stock
                          </span>
                        )}
                        {item.status === "LOW_STOCK" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                            Low Stock ({item.stock} left)
                          </span>
                        )}
                        {item.status === "HEALTHY" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Healthy Stock
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {editingItemId === item.id ? (
                          <div className="inline-flex flex-col items-end gap-1">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handleSaveExactEdit(item);
                              }}
                              className="inline-flex items-center gap-1.5"
                            >
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                aria-label={`Exact stock quantity for ${item.name}`}
                                value={exactQuantityInput}
                                onChange={(e) => {
                                  setExactQuantityInput(e.target.value);
                                  if (inputValidationError) setInputValidationError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    handleCancelExactEdit();
                                  }
                                }}
                                disabled={isUpdating}
                                className="w-20 bg-[#F8FAF6] border border-[#22A06B] rounded-lg px-2 py-1 text-xs font-black text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
                                autoFocus
                              />
                              <button
                                type="submit"
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                              >
                                <Check size={12} />
                                <span>{isUpdating ? "Saving..." : "Save"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelExactEdit}
                                disabled={isUpdating}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </form>
                            {inputValidationError && (
                              <span className="text-[11px] font-semibold text-red-600">
                                {inputValidationError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                            <div className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1">
                              <button
                                type="button"
                                onClick={() => handleAdjustStock(item, -5)}
                                disabled={isUpdating || Boolean(updatingId) || item.stock === 0}
                                title="Decrease by 5"
                                className="px-2 py-0.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold shadow-2xs transition disabled:opacity-40"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustStock(item, -1)}
                                disabled={isUpdating || Boolean(updatingId) || item.stock === 0}
                                title="Decrease by 1"
                                className="px-2 py-0.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold shadow-2xs transition disabled:opacity-40"
                              >
                                -1
                              </button>
                              <span className="px-2 font-black text-gray-900 min-w-[28px] text-center">
                                {isUpdating ? "..." : item.stock}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustStock(item, 1)}
                                disabled={isUpdating || Boolean(updatingId)}
                                title="Increase by 1"
                                className="px-2 py-0.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold shadow-2xs transition disabled:opacity-40"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustStock(item, 10)}
                                disabled={isUpdating || Boolean(updatingId)}
                                title="Increase by 10"
                                className="px-2 py-0.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-lg text-xs font-bold shadow-2xs transition disabled:opacity-40"
                              >
                                +10
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartExactEdit(item)}
                              disabled={Boolean(updatingId)}
                              aria-label={`Set exact stock for ${item.name}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 hover:border-[#0F5D3A] hover:text-[#0F5D3A] text-gray-700 rounded-xl text-xs font-bold transition disabled:opacity-40"
                            >
                              <Pencil size={12} />
                              <span>Set Qty</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ShopLayoutShell>
  );
}
