import type { AffiliateAdapter } from "./types";

/** Stub — wire Shopee Affiliate API when keys are available */
export const shopeeAdapter: AffiliateAdapter = {
  platform: "shopee",
  isConfigured: () => Boolean(process.env.SHOPEE_AFFILIATE_APP_ID),
  async fetchCandidates() {
    throw new Error(
      "Shopee Affiliate API ยังไม่ได้ตั้งค่า — ใช้โหมด manual: เพิ่มสินค้าและลิงก์ด้วยตนเอง"
    );
  },
};
