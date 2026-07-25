import type { AdapterStatus } from "./types";
import { facebookAdapter } from "./facebook";
import { shopeeAdapter } from "./shopee";
import { tiktokAdapter } from "./tiktok";

export function getAdapterStatuses(): AdapterStatus[] {
  return [
    {
      platform: "shopee",
      configured: shopeeAdapter.isConfigured(),
      mode: shopeeAdapter.isConfigured() ? "api" : "manual",
      note: shopeeAdapter.isConfigured()
        ? "พร้อมใช้ API (เมื่อ implement แล้ว)"
        : "โหมด manual — ใส่ลิงก์ affiliate Shopee เอง",
    },
    {
      platform: "tiktok_shop",
      configured: tiktokAdapter.isConfigured(),
      mode: tiktokAdapter.isConfigured() ? "api" : "manual",
      note: tiktokAdapter.isConfigured()
        ? "พร้อมใช้ API (เมื่อ implement แล้ว)"
        : "โหมด manual — ใส่ลิงก์ TikTok Shop เอง",
    },
    {
      platform: "facebook",
      configured: facebookAdapter.isConfigured(),
      mode: facebookAdapter.isConfigured() ? "api" : "manual",
      note: "ไม่โพสต์อัตโนมัติ — ต้อง approve draft ก่อนเสมอ",
    },
  ];
}

export { facebookAdapter, shopeeAdapter, tiktokAdapter };
