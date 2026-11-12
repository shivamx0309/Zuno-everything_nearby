"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  LogOut,
  MapPin,
  ShieldCheck,
  Truck,
  Store,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import {
  getShopSettingsAction,
  toggleStoreActiveSettingAction,
  toggleDeliveryAvailabilitySettingAction,
} from "../../features/settings/api";
import { setShopkeeperPassword } from "../../features/auth/api";

export default function SettingsClient({
  initialData,
}: {
  initialData: {
    shop: {
      id: string;
      name: string;
      locality: string;
      pincode: string;
      phone: string;
      isActive: boolean;
      isDeliveryAvailable: boolean;
      approvalStatus: string;
    };
    pendingCount: number;
  };
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [isOnline, setIsOnline] = useState(data.shop.isActive);
  const [isDeliveryAvailable, setIsDeliveryAvailable] = useState(
    data.shop.isDeliveryAvailable
  );
  const [toggling, setToggling] = useState(false);
  const [togglingDelivery, setTogglingDelivery] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const refreshSettings = async () => {
    try {
      setRefreshing(true);
      const refreshed = await getShopSettingsAction();
      setData(refreshed);
      setIsOnline(refreshed.shop.isActive);
      setIsDeliveryAvailable(refreshed.shop.isDeliveryAvailable);
    } catch (err: any) {
      setSettingsMsg({
        type: "err",
        text: err?.message || "Failed to refresh settings.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleOnline = async () => {
    if (toggling) return;
    const nextStatus = !isOnline;
    setToggling(true);
    setSettingsMsg(null);
    try {
      await toggleStoreActiveSettingAction(nextStatus);
      setIsOnline(nextStatus);
      await refreshSettings();
      setSettingsMsg({
        type: "ok",
        text: nextStatus ? "Storefront is now live online." : "Storefront set to offline.",
      });
    } catch (err: any) {
      setSettingsMsg({
        type: "err",
        text: err?.message || "Failed to toggle status.",
      });
    } finally {
      setToggling(false);
    }
  };

  const handleToggleDelivery = async () => {
    if (togglingDelivery) return;
    const nextDelivery = !isDeliveryAvailable;
    setTogglingDelivery(true);
    setSettingsMsg(null);
    try {
      const res = await toggleDeliveryAvailabilitySettingAction(nextDelivery);
      setIsDeliveryAvailable(res.isDeliveryAvailable);
      await refreshSettings();
      setSettingsMsg({
        type: "ok",
        text: res.message,
      });
    } catch (err: any) {
      setSettingsMsg({
        type: "err",
        text: err?.message || "Failed to update delivery availability.",
      });
    } finally {
      setTogglingDelivery(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/login");
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordLoading(true);
    try {
      const res = await setShopkeeperPassword(newPassword, confirmPassword);
      if (res.success) {
        setPasswordMsg({
          type: "ok",
          text: res.message || "Password updated successfully.",
        });
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMsg({
          type: "err",
          text: res.error || "Failed to update password.",
        });
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Store Settings"
      subtitle="Operational preferences, online availability and account configuration"
      actions={
        <button
          onClick={refreshSettings}
          disabled={refreshing}
          title="Refresh settings"
          aria-label="Refresh settings"
          className="p-2 text-gray-600 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
        >
          <RefreshCw
            size={18}
            className={refreshing ? "animate-spin text-[#0F5D3A]" : ""}
          />
        </button>
      }
    >
      <div className="space-y-6">
        {settingsMsg && (
          <div
            role={settingsMsg.type === "err" ? "alert" : "status"}
            className={`p-3.5 rounded-2xl text-xs font-semibold border flex items-center justify-between ${
              settingsMsg.type === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <span>{settingsMsg.text}</span>
            <button
              type="button"
              onClick={() => setSettingsMsg(null)}
              className="font-bold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Operational Status Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-base text-[#17231D] flex items-center gap-2">
                <Store size={18} className="text-[#0F5D3A]" />
                <span>Storefront Availability</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                When online, customers nearby in Renukoot can see your storefront and place live orders.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-black px-3 py-1 rounded-full ${
                  isOnline
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200"
                }`}
              >
                {isOnline ? "● Live Online" : "○ Offline"}
              </span>

              <button
                type="button"
                onClick={handleToggleOnline}
                disabled={toggling}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm disabled:opacity-50 ${
                  isOnline
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-[#0F5D3A] hover:bg-[#22A06B]"
                }`}
              >
                {toggling
                  ? "Updating..."
                  : isOnline
                  ? "Set Store Offline"
                  : "Go Online Now"}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-black text-sm text-[#17231D] flex items-center gap-2">
                <Truck size={16} className="text-[#0F5D3A]" />
                <span>Delivery Availability</span>
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Temporarily pause new delivery orders without hiding your storefront when online.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-black px-3 py-1 rounded-full ${
                  isDeliveryAvailable
                    ? "bg-emerald-50 text-[#0F5D3A] border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {isDeliveryAvailable ? "Delivery Available" : "Delivery Paused"}
              </span>

              <button
                type="button"
                onClick={handleToggleDelivery}
                disabled={togglingDelivery}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm disabled:opacity-50 ${
                  isDeliveryAvailable
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-[#0F5D3A] hover:bg-[#22A06B]"
                }`}
              >
                {togglingDelivery
                  ? "Updating..."
                  : isDeliveryAvailable
                  ? "Pause Delivery"
                  : "Enable Delivery"}
              </button>
            </div>
          </div>
        </div>

        {/* Hyperlocal Service Area Settings */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="font-black text-base text-[#17231D] flex items-center gap-2">
            <MapPin size={18} className="text-[#0F5D3A]" />
            <span>Hyperlocal Delivery Zone</span>
          </h3>
          <p className="text-xs text-gray-500">
            ZUNO matches you automatically with customers and registered delivery partners in your town.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-4">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                Primary Town
              </span>
              <span className="text-sm font-black text-gray-900 mt-1 block">
                {data.shop.locality || "Renukoot"}
              </span>
            </div>

            <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-4">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                PIN Code
              </span>
              <span className="text-sm font-black text-gray-900 mt-1 block">
                {data.shop.pincode || "231217"}
              </span>
            </div>

            <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-4">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                Delivery Fleet
              </span>
              <span className="text-sm font-black text-[#0F5D3A] mt-1 flex items-center gap-1.5">
                <Truck size={14} />
                <span>ZUNO Fleet Active</span>
              </span>
            </div>
          </div>
        </div>

        {/* Account and Sign Out */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="font-black text-base text-[#17231D] flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#0F5D3A]" />
            <span>Account & Security</span>
          </h3>
          <p className="text-xs text-gray-500">
            Authenticated as registered merchant owner for {data.shop.name}.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-gray-100">
            <div className="text-xs">
              <span className="text-gray-500">Registered Phone: </span>
              <span className="font-bold text-gray-900">{data.shop.phone || "On file"}</span>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <span>Sign Out of Dashboard</span>
              <LogOut size={15} />
            </button>
          </div>

          {/* Authenticated Password Setup / Change */}
          <form
            onSubmit={handlePasswordUpdate}
            className="pt-4 border-t border-gray-100 space-y-3"
          >
            <div className="text-xs font-extrabold text-[#17231D]">
              Set or Update Account Password
            </div>
            {passwordMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold ${
                  passwordMsg.type === "ok"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {passwordMsg.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 chars, letter + number)"
                className="px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A]"
                minLength={8}
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="px-3 py-2 text-xs font-bold border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A]"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-4 py-2 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              {passwordLoading ? "Saving Password..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </ShopLayoutShell>
  );
}
