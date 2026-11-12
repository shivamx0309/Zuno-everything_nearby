import { rawPhoneSchema, normalizePhoneE164 } from "@zuno/validation";

export const REMEMBER_ME_COOKIE = "zuno_remember_me";
export const PERSISTENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface NormalizedIndianPhoneResult {
  valid: boolean;
  clean10: string;
  e164: string;
  error?: string;
}

/**
 * Normalizes an Indian mobile number input (10-digit, 0-prefixed, or +91/91-prefixed)
 * and validates it against @zuno/validation rawPhoneSchema (/^[6-9]\d{9}$/).
 */
export function normalizeIndianPhone(input: string): NormalizedIndianPhoneResult {
  const digits = (input || "").replace(/\D/g, "");
  let clean10 = "";

  if (digits.length === 10) {
    clean10 = digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    clean10 = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    clean10 = digits.slice(1);
  } else {
    return {
      valid: false,
      clean10: "",
      e164: "",
      error: "Please enter a valid 10-digit Indian mobile number.",
    };
  }

  const parsed = rawPhoneSchema.safeParse(clean10);
  if (!parsed.success) {
    return {
      valid: false,
      clean10: "",
      e164: "",
      error: "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
    };
  }

  return {
    valid: true,
    clean10,
    e164: normalizePhoneE164(clean10),
  };
}

/**
 * Derives the shopkeeper synthetic email identities from a validated 10-digit mobile number.
 * - primary: matches public.register_shop_application RPC ('shop_' || regexp_replace('+91...', '\D', '', 'g') || '@zuno.in')
 * - legacy: matches 10-digit synthetic format ('shop_<10-digit>@zuno.in')
 */
export function deriveShopkeeperSyntheticEmails(clean10: string): {
  primary: string;
  legacy: string;
  candidates: string[];
} {
  const primary = `shop_91${clean10}@zuno.in`;
  const legacy = `shop_${clean10}@zuno.in`;
  return {
    primary,
    legacy,
    candidates: [primary, legacy],
  };
}

/**
 * Validates new shopkeeper password policy (minimum 8 chars, at least one letter and one digit).
 */
export function validateShopkeeperPassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (typeof password !== "string" || password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters long.",
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: "Password must not exceed 128 characters.",
    };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      error: "Password must include at least one letter and one number.",
    };
  }
  return { valid: true };
}

/**
 * Sanitizes redirect destination to prevent open redirect vulnerabilities.
 * Strictly requires root-relative paths without protocol schemes or directory escapes.
 */
export function sanitizeRedirectUrl(url: string | null | undefined): string {
  if (!url) return "/dashboard";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes(":")
  ) {
    return trimmed;
  }
  return "/dashboard";
}

/**
 * Applies Remember Me persistence policy to cookie attributes.
 * - rememberMe true: 30-day persistent cookie
 * - rememberMe false: session-scoped cookie (no maxAge or expires)
 */
export function applyRememberMeCookieOptions(
  options: Record<string, any> | undefined,
  rememberMe: boolean
): Record<string, any> {
  const base = { ...(options || {}) };
  if (!rememberMe) {
    delete base.maxAge;
    delete base.expires;
    return base;
  }
  return {
    ...base,
    maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
  };
}

export function isNetworkOrUpstreamError(error: any): boolean {
  const status = error?.status;
  const name = (error?.name || "").toLowerCase();
  const message = (error?.message || "").toLowerCase();
  return (
    status === 0 ||
    name.includes("retryablefetch") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("enetunreach") ||
    message.includes("econnrefused") ||
    message.includes("etimedout")
  );
}

