import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@zuno/config";

export const metadata: Metadata = {
  title: "Help & Frequently Asked Questions — ZUNO Support",
  description:
    "Find answers to common questions about ordering, delivery coverage, participating local shops, and customer safety on ZUNO in Renukoot Central.",
};

const FAQ_SECTIONS = [
  {
    category: "Ordering & Delivery",
    items: [
      {
        question: "Can I place an order directly on this website?",
        answer:
          "No. The public website is designed strictly for local shop discovery, catalog exploration, and checking delivery coverage. To ensure real-time inventory verification and live GPS rider tracking, all orders are placed through the official ZUNO Customer Mobile App.",
      },
      {
        question: "What areas are currently served?",
        answer:
          "ZUNO is actively operational in Renukoot Central (PIN 231217) and adjacent residential colonies in Sonbhadra, Uttar Pradesh. You can test your specific PIN on our Service Area page.",
      },
      {
        question: "How fast is delivery?",
        answer:
          "Because ZUNO operates on a hyperlocal model where delivery partners pick up directly from stores right in your neighborhood, orders typically reach your doorstep within minutes of packaging.",
      },
    ],
  },
  {
    category: "Local Shops & Products",
    items: [
      {
        question: "Are products coming from warehouses or local stores?",
        answer:
          "100% of products come directly from verified independent shops, kirana merchants, and local vegetable and fruit vendors located within your town.",
      },
      {
        question: "Are prices higher than buying in person?",
        answer:
          "ZUNO partners with merchants to maintain fair, transparent local pricing without arbitrary platform markups. Prices reflect the shop’s active inventory catalog.",
      },
      {
        question: "What if an item is temporarily out of stock?",
        answer:
          "Before confirming your order in the mobile app, the system checks real-time inventory. In the rare event of a substitution need, the store will contact you before dispatch.",
      },
    ],
  },
  {
    category: "Safety & Payments",
    items: [
      {
        question: "What payment methods are supported?",
        answer:
          "The Customer App supports Cash on Delivery (COD), UPI (Google Pay, PhonePe, Paytm), and major online payment cards.",
      },
      {
        question: "How does OTP verification protect my delivery?",
        answer:
          "Every order generated in the Customer App produces a unique 4-digit delivery PIN. The delivery partner cannot mark your order as delivered until you physically provide this code, guaranteeing that handovers cannot be falsified.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="py-12 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF4E5] text-[#0F5D3A] text-xs font-bold mb-4">
            Help Center & Knowledge Base
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-[#111827] tracking-tight">
            Frequently Asked <span className="text-[#0F5D3A]">Questions</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#6B7A70] leading-relaxed max-w-2xl mx-auto">
            Everything you need to know about ZUNO’s hyperlocal shopping experience in Renukoot.
          </p>
        </div>

        {/* FAQ Groups */}
        <div className="space-y-10 mb-14">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.category} className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAEFEA] shadow-sm">
              <h2 className="text-xl font-black text-[#111827] mb-6 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0F5D3A]" />
                {section.category}
              </h2>

              <div className="space-y-5">
                {section.items.map((item, idx) => (
                  <div key={idx} className="pb-5 border-b border-[#F4F6F4] last:border-b-0 last:pb-0">
                    <h3 className="font-extrabold text-sm sm:text-base text-[#111827]">
                      {item.question}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#4B5563] leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Assistance Channel Box */}
        <div className="p-8 rounded-3xl bg-[#EAF4E5] border border-[#CDE3C4] text-[#0F5D3A]">
          <h2 className="text-xl font-black text-[#111827] mb-2">Still need assistance?</h2>
          <p className="text-xs sm:text-sm text-[#246142] mb-6 leading-relaxed">
            For operational inquiries or partner support, reach out directly through our verified
            channels. Active customer order support is managed directly within the Customer App.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/80 border border-[#D5E8CE]">
              <span className="text-xs font-bold text-[#6B7A70] block">Toll-Free Partner Helpline</span>
              <span className="text-sm font-extrabold text-[#111827] mt-0.5 block">+918887602317</span>
              <span className="text-[11px] text-[#246142] mt-1 block">Hours: 7:00 AM – 11:00 PM Daily</span>
            </div>

            <div className="p-4 rounded-xl bg-white/80 border border-[#D5E8CE]">
              <span className="text-xs font-bold text-[#6B7A70] block">Partner Desk Email</span>
              <span className="text-sm font-extrabold text-[#111827] mt-0.5 block">zunonearby@gmail.com</span>
              <span className="text-[11px] text-[#246142] mt-1 block">For shop and delivery partner inquiries</span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0F5D3A] text-white hover:bg-[#0B482D] transition shadow-sm"
            >
              View Complete Contact Information →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
