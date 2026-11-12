"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  House,
  ShoppingBag,
  Package,
  Boxes,
  Store,
  Wallet,
  ChartNoAxesCombined,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  LucideIcon,
} from "lucide-react";
import { toggleShopOnlineStatusAction } from "../features/dashboard/api";

export interface ShopIdentity {
  id: string;
  name: string;
  locality?: string;
  pincode?: string;
  isActive?: boolean;
}

export default function ShopLayoutShell({
  shop,
  pendingOrdersCount = 0,
  title,
  subtitle,
  actions,
  children,
}: {
  shop: ShopIdentity;
  pendingOrdersCount?: number;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(Boolean(shop.isActive ?? true));
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    setIsOnline(Boolean(shop.isActive ?? true));
  }, [shop.isActive]);

  const handleToggleStoreStatus = async () => {
    if (togglingStatus) return;
    const newStatus = !isOnline;
    setTogglingStatus(true);
    try {
      await toggleShopOnlineStatusAction(newStatus);
      setIsOnline(newStatus);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "Failed to update store status.");
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/login");
  };

  // Primary navigation for everyday store operations
  const primaryNavItems = [
    { href: "/dashboard", label: "Overview", icon: House },
    {
      href: "/orders",
      label: "Orders",
      icon: ShoppingBag,
      badge: pendingOrdersCount > 0 ? `${pendingOrdersCount} New` : undefined,
    },
    { href: "/products", label: "Products", icon: Package },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    { href: "/shop", label: "Shop Profile", icon: Store },
    { href: "/earnings", label: "Earnings", icon: Wallet },
  ];

  // Secondary navigation for store management & preferences
  const secondaryNavItems = [
    { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const shopInitials = (shop.name || "SK")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderNavLink = (item: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: string;
  }) => {
    const Icon = item.icon;
    const isActive =
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-current={isActive ? "page" : undefined}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
          isActive
            ? "bg-[#22A06B] text-white font-extrabold shadow-sm border-l-4 border-[#A7D56B]"
            : "text-[#D2E7D9] hover:bg-[#157248] hover:text-white"
        } focus:outline-none focus:ring-2 focus:ring-[#A7D56B]`}
      >
        <div className="flex items-center gap-3">
          <Icon
            size={18}
            strokeWidth={2}
            className={`flex-shrink-0 transition-colors ${
              isActive ? "text-white" : "text-[#A7D56B] group-hover:text-white"
            }`}
          />
          <span>{item.label}</span>
        </div>
        {item.badge && (
          <span className="bg-[#A7D56B] text-[#0F5D3A] text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F8FAF6] text-[#17231D] flex flex-col md:flex-row font-sans">
      {/* Mobile Top Header Bar */}
      <div className="md:hidden bg-[#0F5D3A] text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0 z-30">
        <div className="bg-white px-2.5 py-1 rounded-xl shadow-sm flex items-center gap-2">
          <img
            src="/brandlogo.png"
            alt="ZUNO Logo"
            className="h-7 w-auto object-contain"
          />
          <span className="text-[10px] text-[#0F5D3A] font-black uppercase tracking-wider">
            Shop
          </span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg bg-[#157248] text-white hover:bg-[#22A06B] transition-colors focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {isMobileMenuOpen ? (
            <X size={20} strokeWidth={2} />
          ) : (
            <Menu size={20} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Left Sidebar Shell — Fixed Viewport Height */}
      <aside
        className={`${
          isMobileMenuOpen
            ? "fixed inset-0 z-40 bg-[#0F5D3A] flex"
            : "hidden md:flex"
        } md:static w-full md:w-64 h-full bg-[#0F5D3A] text-white flex-shrink-0 flex-col justify-between border-r border-[#0d4f31]`}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* High-Contrast Official Logo Card Container */}
          <div className="p-4 border-b border-[#18754b] flex-shrink-0">
            <div className="bg-white rounded-2xl p-3 shadow-md border border-white/20 flex items-center justify-between gap-3">
              <img
                src="/brandlogo.png"
                alt="ZUNO Merchant Logo"
                className="h-8 w-auto object-contain"
              />
              <span className="bg-[#EAF4ED] text-[#0F5D3A] text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Merchant
              </span>
            </div>
            <div className="mt-2.5 px-1 flex items-center justify-between text-[11px] text-[#A7D56B] font-bold">
              <span>Hyperlocal Portal</span>
              <span className="text-white/70 text-[10px]">PIN 231217</span>
            </div>
          </div>

          {/* Navigation Links — Independently Scrollable */}
          <nav
            className="flex-1 overflow-y-auto px-3 py-3 space-y-1 focus:outline-none"
            aria-label="Shopkeeper navigation"
          >
            {/* Primary Everyday Section */}
            {primaryNavItems.map(renderNavLink)}

            {/* Subtle Divider & Secondary Section */}
            <div className="pt-3 pb-1 px-3">
              <div className="border-t border-[#18754b] mb-2" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A7D56B]/70 block">
                Preferences
              </span>
            </div>

            {secondaryNavItems.map(renderNavLink)}
          </nav>

          {/* Shop Identity Footer — Fixed inside sidebar bottom */}
          <div className="p-3.5 border-t border-[#18754b] bg-[#0c4a2e] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#A7D56B] text-[#0F5D3A] font-black flex items-center justify-center text-xs shadow-sm flex-shrink-0">
                {shopInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#A7D56B] font-bold truncate">
                  {shop.name || "Your Store"}
                </p>
                <p className="text-[11px] text-emerald-200 truncate">
                  {shop.locality ? `${shop.locality} • PIN ${shop.pincode || "231217"}` : "PIN 231217, Renukoot"}
                </p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className="text-emerald-300 hover:text-white p-2 rounded-lg hover:bg-[#157248] transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
              >
                <LogOut size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Main Content Shell */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden">
        {/* Top Header — Fixed & Aligned (Never clipped) */}
        <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4 z-10 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-[#17231D] truncate leading-tight">
              {title || "Shop Dashboard"}
            </h1>
            <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
              {subtitle || "Manage your storefront, inventory and live customer orders in Renukoot"}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {actions}

            {/* Live Store Online Status Toggle */}
            <div className="flex items-center gap-2 bg-[#F8FAF6] border border-gray-200 px-3 py-1.5 rounded-full shadow-inner">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                }`}
              />
              <span className="text-xs font-bold text-gray-700 hidden sm:inline">
                {isOnline ? "Store Online" : "Store Offline"}
              </span>
              <button
                type="button"
                onClick={handleToggleStoreStatus}
                disabled={togglingStatus}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  isOnline ? "bg-[#22A06B]" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={isOnline}
                title={isOnline ? "Click to set store offline" : "Click to set store online"}
                aria-label={isOnline ? "Set store offline" : "Set store online"}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    isOnline ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Quick Link to Notifications */}
            <Link
              href="/notifications"
              title="Notifications"
              aria-label="Notifications"
              className="p-2 text-gray-500 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
            >
              <Bell size={18} strokeWidth={2} />
            </Link>
          </div>
        </header>

        {/* Scrollable Content Container — ONLY THIS AREA SCROLLS */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
