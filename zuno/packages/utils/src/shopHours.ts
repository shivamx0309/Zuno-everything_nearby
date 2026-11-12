export type ShopWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface ShopDaySchedule {
  enabled: boolean;
  open: string | null;
  close: string | null;
}

export type ShopOpeningHours = Record<ShopWeekday, ShopDaySchedule>;

export const ZUNO_BUSINESS_TIMEZONE = "Asia/Kolkata";

export const SHOP_WEEKDAYS: readonly ShopWeekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const WEEKDAY_LABELS: Record<ShopWeekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const WEEKDAY_SHORT_LABELS: Record<ShopWeekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function createDefaultShopOpeningHours(): ShopOpeningHours {
  return {
    monday: { enabled: true, open: "08:00", close: "21:00" },
    tuesday: { enabled: true, open: "08:00", close: "21:00" },
    wednesday: { enabled: true, open: "08:00", close: "21:00" },
    thursday: { enabled: true, open: "08:00", close: "21:00" },
    friday: { enabled: true, open: "08:00", close: "21:00" },
    saturday: { enabled: true, open: "08:00", close: "21:00" },
    sunday: { enabled: true, open: "08:00", close: "21:00" },
  };
}

export const DEFAULT_SHOP_OPENING_HOURS: ShopOpeningHours =
  createDefaultShopOpeningHours();

export function isValidTime24h(value: unknown): value is string {
  return typeof value === "string" && TIME_24H_REGEX.test(value.trim());
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!isValidTime24h(timeStr)) return null;
  const trimmed = timeStr.trim();
  const [hh, mm] = trimmed.split(":").map((part) => Number(part));
  return hh * 60 + mm;
}

export type OpeningHoursValidationResult =
  | {
      valid: true;
      data: ShopOpeningHours;
    }
  | {
      valid: false;
      error: string;
      dayErrors: Partial<Record<ShopWeekday, string>>;
    };

/**
 * Strictly validates and normalizes a weekly ShopOpeningHours payload.
 * Supports 24-hour HH:MM open/close pairs, closed days, and overnight/midnight shifts (open > close).
 */
export function validateShopOpeningHours(
  input: unknown
): OpeningHoursValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      error: "Opening hours must be a valid weekly schedule object.",
      dayErrors: {},
    };
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const dayErrors: Partial<Record<ShopWeekday, string>> = {};

  for (const key of keys) {
    if (!SHOP_WEEKDAYS.includes(key as ShopWeekday)) {
      return {
        valid: false,
        error: `Unexpected weekday key "${key}" in opening hours.`,
        dayErrors: {},
      };
    }
  }

  const normalized = {} as ShopOpeningHours;

  for (const day of SHOP_WEEKDAYS) {
    const rawDay = record[day];
    if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) {
      dayErrors[day] = `${WEEKDAY_LABELS[day]}: schedule entry is missing or invalid.`;
      continue;
    }

    const dayObj = rawDay as Record<string, unknown>;
    for (const prop of Object.keys(dayObj)) {
      if (prop !== "enabled" && prop !== "open" && prop !== "close") {
        dayErrors[day] = `${WEEKDAY_LABELS[day]}: unexpected field "${prop}".`;
      }
    }
    if (dayErrors[day]) continue;

    if (typeof dayObj.enabled !== "boolean") {
      dayErrors[day] = `${WEEKDAY_LABELS[day]}: open/closed flag must be a boolean.`;
      continue;
    }

    if (!dayObj.enabled) {
      normalized[day] = { enabled: false, open: null, close: null };
      continue;
    }

    const openRaw = typeof dayObj.open === "string" ? dayObj.open.trim() : "";
    const closeRaw = typeof dayObj.close === "string" ? dayObj.close.trim() : "";

    if (!isValidTime24h(openRaw) || !isValidTime24h(closeRaw)) {
      dayErrors[day] = `${WEEKDAY_LABELS[day]}: use 24-hour HH:MM format (e.g. 08:00 and 21:00).`;
      continue;
    }

    if (openRaw === closeRaw) {
      dayErrors[day] = `${WEEKDAY_LABELS[day]}: opening and closing time cannot be the same.`;
      continue;
    }

    normalized[day] = {
      enabled: true,
      open: openRaw,
      close: closeRaw,
    };
  }

  const errorDays = Object.keys(dayErrors) as ShopWeekday[];
  if (errorDays.length > 0) {
    return {
      valid: false,
      error: dayErrors[errorDays[0]] || "Invalid opening hours schedule.",
      dayErrors,
    };
  }

  return { valid: true, data: normalized };
}

