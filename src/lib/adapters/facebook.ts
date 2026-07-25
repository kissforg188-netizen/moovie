import type { AffiliateAdapter } from "./types";

/**
 * Stub for Meta/Facebook publishing.
 * Intentionally does NOT auto-post. Future API should only publish after explicit approval.
 */
export const facebookAdapter: AffiliateAdapter = {
  platform: "facebook",
  isConfigured: () => Boolean(process.env.META_PAGE_ACCESS_TOKEN),
  async fetchCandidates() {
    throw new Error(
      "Facebook/Meta API ยังไม่ได้ตั้งค่า — สร้าง draft ในระบบแล้วคัดลอกไปโพสต์เองหลัง approve"
    );
  },
};
