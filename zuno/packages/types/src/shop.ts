export type ShopApprovalStatus = "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

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

export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  phone?: string;
  address_line?: string;
  locality?: string;
  pincode?: string;
  is_approved: boolean;
  approval_status?: ShopApprovalStatus;
  is_active: boolean;
  is_delivery_available?: boolean;
  opening_hours?: ShopOpeningHours | null;
  lat: number;
  lng: number;
  service_area_id: string | null;
  created_at: string;
}

export interface ShopMember {
  id: string;
  shop_id: string;
  user_id: string;
  role: "OWNER" | "STAFF";
}