/**
 * Normalizes potentially null/legacy opening hours for shopkeeper editor state.
 */
export function normalizeShopOpeningHoursForEditor(
  input: unknown
): ShopOpeningHours {
  const parsed = validateShopOpeningHours(input);
  if (parsed.valid) {
    return parsed.data;
  }
  return createDefaultShopOpeningHours();
}

/**
 * Extracts weekday key and minutes since midnight in Asia/Kolkata (+05:30 IST),
 * independent of the host/browser/device local timezone.
 */
export function getZunoBusinessTimeParts(at: Date = new Date()): {
  weekday: ShopWeekday;
  previousWeekday: ShopWeekday;
  minutesSinceMidnight: number;
} {
  // IST has no DST and is fixed UTC+05:30 (+330 minutes). Computing from UTC epoch
  // avoids runtime differences on mobile Hermes engines lacking full ICU tzdata.
  const istEpochMs = at.getTime() + 330 * 60 * 1000;
  const istDate = new Date(istEpochMs);

  // JS getUTCDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const jsDay = istDate.getUTCDay();
  const weekdayIndex = (jsDay + 6) % 7; // 0 = monday ... 6 = sunday
  const prevWeekdayIndex = (weekdayIndex + 6) % 7;

  return {
    weekday: SHOP_WEEKDAYS[weekdayIndex],
    previousWeekday: SHOP_WEEKDAYS[prevWeekdayIndex],
    minutesSinceMidnight: istDate.getUTCHours() * 60 + istDate.getUTCMinutes(),
  };
}

export function formatOpeningHoursDaySummary(day: ShopDaySchedule): string {
  if (!day.enabled || !day.open || !day.close) {
    return "Closed";
  }
  const openMin = parseTimeToMinutes(day.open);
  const closeMin = parseTimeToMinutes(day.close);
  if (openMin !== null && closeMin !== null && closeMin < openMin) {
    return closeMin === 0
      ? `${day.open} – 00:00 (Midnight)`
      : `${day.open} – ${day.close} (+1 day)`;
  }
  return `${day.open} – ${day.close}`;
}

export type ShopAvailabilityReason =
  | "OPEN"
  | "SHOP_OFFLINE"
  | "DELIVERY_PAUSED"
  | "SCHEDULE_CLOSED"
  | "INVALID_SCHEDULE";

export interface ShopAvailabilityInput {
  isActive?: boolean | null;
  isDeliveryAvailable?: boolean | null;
  openingHours?: ShopOpeningHours | unknown | null;
}

export interface ShopAvailabilityEvaluation {
  isActive: boolean;
  isDeliveryAvailable: boolean;
  hasConfiguredSchedule: boolean;
  isScheduleValid: boolean;
  isOpenNow: boolean;
  canAcceptDeliveryOrder: boolean;
  openStatusLabel: string;
  deliveryStatusLabel: string;
  todayHoursText: string;
  reasonCode: ShopAvailabilityReason;
  blockingMessage: string | null;
}

/**
 * Evaluates current live storefront availability in Asia/Kolkata (IST) timezone.
 *
 * Rules:
 * - is_active = false => Store offline (overrides schedule & delivery).
 * - openingHours null/undefined (legacy) => treated as open when active (hours not configured).
 * - openingHours non-null invalid/corrupted => fail-closed (isOpenNow = false).
 * - openingHours valid => evaluated in Asia/Kolkata with overnight/midnight boundary support.
 * - is_delivery_available = false => Shop stays discoverable/browsable, but delivery orders are blocked.
 */
