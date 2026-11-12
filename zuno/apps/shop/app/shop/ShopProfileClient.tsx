"use client";

import React, { useMemo, useState } from "react";
import {
  RefreshCw,
  Pencil,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Clock,
  Truck,
  AlertCircle,
} from "lucide-react";
import ShopLayoutShell from "../../components/ShopLayoutShell";
import {
  ShopProfileData,
  getShopProfileAction,
  updateShopProfileAction,
  updateShopOpeningHoursAction,
  toggleDeliveryAvailabilityAction,
} from "../../features/shop/api";
import type { ShopOpeningHours, ShopWeekday } from "@zuno/types";
import {
  SHOP_WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT_LABELS,
  evaluateShopAvailability,
  formatOpeningHoursDaySummary,
  normalizeShopOpeningHoursForEditor,
  validateShopOpeningHours,
} from "@zuno/utils";

export default function ShopProfileClient({
  initialData,
}: {
  initialData: {
    shop: ShopProfileData;
    pendingCount: number;
  };
}) {
  const [data, setData] = useState(initialData);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData.shop.name,
    description: initialData.shop.description,
    phone: initialData.shop.phone,
    addressLine: initialData.shop.addressLine,
    locality: initialData.shop.locality,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Delivery Availability State
  const [togglingDelivery, setTogglingDelivery] = useState(false);

  // Opening Hours State
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [hoursDraft, setHoursDraft] = useState<ShopOpeningHours>(() =>
    normalizeShopOpeningHoursForEditor(initialData.shop.openingHours)
  );
  const [hoursDayErrors, setHoursDayErrors] = useState<
    Partial<Record<ShopWeekday, string>>
  >({});
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [savingHours, setSavingHours] = useState(false);

  // Bulk schedule helper state
  const [bulkDays, setBulkDays] = useState<ShopWeekday[]>([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const [bulkOpenTime, setBulkOpenTime] = useState("08:00");
  const [bulkCloseTime, setBulkCloseTime] = useState("21:00");

  const currentAvailability = useMemo(
    () =>
      evaluateShopAvailability({
        isActive: data.shop.isActive,
        isDeliveryAvailable: data.shop.isDeliveryAvailable,
        openingHours: data.shop.openingHours,
      }),
    [data.shop.isActive, data.shop.isDeliveryAvailable, data.shop.openingHours]
  );

  const refreshProfile = async () => {
    try {
      setRefreshing(true);
      setErrorMessage(null);
      const refreshed = await getShopProfileAction();
      setData(refreshed);
      setFormData({
        name: refreshed.shop.name,
        description: refreshed.shop.description,
        phone: refreshed.shop.phone,
        addressLine: refreshed.shop.addressLine,
        locality: refreshed.shop.locality,
      });
      setHoursDraft(
        normalizeShopOpeningHoursForEditor(refreshed.shop.openingHours)
      );
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to refresh profile.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleDelivery = async () => {
    if (togglingDelivery) return;
    const nextDelivery = !data.shop.isDeliveryAvailable;
    setTogglingDelivery(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await toggleDeliveryAvailabilityAction(nextDelivery);
      if (!res.success) {
        setErrorMessage(res.error || res.message || "Failed to update delivery status.");
        return;
      }
      setData((prev) => ({
        ...prev,
        shop: {
          ...prev.shop,
          isDeliveryAvailable: nextDelivery,
        },
      }));
      setSuccessMessage(res.message);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to update delivery status.");
    } finally {
      setTogglingDelivery(false);
    }
  };

  const toggleDayInDraft = (day: ShopWeekday) => {
    setHoursDayErrors((prev) => {
      const copy = { ...prev };
      delete copy[day];
      return copy;
    });
    setHoursError(null);

    setHoursDraft((prev) => {
      const current = prev[day];
      if (current.enabled) {
        return {
          ...prev,
          [day]: { enabled: false, open: null, close: null },
        };
      }
      return {
        ...prev,
        [day]: {
          enabled: true,
          open: current.open || "08:00",
          close: current.close || "21:00",
        },
      };
    });
  };

  const updateDayTimeInDraft = (
    day: ShopWeekday,
    field: "open" | "close",
    value: string
  ) => {
    setHoursDayErrors((prev) => {
      const copy = { ...prev };
      delete copy[day];
      return copy;
    });
    setHoursError(null);
    setHoursDraft((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: true,
        [field]: value,
      },
    }));
  };

  const toggleBulkDay = (day: ShopWeekday) => {
    setBulkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleApplyBulkHours = () => {
    if (bulkDays.length === 0) {
      setHoursError("Select at least one weekday to apply the schedule template.");
      return;
    }

    const templateTest = validateShopOpeningHours({
      ...hoursDraft,
      monday: { enabled: true, open: bulkOpenTime, close: bulkCloseTime },
    });
    if (!templateTest.valid && templateTest.dayErrors.monday) {
      setHoursError(templateTest.dayErrors.monday);
      return;
    }

    const openTrimmed = bulkOpenTime.trim();
    const closeTrimmed = bulkCloseTime.trim();
    if (openTrimmed === closeTrimmed) {
      setHoursError("Opening and closing time cannot be identical.");
      return;
    }

    setHoursError(null);
    setHoursDayErrors({});
    setHoursDraft((prev) => {
      const next = { ...prev };
      for (const day of bulkDays) {
        next[day] = {
          enabled: true,
          open: openTrimmed,
          close: closeTrimmed,
        };
      }
      return next;
    });
  };

  const handleSaveOpeningHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingHours) return;

    setHoursError(null);
    setHoursDayErrors({});
    setSuccessMessage(null);
    setErrorMessage(null);

    const clientCheck = validateShopOpeningHours(hoursDraft);
    if (!clientCheck.valid) {
      setHoursError(clientCheck.error);
      setHoursDayErrors(clientCheck.dayErrors);
      return;
    }

    setSavingHours(true);
    try {
      const res = await updateShopOpeningHoursAction(clientCheck.data);
      if (!res.success) {
        setHoursError(res.error || res.message || "Failed to save opening hours.");
        setHoursDayErrors(res.dayErrors || {});
        return;
      }

      if (res.openingHours) {
        setData((prev) => ({
          ...prev,
          shop: {
            ...prev.shop,
            openingHours: res.openingHours!,
          },
        }));
        setHoursDraft(res.openingHours);
      }
      setIsEditingHours(false);
      setSuccessMessage(res.message || "Weekly opening hours updated successfully.");
    } catch (err: any) {
      setHoursError(err?.message || "Failed to save opening hours.");
    } finally {
      setSavingHours(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});
    try {
      const res = await updateShopProfileAction(formData);
      if (!res.success) {
        setErrorMessage(res.error || res.message || "Failed to update profile.");
        setFieldErrors(res.fieldErrors || {});
        return;
      }
      setSuccessMessage(res.message || "Shop profile updated successfully!");
      setIsEditing(false);
      await refreshProfile();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const shopInitials = (data.shop.name || "SK")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <ShopLayoutShell
      shop={data.shop}
      pendingOrdersCount={data.pendingCount}
      title="Shop Profile"
      subtitle="Storefront identity, registration status and local business details"
      actions={
        <button
          onClick={refreshProfile}
          disabled={refreshing}
          title="Refresh shop profile"
          aria-label="Refresh shop profile"
          className="p-2 text-gray-600 hover:text-[#0F5D3A] hover:bg-emerald-50 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-[#A7D56B]"
        >
          <RefreshCw
            size={18}
            className={refreshing ? "animate-spin text-[#0F5D3A]" : ""}
          />
        </button>
      }
    >
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-700" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-800 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-semibold flex items-center justify-between"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-800 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Header Hero */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          <div className="w-20 h-20 rounded-2xl bg-[#0F5D3A] text-[#A7D56B] flex items-center justify-center text-3xl font-black shadow-md flex-shrink-0">
            {shopInitials}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-[#17231D]">
                {data.shop.name}
              </h2>
              <span className="bg-emerald-100 text-[#0F5D3A] border border-emerald-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                {data.shop.approvalStatus}
              </span>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                  data.shop.isActive
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200"
                }`}
              >
                {data.shop.isActive ? "Store Online" : "Store Offline"}
              </span>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                  data.shop.isDeliveryAvailable
                    ? "bg-emerald-50 text-[#0F5D3A] border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {data.shop.isDeliveryAvailable
                  ? "Delivery Available"
                  : "Delivery Temporarily Paused"}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">
              {data.shop.locality} • PIN {data.shop.pincode} • Registered on{" "}
              {new Date(data.shop.createdAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            {data.shop.description && (
              <p className="text-xs text-gray-600 max-w-lg pt-1">
                {data.shop.description}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
            isEditing
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-[#0F5D3A] hover:bg-[#22A06B] text-white"
          }`}
        >
          <Pencil size={14} />
          <span>{isEditing ? "Cancel Editing" : "Edit Store Profile"}</span>
        </button>
      </div>

      {/* Main Grid: Details or Edit Form */}
      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5"
        >
          <h3 className="font-black text-base text-[#17231D]">
            Edit Storefront Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">
                Store / Shop Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#22A06B]"
              />
              {fieldErrors.name && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                Owner Contact Phone
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#22A06B]"
              />
              {fieldErrors.phone && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="font-bold text-gray-700 block mb-1">
                Shop Description / Bio
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Fresh dairy, groceries, daily essentials..."
                className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#22A06B]"
              />
              {fieldErrors.description && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.description}</p>
              )}
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                Address Line / Landmark
              </label>
              <input
                type="text"
                required
                value={formData.addressLine}
                onChange={(e) =>
                  setFormData({ ...formData, addressLine: e.target.value })
                }
                className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#22A06B]"
              />
              {fieldErrors.addressLine && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.addressLine}</p>
              )}
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                Locality / Area (Renukoot)
              </label>
              <input
                type="text"
                required
                value={formData.locality}
                onChange={(e) =>
                  setFormData({ ...formData, locality: e.target.value })
                }
                className="w-full bg-[#F8FAF6] border border-gray-200 rounded-xl p-3 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#22A06B]"
              />
              {fieldErrors.locality && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.locality}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              <span>{isSaving ? "Saving Changes..." : "Save Profile Changes"}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Details */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-black text-sm text-[#17231D] uppercase tracking-wider text-gray-500 flex items-center gap-2">
              <Building2 size={16} className="text-[#0F5D3A]" />
              <span>Business Information</span>
            </h3>
            <div className="divide-y divide-gray-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Store Name:</span>
                <span className="font-bold text-gray-900">{data.shop.name}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Contact Phone:</span>
                <span className="font-bold text-gray-900">{data.shop.phone || "Not set"}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Address:</span>
                <span className="font-bold text-gray-900">{data.shop.addressLine || "Renukoot Market"}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Locality:</span>
                <span className="font-bold text-gray-900">{data.shop.locality}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">PIN Code:</span>
                <span className="font-bold text-gray-900">{data.shop.pincode}</span>
              </div>
            </div>
          </div>

          {/* Verification & Compliance */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-black text-sm text-[#17231D] uppercase tracking-wider text-gray-500 flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#0F5D3A]" />
              <span>Verification & Compliance</span>
            </h3>
            <div className="divide-y divide-gray-100 text-xs">
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-gray-500">Super Admin Approval:</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={12} />
                  <span>{data.shop.approvalStatus}</span>
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Hyperlocal Service Area:</span>
                <span className="font-bold text-gray-900">Renukoot (PIN 231217)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Database Role:</span>
                <span className="font-bold text-gray-900">Authorized Merchant Owner</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-gray-500">Security & Isolation:</span>
                <span className="font-bold text-emerald-700">PostgreSQL RLS Protected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Availability Control */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-black text-base text-[#17231D] flex items-center gap-2">
            <Truck size={18} className="text-[#0F5D3A]" />
            <span>Delivery Availability</span>
          </h3>
          <p className="text-xs text-gray-500">
            Control whether customers can place new delivery orders right now. Pausing delivery does not hide your storefront from discovery while your store is online.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <span
            className={`text-xs font-extrabold px-3 py-1.5 rounded-full border ${
              data.shop.isDeliveryAvailable
                ? "bg-emerald-50 text-[#0F5D3A] border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            {data.shop.isDeliveryAvailable
              ? "Delivery Available"
              : "Delivery Temporarily Paused"}
          </span>

          <button
            type="button"
            onClick={handleToggleDelivery}
            disabled={togglingDelivery}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm disabled:opacity-50 ${
              data.shop.isDeliveryAvailable
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-[#0F5D3A] hover:bg-[#22A06B]"
            }`}
          >
            {togglingDelivery
              ? "Updating..."
              : data.shop.isDeliveryAvailable
              ? "Pause Delivery"
              : "Enable Delivery"}
          </button>
        </div>
      </div>

      {/* Weekly Opening Hours & Preview Section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-base text-[#17231D] flex items-center gap-2">
                <Clock size={18} className="text-[#0F5D3A]" />
                <span>Opening Hours (IST • Asia/Kolkata)</span>
              </h3>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  currentAvailability.isOpenNow
                    ? "bg-emerald-50 text-[#0F5D3A] border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {currentAvailability.isOpenNow ? "Open Now" : currentAvailability.openStatusLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Set 24-hour open and close times (e.g. 08:00 to 21:00) for each weekday. Today&apos;s schedule:{" "}
              <span className="font-bold text-[#17231D]">{currentAvailability.todayHoursText}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isEditingHours) {
                setHoursDraft(
                  normalizeShopOpeningHoursForEditor(data.shop.openingHours)
                );
                setHoursDayErrors({});
                setHoursError(null);
              }
              setIsEditingHours(!isEditingHours);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              isEditingHours
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-[#0F5D3A] hover:bg-[#22A06B] text-white"
            }`}
          >
            <Pencil size={14} />
            <span>{isEditingHours ? "Cancel Editing Hours" : "Edit Opening Hours"}</span>
          </button>
        </div>

        {isEditingHours ? (
          <form onSubmit={handleSaveOpeningHours} className="space-y-5">
            {hoursError && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2"
              >
                <AlertCircle size={15} className="shrink-0 text-red-700" />
                <span>{hoursError}</span>
              </div>
            )}

            {/* Quick Bulk Apply Bar */}
            <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#17231D]">
                  Apply Same Schedule to Selected Days
                </span>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDays([
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                      ])
                    }
                    className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-[#22A06B]"
                  >
                    Mon–Fri
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDays([
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                      ])
                    }
                    className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-[#22A06B]"
                  >
                    Mon–Sat
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkDays([...SHOP_WEEKDAYS])}
                    className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-[#22A06B]"
                  >
                    All 7 Days
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SHOP_WEEKDAYS.map((day) => {
                  const selected = bulkDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleBulkDay(day)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                        selected
                          ? "bg-[#0F5D3A] text-white border-[#0F5D3A]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-[#22A06B]"
                      }`}
                    >
                      {WEEKDAY_SHORT_LABELS[day]}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                  <span>Open:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="08:00"
                    value={bulkOpenTime}
                    onChange={(e) => setBulkOpenTime(e.target.value)}
                    className="w-24 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#17231D] focus:outline-none focus:border-[#22A06B]"
                  />
                </label>
                <label className="text-xs font-bold text-gray-700 flex items-center gap-2">
                  <span>Close:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="21:00"
                    value={bulkCloseTime}
                    onChange={(e) => setBulkCloseTime(e.target.value)}
                    className="w-24 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#17231D] focus:outline-none focus:border-[#22A06B]"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyBulkHours}
                  className="px-3.5 py-1.5 rounded-lg bg-[#22A06B] hover:bg-[#0F5D3A] text-white text-xs font-bold transition"
                >
                  Apply to Selected Days
                </button>
              </div>
            </div>

            {/* Individual Weekday Rows */}
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {SHOP_WEEKDAYS.map((day) => {
                const slot = hoursDraft[day];
                const dayErr = hoursDayErrors[day];
                return (
                  <div
                    key={day}
                    className={`p-3.5 flex flex-col gap-2 ${
                      slot.enabled ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <input
                          id={`hours-enabled-${day}`}
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={() => toggleDayInDraft(day)}
                          className="w-4 h-4 accent-[#0F5D3A] rounded"
                        />
                        <label
                          htmlFor={`hours-enabled-${day}`}
                          className="text-xs font-extrabold text-[#17231D] cursor-pointer"
                        >
                          {WEEKDAY_LABELS[day]}
                        </label>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            slot.enabled
                              ? "bg-emerald-50 text-[#0F5D3A]"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {slot.enabled ? "Open" : "Closed"}
                        </span>
                      </div>

                      {slot.enabled ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <label className="flex items-center gap-1.5 font-semibold text-gray-600">
                            <span>Opens</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                              placeholder="08:00"
                              value={slot.open ?? ""}
                              onChange={(e) =>
                                updateDayTimeInDraft(day, "open", e.target.value)
                              }
                              className="w-24 bg-[#F8FAF6] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#17231D] focus:outline-none focus:border-[#22A06B]"
                            />
                          </label>
                          <span className="text-gray-400 font-bold">to</span>
                          <label className="flex items-center gap-1.5 font-semibold text-gray-600">
                            <span>Closes</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                              placeholder="21:00"
                              value={slot.close ?? ""}
                              onChange={(e) =>
                                updateDayTimeInDraft(day, "close", e.target.value)
                              }
                              className="w-24 bg-[#F8FAF6] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#17231D] focus:outline-none focus:border-[#22A06B]"
                            />
                          </label>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-gray-500">
                          Closed all day
                        </span>
                      )}
                    </div>

                    {dayErr && (
                      <p className="text-[11px] text-red-600 font-semibold pl-7">
                        {dayErr}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live Weekly Preview inside Editor */}
            <div className="bg-[#F8FAF6] border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="text-xs font-extrabold text-[#17231D]">
                Weekly Schedule Preview
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {SHOP_WEEKDAYS.map((day) => {
                  const slot = hoursDraft[day];
                  return (
                    <div
                      key={day}
                      className="bg-white border border-gray-200 rounded-lg p-2 text-[11px]"
                    >
                      <div className="font-extrabold text-[#17231D]">
                        {WEEKDAY_SHORT_LABELS[day]}
                      </div>
                      <div
                        className={`font-semibold mt-0.5 ${
                          slot.enabled ? "text-[#0F5D3A]" : "text-gray-400"
                        }`}
                      >
                        {formatOpeningHoursDaySummary(slot)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setHoursDraft(
                    normalizeShopOpeningHoursForEditor(data.shop.openingHours)
                  );
                  setHoursDayErrors({});
                  setHoursError(null);
                  setIsEditingHours(false);
                }}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingHours}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#0F5D3A] hover:bg-[#22A06B] rounded-xl transition shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                <span>{savingHours ? "Saving Schedule..." : "Save Opening Hours"}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {SHOP_WEEKDAYS.map((day) => {
              const slot = data.shop.openingHours[day];
              return (
                <div
                  key={day}
                  className={`border rounded-xl p-3 text-xs ${
                    slot.enabled
                      ? "bg-[#F8FAF6] border-gray-200"
                      : "bg-gray-50 border-gray-200 opacity-80"
                  }`}
                >
                  <div className="font-extrabold text-[#17231D]">
                    {WEEKDAY_SHORT_LABELS[day]}
                  </div>
                  <div
                    className={`font-bold mt-1 text-[11px] ${
                      slot.enabled ? "text-[#0F5D3A]" : "text-gray-500"
                    }`}
                  >
                    {formatOpeningHoursDaySummary(slot)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ShopLayoutShell>
  );
}
