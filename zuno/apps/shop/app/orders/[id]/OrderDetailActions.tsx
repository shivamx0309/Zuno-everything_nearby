"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Boxes,
  Check,
  CheckCircle2,
  Package,
  XCircle,
} from "lucide-react";
import RejectOrderDialog from "../../../components/RejectOrderDialog";
import { updateShopOrderStatusAction } from "../../../features/orders/api";
import {
  getShopkeeperOrderActions,
  ShopkeeperNextOrderStatus,
} from "../../../lib/shop-order-transitions";

export interface OrderDetailActionsProps {
  orderId: string;
  orderDisplayId: string;
  customerName: string;
  currentStatus: string;
}

function getActionButtonClass(tone: "primary" | "info" | "purple" | "danger") {
  switch (tone) {
    case "primary":
      return "bg-[#0F5D3A] hover:bg-[#22A06B] text-white shadow-sm";
    case "info":
      return "bg-blue-600 hover:bg-blue-700 text-white shadow-sm";
    case "purple":
      return "bg-purple-600 hover:bg-purple-700 text-white shadow-sm";
    case "danger":
      return "bg-white hover:bg-red-50 text-red-600 border border-red-200";
  }
}

function renderActionIcon(nextStatus: ShopkeeperNextOrderStatus) {
  switch (nextStatus) {
    case "ACCEPTED":
      return <Check size={14} strokeWidth={2.2} />;
    case "PREPARING":
      return <Package size={14} strokeWidth={2} />;
    case "READY_FOR_PICKUP":
      return <Boxes size={14} strokeWidth={2} />;
    case "REJECTED":
      return <XCircle size={14} strokeWidth={2} />;
  }
}

function getReadOnlyStatusBanner(status: string): string | null {
  switch (status) {
    case "READY_FOR_PICKUP":
      return "Packed and awaiting delivery partner pickup. No further shopkeeper action is required.";
    case "OUT_FOR_DELIVERY":
      return "Order is out for delivery with the assigned rider.";
    case "DELIVERED":
    case "COMPLETED":
      return "Order has been delivered successfully (read-only).";
    case "REJECTED":
      return "This order was rejected (read-only).";
    case "CANCELLED":
      return "This order was cancelled (read-only).";
    default:
      return null;
  }
}

export default function OrderDetailActions({
  orderId,
  orderDisplayId,
  customerName,
  currentStatus,
}: OrderDetailActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [submittingStatus, setSubmittingStatus] =
    useState<ShopkeeperNextOrderStatus | null>(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const actions = getShopkeeperOrderActions(status);
  const readOnlyMessage = getReadOnlyStatusBanner(status);

  const executeStatusUpdate = async (nextStatus: ShopkeeperNextOrderStatus) => {
    if (submittingStatus) return;
    setSubmittingStatus(nextStatus);
    setFeedback(null);
    setRejectError(null);

    try {
      const res = await updateShopOrderStatusAction(orderId, nextStatus);
      setStatus(nextStatus);
      setFeedback({
        type: "success",
        text: res.message || `Order status updated to ${nextStatus}.`,
      });
      if (nextStatus === "REJECTED") {
        setConfirmRejectOpen(false);
      }
      router.refresh();
    } catch (err: any) {
      const msg = err?.message || `Failed to update order to ${nextStatus}.`;
      if (nextStatus === "REJECTED" && confirmRejectOpen) {
        setRejectError(msg);
      } else {
        setFeedback({ type: "error", text: msg });
      }
    } finally {
      setSubmittingStatus(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-gray-100">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "error" ? (
              <AlertCircle size={15} className="text-red-600 flex-shrink-0" />
            ) : (
              <CheckCircle2
                size={15}
                className="text-emerald-700 flex-shrink-0"
              />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-gray-500 font-medium">
          {readOnlyMessage || "Advance order processing step:"}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((act) => {
              const isPending = submittingStatus === act.nextStatus;
              return (
                <button
                  key={act.nextStatus}
                  type="button"
                  disabled={Boolean(submittingStatus)}
                  onClick={() => {
                    if (act.requiresConfirmation) {
                      setRejectError(null);
                      setConfirmRejectOpen(true);
                    } else {
                      void executeStatusUpdate(act.nextStatus);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition disabled:opacity-50 ${getActionButtonClass(
                    act.tone
                  )}`}
                >
                  {renderActionIcon(act.nextStatus)}
                  <span>{isPending ? act.pendingLabel : act.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <RejectOrderDialog
        open={confirmRejectOpen}
        orderDisplayId={orderDisplayId}
        customerName={customerName}
        isSubmitting={submittingStatus === "REJECTED"}
        error={rejectError}
        onConfirm={() => void executeStatusUpdate("REJECTED")}
        onCancel={() => {
          if (!submittingStatus) {
            setConfirmRejectOpen(false);
            setRejectError(null);
          }
        }}
      />
    </div>
  );
}

