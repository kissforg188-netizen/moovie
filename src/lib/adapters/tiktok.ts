import type { AffiliateAdapter } from "./types";

/**
 * Stub for TikTok Shop Affiliate API — not wired. Use manual mode until keys exist.
 */
export const tiktokShopApiAdapter: AffiliateAdapter = {
  platform: "tiktok_shop",
  mode: "api",
  async listCandidates() {
    throw new Error(
      "TikTok Shop Affiliate API ยังไม่ได้ตั้งค่า — ใช้โหมด manual ใส่สินค้าเอง",
    );
  },
};
