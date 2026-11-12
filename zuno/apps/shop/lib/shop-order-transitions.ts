export type ShopkeeperNextOrderStatus =
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "REJECTED";

export interface ShopkeeperOrderActionSpec {
  nextStatus: ShopkeeperNextOrderStatus;
  label: string;
  pendingLabel: string;
  tone: "primary" | "info" | "purple" | "danger";
  requiresConfirmation?: boolean;
}

/**
 * Canonical shopkeeper order status transition map matching database trigger
 * `enforce_order_integrity_and_delivery` and UI workflow rules.
 */
export const ALLOWED_SHOPKEEPER_ORDER_TRANSITIONS: Record<
  string,
  readonly ShopkeeperNextOrderStatus[]
> = {
  PLACED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PREPARING"],
  PREPARING: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP: [],
  OUT_FOR_DELIVERY: [],
  DELIVERED: [],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * Checks whether a shopkeeper is allowed to move an order from `currentStatus`
 * to `nextStatus`.
 */
export function isValidShopkeeperOrderTransition(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined
): boolean {
  if (!currentStatus || !nextStatus) return false;
  const allowed = ALLOWED_SHOPKEEPER_ORDER_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(nextStatus as ShopkeeperNextOrderStatus);
}

/**
 * Returns the UI actions permitted for a given order status.
 */
export function getShopkeeperOrderActions(
  currentStatus: string | null | undefined
): ShopkeeperOrderActionSpec[] {
  switch (currentStatus) {
    case "PLACED":
      return [
        {
          nextStatus: "REJECTED",
          label: "Reject Order",
          pendingLabel: "Rejecting...",
          tone: "danger",
          requiresConfirmation: true,
        },
        {
          nextStatus: "ACCEPTED",
          label: "Accept Order",
          pendingLabel: "Accepting...",
          tone: "primary",
        },
      ];
    case "ACCEPTED":
      return [
        {
          nextStatus: "PREPARING",
          label: "Start Preparing",
          pendingLabel: "Updating...",
          tone: "info",
        },
      ];
    case "PREPARING":
      return [
        {
          nextStatus: "READY_FOR_PICKUP",
          label: "Mark Ready for Pickup",
          pendingLabel: "Updating...",
          tone: "purple",
        },
      ];
    default:
      return [];
  }
}

