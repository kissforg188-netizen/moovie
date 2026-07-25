import type { Metadata } from "next";
import { Cormorant_Garamond, Sarabun } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Sarabun({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "เลือกดี — Office Workflow Lab",
  description:
    "แดชบอร์ดออฟฟิศการ์ตูนดู workflow แต่ละแผนก พร้อม Affiliate Lab แบบมี approval ก่อนโพสต์",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-[var(--ink-soft)]">
          เลือกดี Office Lab — workflow การ์ตูน · Affiliate draft ก่อนโพสต์ · ไม่การันตีรายได้
        </footer>
      </body>
    </html>
  );
}
