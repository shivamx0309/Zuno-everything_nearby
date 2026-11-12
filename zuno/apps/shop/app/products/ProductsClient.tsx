"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Package,
  PackageOpen,
  Check,
  CheckCircle2,
  Clock,
  X,
  Pencil,
  Trash2,
  Sparkles,
  Layers,
  Apple,
  Carrot,
  Milk,
  Wheat,
  Cookie,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import ConfirmActionDialog from "../../components/ConfirmActionDialog";
import {
  ShopProductItem,
  CatalogProductItem,
  CategoryItem,
  ProductRequestItem,
  ShopIdentityWithCategory,
  getShopProductsAction,
  getShopProductRequestsAction,
  searchCatalogProductsAction,
  addCatalogProductToShopAction,
  updateShopProductAction,
  toggleProductAvailabilityAction,
  submitProductRequestAction,
  removeShopProductAction,
} from "../../features/products/api";
import {
  hasExistingListingPrice,
  resolveCatalogListingDefaults,
} from "../../lib/catalog-listing-defaults";

function CategoryIcon({ categoryName, className = "w-5 h-5" }: { categoryName?: string; className?: string }) {
  const cat = (categoryName || "").toLowerCase();
  if (cat.includes("vegetable") || cat.includes("leafy") || cat.includes("root")) {
    return <Carrot className={className} />;
  }
  if (cat.includes("fruit")) {
    return <Apple className={className} />;
  }
  if (cat.includes("dairy") || cat.includes("milk")) {
    return <Milk className={className} />;
  }
  if (cat.includes("grocery") || cat.includes("flour") || cat.includes("grain")) {
    return <Wheat className={className} />;
  }
  if (cat.includes("snack") || cat.includes("biscuit")) {
    return <Cookie className={className} />;
  }
  return <Package className={className} />;
}

