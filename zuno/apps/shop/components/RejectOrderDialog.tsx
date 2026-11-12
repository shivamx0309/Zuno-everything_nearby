"use client";

import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface RejectOrderDialogProps {
  open: boolean;
  orderDisplayId: string;
  customerName?: string;
  isSubmitting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RejectOrderDialog({
  open,
  orderDisplayId,
  customerName,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: RejectOrderDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isSubmitting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-order-dialog-title"
    >
      <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} strokeWidth={2} />
            </div>
            <div>
              <h3
                id="reject-order-dialog-title"
                className="font-black text-base text-[#17231D]"
              >
                Reject Order {orderDisplayId}?
              </h3>
              {customerName && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Customer: {customerName}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close confirmation dialog"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed bg-[#F8FAF6] border border-gray-200 rounded-xl p-3.5">
          Rejecting an order is permanent and cannot be undone. The customer will be notified right away that the shop could not fulfill this order.
        </p>

        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition disabled:opacity-50"
          >
            Keep Order
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? "Rejecting Order..." : "Confirm Reject Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

