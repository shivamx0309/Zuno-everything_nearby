"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentShopkeeper, ShopkeeperAccount } from "../../features/auth/api";

export default function ShopStatusPage() {
  const router = useRouter();
  const [shopkeeper, setShopkeeper] = useState<ShopkeeperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [newlyRegistered, setNewlyRegistered] = useState(false);

  useEffect(() => {
    async function load() {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        setNewlyRegistered(urlParams.get("registered") === "true");
      }
      const s = await getCurrentShopkeeper();
      setShopkeeper(s);
      setLoading(false);
    }
    load();
  }, []);

  const handleSignOutAndReturn = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAF6] flex items-center justify-center p-4 font-sans text-gray-500">
        Checking shopkeeper application status...
      </div>
    );
  }

  if (!shopkeeper) {
    return (
      <div className="min-h-screen bg-[#F8FAF6] flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-5">
          <div className="mx-auto w-16 h-16 bg-[#EAF4E5] border border-[#0F5D3A] rounded-full flex items-center justify-center text-2xl text-[#0F5D3A] font-bold">
            🔒
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-[#17231D]">
              Sign In to Check Application Status
            </h1>
            <p className="text-xs text-gray-500 leading-relaxed">
              For your security and privacy, shop application status is visible only after signing in with your registered mobile number and password.
            </p>
          </div>
          <div className="space-y-2">
            <Link
              href="/login?redirect=%2Fstatus"
              className="block w-full py-3 bg-[#0F5D3A] hover:bg-[#0c4b2e] text-white rounded-xl text-sm font-extrabold transition shadow-sm"
            >
              Sign In to Check Status →
            </Link>
            <Link
              href="/register"
              className="block w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
            >
              Register a New Shop
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const status = shopkeeper.approvalStatus || "PENDING";

  return (
    <div className="min-h-screen bg-[#F8FAF6] flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-[#EAF4E5] border border-[#0F5D3A] rounded-full flex items-center justify-center text-2xl text-[#0F5D3A] font-bold">
          🏪
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-[#17231D]">
            {status === "APPROVED" || shopkeeper?.isApproved
              ? "Shop Application Approved! 🎉"
              : status === "REJECTED"
              ? "Application Not Approved"
              : status === "SUSPENDED"
              ? "Shop Account Suspended"
              : "Your Shop Registration is Under Review"}
          </h1>
          <p className="text-xs text-gray-500 leading-relaxed">
            {status === "APPROVED" || shopkeeper?.isApproved
              ? "Your shop is verified and ready for live operations in Renukoot."
              : status === "REJECTED"
              ? "Your shop registration could not be verified by ZUNO Admin."
              : status === "SUSPENDED"
              ? "Your shop account access has been restricted by Admin."
              : "ZUNO Admin is verifying your business details and location for PIN 231217."}
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Shop Name:</span>
            <span className="font-bold text-[#17231D]">{shopkeeper?.shopName || "Submitted Shop"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Owner Name:</span>
            <span className="font-bold text-[#17231D]">{shopkeeper?.fullName || "Shop Owner"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Verification Status:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                status === "APPROVED" || shopkeeper?.isApproved
                  ? "bg-emerald-100 text-emerald-800"
                  : status === "REJECTED"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {status}
            </span>
          </div>
        </div>

        {status === "APPROVED" || shopkeeper?.isApproved ? (
          <Link
            href="/dashboard"
            className="block w-full py-3 bg-[#0F5D3A] hover:bg-[#0c4b2e] text-white rounded-xl text-sm font-extrabold transition shadow-sm"
          >
            Enter Shopkeeper Dashboard →
          </Link>
        ) : status === "REJECTED" ? (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Your application was not approved by ZUNO Administration. You may submit a new application with verified details or contact local support.
            </p>
            <div className="space-y-2">
              <Link
                href="/register"
                className="block w-full py-2.5 bg-[#0F5D3A] hover:bg-[#0c4b2e] text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Submit New Application →
              </Link>
              <Link
                href="/login"
                className="block w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {newlyRegistered && (
              <div className="p-3 bg-[#EAF4E5] border border-[#22A06B]/30 text-[#0F5D3A] rounded-xl text-xs font-semibold leading-relaxed">
                Application submitted! Your shop is pending Super Admin approval before dashboard access is unlocked.
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              New shopkeeper registrations default to PENDING status and require Admin approval before live order processing.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="block w-full py-2.5 bg-[#EAF4E5] hover:bg-[#d5ebd0] text-[#0F5D3A] border border-[#0F5D3A]/20 rounded-xl text-xs font-bold transition"
              >
                🔄 Check Latest Approval Status
              </button>
              <button
                type="button"
                onClick={handleSignOutAndReturn}
                className="block w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition"
              >
                Back to Login / Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
