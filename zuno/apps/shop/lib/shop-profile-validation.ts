import { z } from "zod";
import { normalizeIndianPhone } from "./shop-auth-utils";

export interface ShopProfileUpdateInput {
  name: string;
  description?: string;
  phone: string;
  addressLine: string;
  locality: string;
}

export interface ValidatedShopProfileData {
  name: string;
  description: string;
  phone: string;
  addressLine: string;
  locality: string;
}

export type ShopProfileValidationResult =
  | {
      success: true;
      data: ValidatedShopProfileData;
    }
  | {
      success: false;
      error: string;
      fieldErrors: Record<string, string>;
    };

const shopProfileSchema = z
  .object({
    name: z
      .string({ required_error: "Shop name is required." })
      .transform((v) => v.trim())
      .refine((v) => v.length >= 2, "Shop name must be at least 2 characters.")
      .refine((v) => v.length <= 100, "Shop name must not exceed 100 characters."),
    description: z
      .string()
      .optional()
      .default("")
      .transform((v) => (v || "").trim())
      .refine((v) => v.length <= 500, "Shop description must not exceed 500 characters."),
    phone: z
      .string({ required_error: "Mobile number is required." })
      .transform((v) => v.trim()),
    addressLine: z
      .string({ required_error: "Shop address is required." })
      .transform((v) => v.trim())
      .refine((v) => v.length >= 3, "Shop address must be at least 3 characters.")
      .refine((v) => v.length <= 250, "Shop address must not exceed 250 characters."),
    locality: z
      .string({ required_error: "Locality is required." })
      .transform((v) => v.trim())
      .refine((v) => v.length >= 2, "Locality must be at least 2 characters.")
      .refine((v) => v.length <= 100, "Locality must not exceed 100 characters."),
  })
  .superRefine((val, ctx) => {
    const normalized = normalizeIndianPhone(val.phone);
    if (!normalized.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message:
          normalized.error ||
          "Please enter a valid 10-digit Indian mobile number.",
      });
    }
  });

/**
 * Validates and normalizes shopkeeper profile update inputs server-side.
 * Never trusts client HTML validation attributes.
 */
export function validateShopProfileUpdate(
  input: unknown
): ShopProfileValidationResult {
  const parsed = shopProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] || "form");
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid shop profile details.",
      fieldErrors,
    };
  }

  const normalizedPhone = normalizeIndianPhone(parsed.data.phone);
  if (!normalizedPhone.valid) {
    return {
      success: false,
      error: normalizedPhone.error || "Please enter a valid 10-digit Indian mobile number.",
      fieldErrors: {
        phone:
          normalizedPhone.error ||
          "Please enter a valid 10-digit Indian mobile number.",
      },
    };
  }

  return {
    success: true,
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      phone: normalizedPhone.e164,
      addressLine: parsed.data.addressLine,
      locality: parsed.data.locality,
    },
  };
}