export default function ProductsClient({
  initialData,
}: {
  initialData: {
    shop: ShopIdentityWithCategory;
    pendingCount: number;
    categories: CategoryItem[];
    shopProducts: ShopProductItem[];
    catalogProducts: CatalogProductItem[];
    productRequests: ProductRequestItem[];
    productRequestsError?: string;
  };
}) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<"LISTINGS" | "REQUESTS">("LISTINGS");
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedFilterCategory, setSelectedFilterCategory] = useState("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Remove listing confirmation dialog state
  const [removeTarget, setRemoveTarget] = useState<ShopProductItem | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Catalog search & suggestion state
  const [catalogSearch, setCatalogSearch] = useState("");
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<string>(
    initialData.shop.detectedCategory?.id || "ALL"
  );
  const [catalogResults, setCatalogResults] = useState<CatalogProductItem[]>(initialData.catalogProducts);
  const [broaderResults, setBroaderResults] = useState<CatalogProductItem[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);

  // Selected product listing drawer state
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<CatalogProductItem | null>(null);
  const [sellingPrice, setSellingPrice] = useState<number>(50);
  const [openingStock, setOpeningStock] = useState<number>(20);
  const [isSavingListing, setIsSavingListing] = useState(false);
  const [listingSuccessMsg, setListingSuccessMsg] = useState<string | null>(null);

  // Request new product state
  const [reqName, setReqName] = useState("");
  const [reqCategoryId, setReqCategoryId] = useState(initialData.shop.detectedCategory?.id || "");
  const [reqUnit, setReqUnit] = useState("kg");
  const [reqBrand, setReqBrand] = useState("");
  const [reqPrice, setReqPrice] = useState<number>(50);
  const [reqImageUrl, setReqImageUrl] = useState("");
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [reqFeedback, setReqFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Editing existing listed product
  const [editingProduct, setEditingProduct] = useState<ShopProductItem | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [, startTransition] = useTransition();

  // Refresh data from server
  const refreshProducts = async () => {
    try {
      setRefreshing(true);
      const refreshed = await getShopProductsAction();
      setData(refreshed);
      setCatalogResults(refreshed.catalogProducts);
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to refresh products.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshRequestsOnly = async () => {
    try {
      setRequestsLoading(true);
      const res = await getShopProductRequestsAction();
      setData((prev) => ({
        ...prev,
        productRequests: res.requests,
        productRequestsError: res.error,
      }));
    } catch (err: any) {
      setData((prev) => ({
        ...prev,
        productRequestsError:
          err?.message || "Failed to load product requests.",
      }));
    } finally {
      setRequestsLoading(false);
    }
  };

  // Debounced search inside catalog modal
  useEffect(() => {
    if (!isAddModalOpen) return;

    const timer = setTimeout(async () => {
      setIsSearchingCatalog(true);
      try {
        const res = await searchCatalogProductsAction(catalogSearch, activeCatalogCategory);
        setCatalogResults(res.exactMatches);
        setBroaderResults(res.broaderMatches);
      } catch (err) {
        console.error("Search catalog error:", err);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [catalogSearch, activeCatalogCategory, isAddModalOpen]);

  // Open "Request Product" modal pre-filled with search term
  const handleOpenRequestModal = (initialName?: string) => {
    setReqName(initialName || catalogSearch || "");
    setReqCategoryId(
      activeCatalogCategory !== "ALL"
        ? activeCatalogCategory
        : data.shop.detectedCategory?.id || data.categories[0]?.id || ""
    );
    setReqUnit("kg");
    setReqBrand("");
    setReqPrice(50);
    setReqImageUrl("");
    setReqFeedback(null);
    setIsRequestModalOpen(true);
  };

  // Handle adding product to shop
  const handleConfirmAddListing = async () => {
    if (!selectedCatalogProduct || isSavingListing) return;
    setIsSavingListing(true);
    setListingSuccessMsg(null);
    setFeedback(null);
    try {
      const res = await addCatalogProductToShopAction(
        selectedCatalogProduct.id,
        Number(sellingPrice),
        Number(openingStock)
      );
      setListingSuccessMsg(res.message);
      await refreshProducts();
      setTimeout(() => {
        setSelectedCatalogProduct(null);
        setListingSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to add product to storefront.",
      });
    } finally {
      setIsSavingListing(false);
    }
  };

  // Handle submitting new product request
  const handleSubmitProductRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqName.trim()) {
      setReqFeedback({ type: "error", message: "Please enter product name." });
      return;
    }
    setIsSubmittingReq(true);
    setReqFeedback(null);
    try {
      const res = await submitProductRequestAction({
        productName: reqName.trim(),
        categoryId: reqCategoryId,
        unit: reqUnit.trim(),
        suggestedPrice: Number(reqPrice),
        brand: reqBrand.trim(),
        imageUrl: reqImageUrl.trim() || undefined,
      });

      if (res.success) {
        setReqFeedback({ type: "success", message: res.message });
        await refreshRequestsOnly();
        setTimeout(() => {
          setIsRequestModalOpen(false);
          setReqFeedback(null);
        }, 1400);
      } else {
        setReqFeedback({ type: "error", message: res.message });
      }
    } catch (err: any) {
      setReqFeedback({ type: "error", message: err?.message || "Failed to submit request." });
    } finally {
      setIsSubmittingReq(false);
    }
  };

  // Handle saving edit to existing shop product
  const handleSaveEdit = async () => {
    if (!editingProduct || isSavingEdit) return;
    setIsSavingEdit(true);
    setFeedback(null);
    try {
      await updateShopProductAction(editingProduct.id, editPrice, editStock);
      const updatedName = editingProduct.name;
      setEditingProduct(null);
      await refreshProducts();
      setFeedback({
        type: "success",
        text: `Updated listing for "${updatedName}".`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to update product.",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle toggling stock availability
  const handleToggleAvailability = async (item: ShopProductItem) => {
    setTogglingId(item.id);
    setFeedback(null);
    try {
      await toggleProductAvailabilityAction(item.id, !item.isAvailable);
      await refreshProducts();
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to update availability.",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Handle removing product from storefront (with confirmation)
  const handleConfirmRemoveListing = async () => {
    if (!removeTarget || isRemoving) return;
    setIsRemoving(true);
    setRemoveError(null);
    setFeedback(null);
    try {
      const res = await removeShopProductAction(removeTarget.id);
      setRemoveTarget(null);
      setEditingProduct(null);
      await refreshProducts();
      setFeedback({
        type: "success",
        text: res.message,
      });
    } catch (err: any) {
      setRemoveError(
        err?.message || "Failed to remove product from your storefront."
      );
    } finally {
      setIsRemoving(false);
    }
  };

  // Filter storefront items
  const distinctStorefrontCategories = Array.from(
    new Set(data.shopProducts.map((p) => p.categoryName).filter(Boolean))
  );

  const filteredStorefrontProducts = data.shopProducts.filter((p) => {
    const matchesCategory =
      selectedFilterCategory === "ALL" || p.categoryName === selectedFilterCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      p.categoryName.toLowerCase().includes(inventorySearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const shopCatName = data.shop.detectedCategory?.name || "Grocery";

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Product Catalog & Storefront"
      subtitle={`Manage items available for customer orders in ${data.shop.name} (${shopCatName})`}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setCatalogSearch("");
              setActiveCatalogCategory(data.shop.detectedCategory?.id || "ALL");
              setSelectedCatalogProduct(null);
            }}
            className="px-3.5 py-1.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
          >
            <Plus size={15} strokeWidth={2.2} />
            <span>Add Product</span>
          </button>
          <button
            onClick={refreshProducts}
            disabled={refreshing}
            title="Refresh product list"
            aria-label="Refresh product list"
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

      {/* Primary Section Tabs: Storefront Listings vs Product Requests */}
      <div className="bg-white border border-gray-200 rounded-2xl p-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2" role="tablist" aria-label="Catalog workspace tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "LISTINGS"}
            onClick={() => setActiveTab("LISTINGS")}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition ${
              activeTab === "LISTINGS"
                ? "bg-[#0F5D3A] text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            My Storefront ({data.shopProducts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "REQUESTS"}
            onClick={() => setActiveTab("REQUESTS")}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 ${
              activeTab === "REQUESTS"
                ? "bg-[#0F5D3A] text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Clock size={13} />
            <span>Product Requests ({data.productRequests.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleOpenRequestModal("")}
          className="px-3.5 py-2 text-xs font-bold text-[#0F5D3A] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          <span>Request Missing Product</span>
        </button>
      </div>

      {activeTab === "REQUESTS" ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-black text-base text-[#17231D]">
                Submitted Catalog Requests
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Track approval status for products you requested for {data.shop.name}.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshRequestsOnly}
              disabled={requestsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={requestsLoading ? "animate-spin text-[#0F5D3A]" : ""}
              />
              <span>{requestsLoading ? "Refreshing..." : "Refresh Status"}</span>
            </button>
          </div>

          {requestsLoading ? (
            <div className="py-12 text-center space-y-2 text-gray-500">
              <RefreshCw size={22} className="animate-spin mx-auto text-[#0F5D3A]" />
              <p className="text-xs font-bold">Loading your product requests...</p>
            </div>
          ) : data.productRequestsError ? (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-3"
            >
              <h4 className="text-sm font-extrabold text-red-900">
                Could Not Load Product Requests
              </h4>
              <p className="text-xs text-red-700 max-w-md mx-auto">
                {data.productRequestsError}
              </p>
              <button
                type="button"
                onClick={refreshRequestsOnly}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition"
              >
                <RefreshCw size={13} />
                <span>Retry</span>
              </button>
            </div>
          ) : data.productRequests.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
                <PackageOpen size={24} strokeWidth={1.75} />
              </div>
              <h4 className="text-sm font-bold text-gray-800">
                No product requests submitted yet
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                If an item is missing from the shared ZUNO catalog, submit a request and track its approval status right here.
              </p>
              <button
                type="button"
                onClick={() => handleOpenRequestModal("")}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                <Plus size={14} />
                <span>Submit Product Request</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.productRequests.map((req) => (
                <div
                  key={req.id}
                  className="border border-gray-200 rounded-2xl p-4 bg-[#F8FAF6]/60 space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-black text-sm text-[#17231D]">
                        {req.productName}
                        {req.brand ? (
                          <span className="text-xs font-semibold text-gray-500 ml-1.5">
                            ({req.brand})
                          </span>
                        ) : null}
                      </h4>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        {req.categoryName} • Unit: {req.unit}
                        {req.suggestedPrice !== null && req.suggestedPrice !== undefined
                          ? ` • Suggested ₹${req.suggestedPrice}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-gray-400 font-medium">
                        {new Date(req.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          req.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : req.status === "REJECTED"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-amber-100 text-amber-800 border-amber-200"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                  </div>

                  {req.status === "REJECTED" && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                      <span className="font-extrabold">Rejection Reason: </span>
                      <span>
                        {req.rejectionReason ||
                          "No reason specified by catalog administrator."}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Category Pills & Inventory Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedFilterCategory("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedFilterCategory === "ALL"
                ? "bg-[#0F5D3A] text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Items ({data.shopProducts.length})
          </button>
          {distinctStorefrontCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedFilterCategory === cat
                  ? "bg-[#0F5D3A] text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search your listed products..."
            value={inventorySearch}
            onChange={(e) => setInventorySearch(e.target.value)}
            className="w-full md:w-64 text-xs bg-[#F8FAF6] border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-gray-800 focus:outline-none focus:border-[#22A06B]"
          />
        </div>
      </div>

      {/* Storefront Products Grid */}
      {filteredStorefrontProducts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
            <PackageOpen size={26} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-800">
              {inventorySearch || selectedFilterCategory !== "ALL"
                ? "No products matching your search filter"
                : `No products listed in ${data.shop.name} yet`}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              {inventorySearch || selectedFilterCategory !== "ALL"
                ? "Try clearing or adjusting your search keyword."
                : `Choose suggested ${shopCatName} products from the central catalog to start selling in Renukoot.`}
            </p>
          </div>
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setCatalogSearch("");
              setActiveCatalogCategory(data.shop.detectedCategory?.id || "ALL");
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Plus size={14} strokeWidth={2.2} />
            <span>Add Suggested Products</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredStorefrontProducts.map((prod) => (
            <div
              key={prod.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#0F5D3A] flex items-center justify-center overflow-hidden shrink-0 border border-emerald-100">
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <CategoryIcon categoryName={prod.categoryName} className="w-5 h-5 text-[#0F5D3A]" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      prod.isAvailable
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-red-100 text-red-800 border border-red-200"
                    }`}
                  >
                    {prod.isAvailable ? "In Stock" : "Out of Stock"}
                  </span>
                  <button
                    onClick={() => handleToggleAvailability(prod)}
                    disabled={togglingId === prod.id}
                    title={prod.isAvailable ? "Set out of stock" : "Set in stock"}
                    className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors focus:outline-none ${
                      prod.isAvailable ? "bg-[#22A06B]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        prod.isAvailable ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <h4 className="font-black text-sm text-[#17231D] truncate">
                  {prod.name}
                </h4>
                <p className="text-[11px] text-gray-500 font-medium">
                  {prod.categoryName} • Unit: {prod.unit}
                </p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-base font-black text-[#0F5D3A]">
                    ₹{prod.price}
                  </span>
                  <span className="text-[10px] text-gray-400 block">
                    Stock: {prod.stock} {prod.unit}s
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(prod);
                      setEditPrice(prod.price);
                      setEditStock(prod.stock);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveError(null);
                      setRemoveTarget(prod);
                    }}
                    aria-label={`Remove ${prod.name} from storefront`}
                    title="Remove from storefront"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition"
                  >
                    <Trash2 size={12} />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-[#17231D]">
                  Edit Product
                </h3>
                <p className="text-xs text-gray-500">{editingProduct.name}</p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Selling Price per {editingProduct.unit} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editPrice}
                  onChange={(e) => setEditPrice(Number(e.target.value))}
                  className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Available Quantity ({editingProduct.unit}s)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editStock}
                  onChange={(e) => setEditStock(Number(e.target.value))}
                  className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  if (editingProduct) {
                    setRemoveError(null);
                    setRemoveTarget(editingProduct);
                  }
                }}
                disabled={isSavingEdit}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition disabled:opacity-50"
              >
                <Trash2 size={12} />
                <span>Remove from Storefront</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMART ADD PRODUCT CATALOG MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-3xl w-full h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#F8FAF6] border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg text-[#17231D]">
                    Add Product to Storefront
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-[#0F5D3A] px-2 py-0.5 rounded-md border border-emerald-200">
                    {shopCatName} Shop
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Search the shared ZUNO catalog or select suggested items for {data.shop.name}.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedCatalogProduct(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-200 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Smart Search & Category Filter Bar */}
            <div className="p-4 sm:p-6 border-b border-gray-100 space-y-3 shrink-0 bg-white">
              <div className="relative flex items-center">
                <Search size={16} className="absolute left-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search products by name, category, or unit (e.g. Milk, Atta, 1 kg)..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full text-xs sm:text-sm bg-[#F8FAF6] border border-gray-200 rounded-xl pl-10 pr-9 py-2.5 text-gray-800 focus:outline-none focus:border-[#22A06B] focus:ring-1 focus:ring-[#22A06B]"
                  autoFocus
                />
                {catalogSearch && (
                  <button
                    onClick={() => setCatalogSearch("")}
                    className="absolute right-3 text-gray-400 hover:text-gray-600"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Category Pills with "Suggested for your shop" first */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {/* 1. Shop's Registered Category Button */}
                {data.shop.detectedCategory && (
                  <button
                    onClick={() => setActiveCatalogCategory(data.shop.detectedCategory.id)}
                    className={`px-3 py-1.5 rounded-xl font-black transition flex items-center gap-1.5 whitespace-nowrap ${
                      activeCatalogCategory === data.shop.detectedCategory.id
                        ? "bg-[#0F5D3A] text-white shadow-sm ring-2 ring-[#A7D56B]/60"
                        : "bg-emerald-50 text-[#0F5D3A] border border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    <Sparkles size={13} className="text-[#A7D56B]" />
                    <span>Suggested for Your Shop ({data.shop.detectedCategory.name})</span>
                  </button>
                )}

                {/* 2. All Categories */}
                <button
                  onClick={() => setActiveCatalogCategory("ALL")}
                  className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                    activeCatalogCategory === "ALL"
                      ? "bg-gray-800 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  All Categories
                </button>

                {/* 3. Individual Categories */}
                {data.categories
                  .filter((c) => !c.parentId && c.id !== data.shop.detectedCategory?.id)
                  .map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCatalogCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                        activeCatalogCategory === cat.id
                          ? "bg-[#0F5D3A] text-white shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
              </div>
            </div>

            {/* Modal Content: Product Results / Selection Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {isSearchingCatalog ? (
                <div className="py-16 text-center text-gray-500 space-y-2">
                  <RefreshCw size={24} className="animate-spin mx-auto text-[#0F5D3A]" />
                  <p className="text-xs font-bold text-gray-600">Searching ZUNO central catalog...</p>
                </div>
              ) : catalogResults.length === 0 ? (
                <div className="space-y-4">
                  {/* NEVER DEAD END: Clear Explanation & Request New Product Callout */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center">
                      <HelpCircle size={26} strokeWidth={1.8} />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-gray-900">
                        {catalogSearch
                          ? `No catalog match found for "${catalogSearch}"`
                          : "No products currently available in this category"}
                      </h4>
                      <p className="text-xs text-gray-600 max-w-md mx-auto mt-1">
                        ZUNO maintains a single shared product catalog for all shops. If a product isn&apos;t registered yet, submit a quick request to have it added.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        onClick={() => handleOpenRequestModal(catalogSearch)}
                        className="w-full sm:w-auto px-5 py-2.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-xs font-extrabold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                      >
                        <Plus size={15} strokeWidth={2.2} />
                        <span>Request New Product</span>
                      </button>
                      {activeCatalogCategory !== "ALL" && (
                        <button
                          onClick={() => {
                            setActiveCatalogCategory("ALL");
                            setCatalogSearch("");
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition"
                        >
                          Browse All Categories
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Broader Matches / Suggestions */}
                  {broaderResults.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers size={13} />
                        <span>Related Products You Can Stock Instead:</span>
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {broaderResults.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              const defaults = resolveCatalogListingDefaults(p);
                              setSelectedCatalogProduct(p);
                              setSellingPrice(defaults.price);
                              setOpeningStock(defaults.stock);
                            }}
                            className={`p-3 rounded-2xl border text-left transition flex items-center justify-between text-xs ${
                              selectedCatalogProduct?.id === p.id
                                ? "border-[#0F5D3A] bg-emerald-50/50 ring-2 ring-[#0F5D3A]"
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                <CategoryIcon categoryName={p.categoryName} className="w-5 h-5 text-gray-600" />
                              </div>
                              <div>
                                <span className="font-black text-gray-900 block truncate">{p.name}</span>
                                <span className="text-[11px] text-gray-500 font-medium">
                                  {p.categoryName} • {p.unit}
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-bold text-[#0F5D3A]">Select →</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 pb-1">
                    <span className="font-bold">
                      {catalogSearch ? `Matching Products (${catalogResults.length})` : `Catalog Suggestions (${catalogResults.length})`}
                    </span>
                    <button
                      onClick={() => handleOpenRequestModal(catalogSearch)}
                      className="text-[#0F5D3A] font-bold hover:underline flex items-center gap-1"
                    >
                      <Plus size={13} />
                      <span>Missing an item? Request it</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {catalogResults.map((cp) => {
                      const isSelected = selectedCatalogProduct?.id === cp.id;
                      return (
                        <div
                          key={cp.id}
                          className={`p-3.5 rounded-2xl border transition flex flex-col justify-between space-y-3 ${
                            isSelected
                              ? "border-[#0F5D3A] bg-emerald-50/40 ring-2 ring-[#0F5D3A]"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl bg-[#F8FAF6] border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                              {cp.imageUrl ? (
                                <img
                                  src={cp.imageUrl}
                                  alt={cp.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <CategoryIcon categoryName={cp.categoryName} className="w-6 h-6 text-[#0F5D3A]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <h4 className="font-black text-xs sm:text-sm text-gray-900 truncate">
                                  {cp.name}
                                </h4>
                                {cp.isAlreadyListed && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black shrink-0">
                                    Listed
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 font-medium">
                                {cp.categoryName} • Unit: {cp.unit}
                              </p>
                              {cp.isAlreadyListed && hasExistingListingPrice(cp) && (
                                <p className="text-[10px] text-emerald-800 font-bold mt-0.5">
                                  Current price: ₹{cp.currentPrice} (Stock: {cp.currentStock ?? 0})
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400">
                              Central Catalog ID: {cp.id.slice(0, 8)}...
                            </span>
                            <button
                              onClick={() => {
                                const defaults = resolveCatalogListingDefaults(cp);
                                setSelectedCatalogProduct(cp);
                                setSellingPrice(defaults.price);
                                setOpeningStock(defaults.stock);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                                isSelected
                                  ? "bg-[#0F5D3A] text-white"
                                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check size={13} strokeWidth={2.5} />
                                  <span>Selected</span>
                                </>
                              ) : cp.isAlreadyListed ? (
                                <span>Edit Listing</span>
                              ) : (
                                <span>Select & List</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Product Listing Confirmation Drawer */}
            {selectedCatalogProduct && (
              <div className="p-4 sm:p-5 bg-[#F8FAF6] border-t border-gray-200 shrink-0 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0F5D3A]">
                      Confirm Storefront Listing
                    </span>
                    <h4 className="text-sm font-black text-gray-900">
                      {selectedCatalogProduct.name} ({selectedCatalogProduct.categoryName})
                    </h4>
                  </div>
                  {listingSuccessMsg && (
                    <div className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
                      <Check size={14} />
                      <span>{listingSuccessMsg}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Your Selling Price (₹ per {selectedCatalogProduct.unit})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(Number(e.target.value))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Available Stock Quantity ({selectedCatalogProduct.unit}s)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={openingStock}
                      onChange={(e) => setOpeningStock(Number(e.target.value))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200/60">
                  <button
                    onClick={() => setSelectedCatalogProduct(null)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAddListing}
                    disabled={isSavingListing}
                    className="px-5 py-2 text-xs font-extrabold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingListing ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Saving Listing...</span>
                      </>
                    ) : selectedCatalogProduct.isAlreadyListed ? (
                      <span>Update Store Listing</span>
                    ) : (
                      <span>Add to Storefront</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REQUEST NEW PRODUCT MODAL */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-[#17231D]">
                  Request New Product
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Submit product details to be verified and added to the ZUNO catalog.
                </p>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {reqFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  reqFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {reqFeedback.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{reqFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProductRequest} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amul Taaza Milk 500ml"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={reqCategoryId}
                    onChange={(e) => setReqCategoryId(e.target.value)}
                    className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                    required
                  >
                    {data.categories
                      .filter((c) => !c.parentId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Unit / Pack Size *
                  </label>
                  <select
                    value={reqUnit}
                    onChange={(e) => setReqUnit(e.target.value)}
                    className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                  >
                    <option value="kg">kg (Kilogram)</option>
                    <option value="g">g (Gram)</option>
                    <option value="litre">litre (Litre)</option>
                    <option value="ml">ml (Millilitre)</option>
                    <option value="packet">packet (Packet)</option>
                    <option value="piece">piece (Piece)</option>
                    <option value="bundle">bundle (Bundle)</option>
                    <option value="dozen">dozen (Dozen)</option>
                    <option value="box">box (Box)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Brand (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amul, Aashirvaad"
                    value={reqBrand}
                    onChange={(e) => setReqBrand(e.target.value)}
                    className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Your Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={reqPrice}
                    onChange={(e) => setReqPrice(Number(e.target.value))}
                    className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#22A06B]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Product Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://... verified product photo link"
                  value={reqImageUrl}
                  onChange={(e) => setReqImageUrl(e.target.value)}
                  className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-2.5 text-xs font-medium text-gray-900 focus:outline-none focus:border-[#22A06B]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReq}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition disabled:opacity-50 shadow-sm"
                >
                  {isSubmittingReq ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name || "Product"}?`}
        subtitle={
          removeTarget
            ? `${removeTarget.categoryName} • ₹${removeTarget.price} / ${removeTarget.unit}`
            : undefined
        }
        description="This will remove the product from your shop storefront so customers can no longer order it from your shop. Global ZUNO catalog products, other shops, and past order history will remain intact."
        confirmLabel="Remove from Storefront"
        confirmPendingLabel="Removing..."
        cancelLabel="Keep Product"
        isSubmitting={isRemoving}
        error={removeError}
        onConfirm={() => void handleConfirmRemoveListing()}
        onCancel={() => {
          if (!isRemoving) {
            setRemoveTarget(null);
            setRemoveError(null);
          }
        }}
      />
    </ShopLayoutShell>
  );
}
