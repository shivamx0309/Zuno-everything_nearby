"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, HelpCircle, ArrowLeft } from "lucide-react";
import { loginWithPassword, sanitizeRedirectUrl } from "../../features/auth/api";
import { normalizeIndianPhone } from "../../lib/shop-auth-utils";

type LoginViewMode = "LOGIN" | "FORGOT_INFO";

function ShopLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const redirectDestination = sanitizeRedirectUrl(rawRedirect);
  const initialPhone = searchParams.get("phone") || "";

  const [mode, setMode] = useState<LoginViewMode>("LOGIN");
  const [phone, setPhone] = useState(initialPhone.replace(/\D/g, "").slice(-10));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanPhone = phone.replace(/\D/g, "").slice(-10);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneCheck = normalizeIndianPhone(cleanPhone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || "Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await loginWithPassword(phoneCheck.clean10, password, {
        rememberMe,
        redirect: redirectDestination,
      });

      if (!res.success) {
        setError(res.error || "Invalid mobile number or password.");
        setLoading(false);
        return;
      }

      router.refresh();
      router.push(res.redirect || redirectDestination);
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md my-auto bg-white rounded-3xl border border-gray-200/80 shadow-md p-5 sm:p-8 space-y-5 sm:space-y-6">
      {/* ZUNO Official Logo & Portal Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <img
            src="/brandlogo.png"
            alt="ZUNO Logo"
            className="h-9 w-auto object-contain"
          />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EAF4E5] border border-[#22A06B]/30 rounded-full text-xs font-bold text-[#0F5D3A]">
          <ShieldCheck size={14} className="text-[#22A06B]" />
          <span>ZUNO Shopkeeper Portal</span>
        </div>

        <h1 className="text-2xl font-black text-[#17231D] tracking-tight">
          {mode === "LOGIN" ? "Welcome Back" : "Password Assistance"}
        </h1>

        <p className="text-xs text-gray-500 font-medium leading-relaxed">
          {mode === "LOGIN"
            ? "Sign in with your registered mobile number and password to manage your shop."
            : "Administrator-assisted password recovery for ZUNO Shopkeeper accounts."}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold text-center leading-relaxed"
        >
          {error}
        </div>
      )}

      {mode === "LOGIN" ? (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label
              htmlFor="shopkeeper-phone"
              className="block text-xs font-bold text-[#17231D] mb-1"
            >
              Mobile Number
            </label>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:border-[#0F5D3A] focus-within:ring-2 focus-within:ring-[#A7D56B]/50 transition-all">
              <span className="bg-[#F8FAF6] px-3 py-2.5 text-xs sm:text-sm font-bold text-[#17231D] border-r border-gray-300 flex items-center gap-1 select-none">
                🇮🇳 +91
              </span>
              <input
                id="shopkeeper-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                className="flex-1 px-3 py-2.5 text-sm font-bold text-[#17231D] outline-none bg-white"
                maxLength={10}
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="shopkeeper-password"
                className="block text-xs font-bold text-[#17231D]"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("FORGOT_INFO");
                }}
                className="text-xs font-semibold text-[#0F5D3A] hover:text-[#22A06B] hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative rounded-xl border border-gray-300 overflow-hidden focus-within:border-[#0F5D3A] focus-within:ring-2 focus-within:ring-[#A7D56B]/50 transition-all">
              <input
                id="shopkeeper-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2.5 text-sm font-bold text-[#17231D] outline-none pr-10 bg-white"
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
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#0F5D3A] focus:ring-[#0F5D3A]"
            />
            <label
              htmlFor="rememberMe"
              className="text-xs font-semibold text-[#17231D]/80 cursor-pointer select-none"
            >
              Remember Me on this device
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || cleanPhone.length < 10 || !password}
            className="w-full py-3 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-sm font-extrabold transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>{loading ? "Signing In..." : "Sign In →"}</span>
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-[#F8FAF6] border border-[#22A06B]/30 rounded-2xl space-y-2.5 text-left">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#0F5D3A]">
              <HelpCircle size={16} className="text-[#22A06B] flex-shrink-0" />
              <span>Need to set or reset your password?</span>
            </div>
            <p className="text-xs text-[#17231D]/80 leading-relaxed">
              For your security, shopkeeper passwords cannot be reset with only a mobile number or SMS OTP.
            </p>
            <ul className="text-xs text-[#17231D]/80 space-y-1.5 list-disc pl-4 leading-relaxed">
              <li>
                <span className="font-bold text-[#17231D]">Forgotten password or older OTP account:</span>{" "}
                Contact your ZUNO Operations / Support Administrator with your registered mobile number and shop name for identity-verified password setup.
              </li>
              <li>
                <span className="font-bold text-[#17231D]">Already signed in on another device?</span>{" "}
                Open <span className="font-semibold">Store Settings → Account &amp; Security</span> to set a new password directly.
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("LOGIN");
            }}
            className="w-full py-2.5 bg-[#0F5D3A] hover:bg-[#22A06B] text-white rounded-xl text-xs font-extrabold transition shadow-sm flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} />
            <span>Back to Sign In</span>
          </button>
        </div>
      )}

      {/* Registration Link */}
      <div className="pt-4 border-t border-gray-100 text-center space-y-2">
        <p className="text-xs text-gray-500">Want to sell your products on ZUNO?</p>
        <Link
          href="/register"
          className="inline-block px-4 py-2 bg-[#EAF4E5] hover:bg-[#A7D56B]/40 text-[#0F5D3A] text-xs font-bold rounded-xl transition"
        >
          Register New Shop
        </Link>
      </div>
    </div>
  );
}

export default function ShopLoginPage() {
  return (
    <div className="min-h-screen bg-[#F8FAF6] flex flex-col items-center p-4 py-6 sm:py-8 font-sans overflow-y-auto">
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs text-gray-500 font-medium">
            Loading login portal...
          </div>
        }
      >
        <ShopLoginForm />
      </Suspense>
    </div>
  );
}
