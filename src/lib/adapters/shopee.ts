import type { AffiliateAdapter } from "./types";

/**
 * Stub for Shopee Affiliate API — not wired. Use manual mode until keys exist.
 */
export const shopeeApiAdapter: AffiliateAdapter = {
  platform: "shopee",
  mode: "api",
  async listCandidates() {
    throw new Error(
      "Shopee Affiliate API ยังไม่ได้ตั้งค่า — ใช้โหมด manual ใส่สินค้าเอง",
    );
  },
};
