import type { SocialPublisher } from "./types";

/**
 * Stub for Meta/Facebook Graph API.
 * Auto-post is intentionally disabled — drafts require human approval.
 */
export const facebookPublisher: SocialPublisher = {
  platform: "facebook",
  canAutoPost: false,
  reason:
    "ระบบสร้าง draft เท่านั้น ต้อง Approve แล้วโพสต์ด้วยมือ (หรือต่อ Meta API ภายหลังแบบมี approval gate)",
};
