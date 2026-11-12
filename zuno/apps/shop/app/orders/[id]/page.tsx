import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ShopLayoutShell from "../../../components/ShopLayoutShell";
import OrderDetailActions from "./OrderDetailActions";
import { getShopOrdersAction } from "../../../features/orders/actions";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { shop, orders, pendingCount, error } = await getShopOrdersAction();

  if (error) {
    return (
      <ShopLayoutShell
        shop={shop}
        pendingOrdersCount={pendingCount}
        title="Order Details"
        subtitle="Unable to load order information"
        actions={
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0F5D3A] bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
          >
            <ArrowLeft size={14} />
            <span>Back to Orders</span>
          </Link>
        }
      >
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3"
        >
          <h2 className="text-sm font-extrabold text-red-900">
            Could Not Load Order Details
          </h2>
          <p className="text-xs text-red-700">{error}</p>
          <Link
            href="/orders"
            className="inline-block px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition"
          >
            Return to Orders
          </Link>
        </div>
      </ShopLayoutShell>
    );
  }

  const order = orders.find((o) => o.id === params.id);

  if (!order) {
    notFound();
  }

  return (
    <ShopLayoutShell
      shop={shop}
      pendingOrdersCount={pendingCount}
      title={`Order ${order.displayId}`}
      subtitle={`Placed ${order.timeAgo} • Status: ${order.status}`}
      actions={
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0F5D3A] bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
        >
          <ArrowLeft size={14} />
          <span>Back to Orders</span>
        </Link>
      }
    >
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-[#17231D]">{order.displayId}</h2>
            <p className="text-xs text-gray-500 mt-1">
              Placed on {new Date(order.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
              {order.status}
            </span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-700">
              {order.paymentMethod} • {order.paymentStatus}
            </span>
          </div>
        </div>

        <OrderDetailActions
          orderId={order.id}
          orderDisplayId={order.displayId}
          customerName={order.customerName}
          currentStatus={order.status}
        />

        {/* Customer & Delivery */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customer Information</h3>
            <p className="text-sm font-bold text-gray-900">{order.customerName}</p>
            {order.customerPhone && <p className="text-xs text-gray-600">Phone: {order.customerPhone}</p>}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Delivery Address</h3>
            <p className="text-xs text-gray-700 leading-relaxed">{order.deliveryAddress || "Renukoot, PIN 231217"}</p>
            {order.deliveryPartner && (
              <p className="text-xs text-emerald-700 font-bold mt-2">
                Rider: {order.deliveryPartner.fullName} ({order.deliveryPartner.vehicleNumber})
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="space-y-3">
          <h3 className="text-sm font-black text-gray-900">Ordered Items ({order.items.length})</h3>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Item</th>
                  <th className="py-2.5 px-4 text-center">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 px-4 font-bold text-gray-900">{item.productName}</td>
                    <td className="py-3 px-4 text-center text-gray-600">{item.quantity} {item.unit}</td>
                    <td className="py-3 px-4 text-right text-gray-600">₹{item.unitPrice}</td>
                    <td className="py-3 px-4 text-right font-black text-gray-900">₹{item.totalPrice}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/70 border-t border-gray-200 font-bold text-xs">
                <tr>
                  <td colSpan={3} className="py-2 px-4 text-right text-gray-600">Subtotal</td>
                  <td className="py-2 px-4 text-right">₹{order.subtotal}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-2 px-4 text-right text-gray-600">Delivery Fee</td>
                  <td className="py-2 px-4 text-right">₹{order.deliveryFee}</td>
                </tr>
                <tr className="text-sm font-black text-[#0F5D3A]">
                  <td colSpan={3} className="py-3 px-4 text-right">Total Amount</td>
                  <td className="py-3 px-4 text-right">₹{order.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </ShopLayoutShell>
  );
}
