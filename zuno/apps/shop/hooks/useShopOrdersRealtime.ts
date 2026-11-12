"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "../lib/supabase";

export type RealtimeConnectionStatus =
  | "IDLE"
  | "CONNECTING"
  | "SUBSCRIBED"
  | "ERROR";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Subscribes to Supabase Realtime `postgres_changes` on `public.orders`
 * strictly filtered to the authenticated shopkeeper's `shop_id`.
 * Handles cleanup on unmount, debounces bursts, and fails safely when
 * Realtime is unavailable so manual refresh keeps working.
 */
export function useShopOrdersRealtime(
  shopId: string | null | undefined,
  onOrderChange: () => void | Promise<void>
): { status: RealtimeConnectionStatus } {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("IDLE");
  const callbackRef = useRef(onOrderChange);
  callbackRef.current = onOrderChange;

  useEffect(() => {
    if (!shopId || !UUID_REGEX.test(shopId)) {
      setStatus("IDLE");
      return;
    }

    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;

    try {
      setStatus("CONNECTING");
      supabase = createClient();

      // Deterministic shop-scoped channel name with instance suffix prevents collision on StrictMode remounts
      const instanceSuffix = Math.random().toString(36).slice(2, 8);
      channel = supabase
        .channel(`shop-orders-${shopId}-${instanceSuffix}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload: any) => {
            if (!isMounted) return;
            // Defense-in-depth: ignore any payload whose new record belongs to another shop
            const incomingShopId = payload?.new?.shop_id;
            if (incomingShopId && incomingShopId !== shopId) {
              return;
            }
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
              if (isMounted) {
                void callbackRef.current();
              }
            }, 250);
          }
        )
        .subscribe((subStatus: string) => {
          if (!isMounted) return;
          if (subStatus === "SUBSCRIBED") {
            setStatus("SUBSCRIBED");
          } else if (
            subStatus === "CHANNEL_ERROR" ||
            subStatus === "TIMED_OUT"
          ) {
            setStatus("ERROR");
          } else if (subStatus === "CLOSED") {
            setStatus("IDLE");
          }
        });
    } catch {
      if (isMounted) {
        setStatus("ERROR");
      }
    }

    return () => {
      isMounted = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (supabase && channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [shopId]);

  return { status };
}

