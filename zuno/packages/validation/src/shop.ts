import { z } from "zod";

const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SHOP_WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const shopSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  lat: z.number(),
  lng: z.number(),
});

export const shopDayScheduleSchema = z
  .object({
    enabled: z.boolean(),
    open: z.string().regex(TIME_24H_REGEX, "Use 24-hour HH:MM format.").nullable(),
    close: z.string().regex(TIME_24H_REGEX, "Use 24-hour HH:MM format.").nullable(),
  })
  .strict()
  .superRefine((day, ctx) => {
    if (day.enabled) {
      if (!day.open || !day.close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Opening and closing times are required for open days.",
        });
      } else if (day.open === day.close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Opening and closing times cannot be identical.",
        });
      }
    }
  });

export const shopOpeningHoursSchema = z
  .object({
    monday: shopDayScheduleSchema,
    tuesday: shopDayScheduleSchema,
    wednesday: shopDayScheduleSchema,
    thursday: shopDayScheduleSchema,
    friday: shopDayScheduleSchema,
    saturday: shopDayScheduleSchema,
    sunday: shopDayScheduleSchema,
  })
  .strict();

export function validateOpeningHoursPayload(input: unknown) {
  return shopOpeningHoursSchema.safeParse(input);
}
