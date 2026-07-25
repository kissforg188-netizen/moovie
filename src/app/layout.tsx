import type { Metadata } from "next";
import { Kanit, Sarabun } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "เลือกดี — Affiliate Content Lab",
  description:
    "ระบบทดลองคอนเทนต์ affiliate สำหรับ Shopee, TikTok Shop และ Facebook แบบมี disclosure และต้องอนุมัติก่อนโพสต์",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${kanit.variable} ${sarabun.variable} antialiased`}>
        <div className="shell">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
