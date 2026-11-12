import React from "react";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { requireApprovedShopkeeper } from "../../../lib/authGuard";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import ShopLayoutShell from "../../../components/ShopLayoutShell";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const auth = await requireApprovedShopkeeper();
  const supabase = createServerSupabaseClient();

  const { data: shopRow } = await supabase
    .from("shops")
    .select("id, name, locality, pincode, is_active")
    .eq("id", auth.shopId)
    .single();

  const shop = {
    id: shopRow?.id || auth.shopId,
    name: shopRow?.name || auth.shopName,
    locality: shopRow?.locality || "Renukoot",
    pincode: shopRow?.pincode || "231217",
    isActive: Boolean(shopRow?.is_active ?? true),
  };

  return (
    <ShopLayoutShell
      shop={shop}
      title="Edit Product Listing"
      subtitle={`Manage storefront pricing and stock for ${shop.name}`}
      actions={
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0F5D3A] bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
        >
          <ArrowLeft size={14} />
          <span>Back to Catalog</span>
        </Link>
      }
    >
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-4 shadow-sm max-w-xl mx-auto">
        <div className="w-12 h-12 mx-auto bg-emerald-50 text-[#0F5D3A] rounded-2xl flex items-center justify-center">
          <Package size={24} strokeWidth={2} />
        </div>
        <h2 className="text-lg font-black text-[#17231D]">
          Edit Listing in Product Catalog
        </h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          Dedicated editing on this route ({params.id.slice(0, 8)}…) is currently unavailable. Open the Product Catalog or Inventory pages to adjust price, stock, and availability.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <span>Open Product Catalog</span>
          </Link>
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition"
          >
            <span>Open Inventory</span>
          </Link>
        </div>
      </div>
    </ShopLayoutShell>
  );
}