export function evaluateShopAvailability(
  input: ShopAvailabilityInput,
  at: Date = new Date()
): ShopAvailabilityEvaluation {
  const isActive = input.isActive !== false;
  const isDeliveryAvailable = input.isDeliveryAvailable !== false;

  if (!isActive) {
    return {
      isActive: false,
      isDeliveryAvailable,
      hasConfiguredSchedule: input.openingHours != null,
      isScheduleValid: true,
      isOpenNow: false,
      canAcceptDeliveryOrder: false,
      openStatusLabel: "Offline",
      deliveryStatusLabel: "Store Offline",
      todayHoursText: "Store currently offline",
      reasonCode: "SHOP_OFFLINE",
      blockingMessage: "This shop is currently offline and not accepting orders.",
    };
  }

  if (input.openingHours == null) {
    const canAccept = isDeliveryAvailable;
    return {
      isActive: true,
      isDeliveryAvailable,
      hasConfiguredSchedule: false,
      isScheduleValid: true,
      isOpenNow: true,
      canAcceptDeliveryOrder: canAccept,
      openStatusLabel: "Open",
      deliveryStatusLabel: isDeliveryAvailable
        ? "Delivery Available"
        : "Delivery Temporarily Paused",
      todayHoursText: "Hours not set",
      reasonCode: isDeliveryAvailable ? "OPEN" : "DELIVERY_PAUSED",
      blockingMessage: isDeliveryAvailable
        ? null
        : "Delivery is temporarily paused by this shop.",
    };
  }

  const parsed = validateShopOpeningHours(input.openingHours);
  if (!parsed.valid) {
    return {
      isActive: true,
      isDeliveryAvailable,
      hasConfiguredSchedule: true,
      isScheduleValid: false,
      isOpenNow: false,
      canAcceptDeliveryOrder: false,
      openStatusLabel: "Closed",
      deliveryStatusLabel: "Schedule Unavailable",
      todayHoursText: "Schedule unavailable",
      reasonCode: "INVALID_SCHEDULE",
      blockingMessage: "Shop opening schedule is currently unavailable.",
    };
  }

  const { weekday, previousWeekday, minutesSinceMidnight } =
    getZunoBusinessTimeParts(at);
  const todaySlot = parsed.data[weekday];
  const prevSlot = parsed.data[previousWeekday];

  let isOpenNow = false;

  if (todaySlot.enabled && todaySlot.open && todaySlot.close) {
    const openMin = parseTimeToMinutes(todaySlot.open)!;
    const closeMin = parseTimeToMinutes(todaySlot.close)!;
    if (openMin < closeMin) {
      if (minutesSinceMidnight >= openMin && minutesSinceMidnight < closeMin) {
        isOpenNow = true;
      }
    } else if (openMin > closeMin) {
      // Overnight / midnight boundary: open from todaySlot.open until midnight
      if (minutesSinceMidnight >= openMin) {
        isOpenNow = true;
      }
    }
  }

  if (!isOpenNow && prevSlot.enabled && prevSlot.open && prevSlot.close) {
    const prevOpenMin = parseTimeToMinutes(prevSlot.open)!;
    const prevCloseMin = parseTimeToMinutes(prevSlot.close)!;
    if (prevOpenMin > prevCloseMin && minutesSinceMidnight < prevCloseMin) {
      // Carry-over from yesterday's overnight schedule
      isOpenNow = true;
    }
  }

  const todayHoursText = todaySlot.enabled
    ? formatOpeningHoursDaySummary(todaySlot)
    : "Closed today";

  if (!isOpenNow) {
    return {
      isActive: true,
      isDeliveryAvailable,
      hasConfiguredSchedule: true,
      isScheduleValid: true,
      isOpenNow: false,
      canAcceptDeliveryOrder: false,
      openStatusLabel: "Closed",
      deliveryStatusLabel: "Currently Closed",
      todayHoursText,
      reasonCode: "SCHEDULE_CLOSED",
      blockingMessage: "This shop is currently closed according to its opening hours.",
    };
  }

  if (!isDeliveryAvailable) {
    return {
      isActive: true,
      isDeliveryAvailable: false,
      hasConfiguredSchedule: true,
      isScheduleValid: true,
      isOpenNow: true,
      canAcceptDeliveryOrder: false,
      openStatusLabel: "Open",
      deliveryStatusLabel: "Delivery Temporarily Paused",
      todayHoursText,
      reasonCode: "DELIVERY_PAUSED",
      blockingMessage: "Delivery is temporarily paused by this shop.",
    };
  }

  return {
    isActive: true,
    isDeliveryAvailable: true,
    hasConfiguredSchedule: true,
    isScheduleValid: true,
    isOpenNow: true,
    canAcceptDeliveryOrder: true,
    openStatusLabel: "Open",
    deliveryStatusLabel: "Delivery Available",
    todayHoursText,
    reasonCode: "OPEN",
    blockingMessage: null,
  };
}
