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
  title: "เลือกดี — Affiliate Lab",
  description:
    "ระบบทดลอง Affiliate สำหรับ Shopee / TikTok Shop / Facebook แบบมี approval ก่อนโพสต์",
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
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-[var(--ink-soft)]">
          เลือกดี Affiliate Lab — draft ก่อนโพสต์ · มี disclosure · ไม่การันตีรายได้
        </footer>
      </body>
    </html>
  );
}
