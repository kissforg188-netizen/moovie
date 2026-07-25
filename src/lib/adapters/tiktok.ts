import type { AffiliateAdapter } from "./types";

/** Stub — wire TikTok Shop Affiliate API when keys are available */
export const tiktokAdapter: AffiliateAdapter = {
  platform: "tiktok_shop",
  isConfigured: () => Boolean(process.env.TIKTOK_SHOP_AFFILIATE_TOKEN),
  async fetchCandidates() {
    throw new Error(
      "TikTok Shop Affiliate API ยังไม่ได้ตั้งค่า — ใช้โหมด manual: เพิ่มสินค้าและลิงก์ด้วยตนเอง"
    );
  },
};
