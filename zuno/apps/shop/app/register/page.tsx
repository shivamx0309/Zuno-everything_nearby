"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { registerShopkeeper } from "../../features/auth/api";
import {
  normalizeIndianPhone,
  validateShopkeeperPassword,
} from "../../lib/shop-auth-utils";

export default function ShopRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Owner & Credentials
  const [ownerFullName, setOwnerFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Shop Info
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [locality, setLocality] = useState("Renukoot");
  const [pincode, setPincode] = useState("231217");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (ownerFullName.trim().length < 2) {
      setError("Please enter the owner's full name (at least 2 characters).");
      return;
    }

    const phoneCheck = normalizeIndianPhone(phone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || "Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const passwordCheck = validateShopkeeperPassword(password);
    if (!passwordCheck.valid) {
      setError(passwordCheck.error || "Please enter a valid password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (shopName.trim().length < 2) {
      setError("Please enter your shop name.");
      return;
    }
    if (addressLine.trim().length < 3) {
      setError("Please enter your complete shop address.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerShopkeeper({
        ownerFullName: ownerFullName.trim(),
        phone: phone.replace(/\D/g, "").slice(-10),
        password,
        confirmPassword,
        shopName: shopName.trim(),
        description: description.trim(),
        addressLine: addressLine.trim(),
        locality: locality.trim(),
        pincode: pincode.trim(),
      });
      const confirmationFlag = res.requiresConfirmation ? "&confirm=pending" : "";
      router.push(`${res.redirect}${confirmationFlag}`);
    } catch (err: any) {
      setError(err?.message || "Failed to register shop. Please verify your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF6] flex flex-col items-center p-4 py-6 sm:py-8 font-sans overflow-y-auto">
      <div className="w-full max-w-lg my-auto bg-white rounded-3xl border border-gray-200/80 shadow-md p-5 sm:p-8 space-y-5 sm:space-y-6">
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <img
              src="/brandlogo.png"
              alt="ZUNO Logo"
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EAF4E5] border border-[#22A06B]/30 rounded-full text-xs font-bold text-[#0F5D3A]">
            <ShieldCheck size={14} className="text-[#22A06B]" />
            <span>ZUNO Shop Registration</span>
          </div>
          <h1 className="text-2xl font-black text-[#17231D] tracking-tight">
            Register Your Shop
          </h1>
          <p className="text-xs text-gray-500">
            Join ZUNO to sell groceries and daily essentials nearby in PIN 231217, Renukoot.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          <div
            className={`flex-1 py-1.5 rounded-full text-center text-xs font-bold ${
              step >= 1 ? "bg-[#0F5D3A] text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            1. Owner &amp; Password
          </div>
          <div
            className={`flex-1 py-1.5 rounded-full text-center text-xs font-bold ${
              step >= 2 ? "bg-[#0F5D3A] text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            2. Shop Info
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold text-center leading-relaxed"
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="space-y-4">
            <div>
              <label
                htmlFor="reg-owner-name"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Owner Full Name
              </label>
              <input
                id="reg-owner-name"
                type="text"
                value={ownerFullName}
                onChange={(e) => setOwnerFullName(e.target.value)}
                placeholder="Owner full name"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A] focus:ring-2 focus:ring-[#A7D56B]/50"
                required
              />
            </div>

            <div>
              <label
                htmlFor="reg-phone"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Mobile Number
              </label>
              <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:border-[#0F5D3A] focus-within:ring-2 focus-within:ring-[#A7D56B]/50">
                <span className="bg-[#F8FAF6] px-3 py-2.5 text-sm font-bold text-[#17231D] border-r border-gray-300 select-none">
                  🇮🇳 +91
                </span>
                <input
                  id="reg-phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="flex-1 px-3 py-2.5 text-sm font-bold text-[#17231D] outline-none"
                  maxLength={10}
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="reg-password"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Create Password
              </label>
              <div className="relative rounded-xl border border-gray-300 overflow-hidden focus-within:border-[#0F5D3A] focus-within:ring-2 focus-within:ring-[#A7D56B]/50">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 chars (letters + numbers)"
                  className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] outline-none pr-10"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#17231D] p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Use at least 8 characters including a letter and a number.
              </p>
            </div>

            <div>
              <label
                htmlFor="reg-confirm-password"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Confirm Password
              </label>
              <input
                id="reg-confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A] focus:ring-2 focus:ring-[#A7D56B]/50"
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-sm font-extrabold transition shadow-sm"
            >
              Continue to Shop Details →
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="reg-shop-name"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Shop Name
              </label>
              <input
                id="reg-shop-name"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Agarwal Kirana Store"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A]"
                required
              />
            </div>

            <div>
              <label
                htmlFor="reg-description"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Description / Categories Sold
              </label>
              <input
                id="reg-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Fresh vegetables, fruits, dairy & groceries"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A]"
              />
            </div>

            <div>
              <label
                htmlFor="reg-address"
                className="block text-xs font-bold text-[#17231D] mb-1"
              >
                Address &amp; Locality
              </label>
              <input
                id="reg-address"
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Shop No, Street, Market Name"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none focus:border-[#0F5D3A]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#17231D] mb-1">
                  City / Region
                </label>
                <input
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none bg-[#F8FAF6]"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#17231D] mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] border border-gray-300 rounded-xl outline-none bg-[#F8FAF6]"
                  readOnly
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-[#17231D] rounded-xl text-sm font-bold transition"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] py-3 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-sm font-extrabold transition shadow-sm disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Shop Application"}
              </button>
            </div>
          </form>
        )}

        <div className="pt-2 text-center border-t border-gray-100">
          <Link href="/login" className="text-xs font-semibold text-[#0F5D3A] hover:underline">
            Already registered? Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
