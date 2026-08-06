import type { AccountStatus } from "./types";

export const DEFAULT_ACCOUNTS: AccountStatus[] = [
  {
    key: "shopee_affiliate",
    label: "Shopee Affiliate",
    platform: "shopee",
    whenToLogin: "ก่อนหาสินค้า / สร้างลิงก์",
    purpose: "เข้าศูนย์ Affiliate เพื่อค้นของและคัดลอกลิงก์คอมมิชชัน",
    status: "not_ready",
    loginUrl: "https://affiliate.shopee.co.th/",
    signupUrl: "https://shopee.co.th/m/affiliate-influencer",
    loginCta: "เปิด Shopee Affiliate",
  },
  {
    key: "tiktok_shop_affiliate",
    label: "TikTok Shop Affiliate",
    platform: "tiktok",
    whenToLogin: "ก่อนหาสินค้า / สร้างลิงก์",
    purpose: "เข้า Affiliate Creator เพื่อสมัคร/ผูกบัญชีและเลือกสินค้า",
    status: "not_ready",
    loginUrl: "https://affiliate.tiktok.com/th",
    signupUrl: "https://affiliate.tiktok.com/",
    loginCta: "เปิด TikTok Affiliate",
  },
  {
    key: "tiktok_app",
    label: "แอป TikTok (โพสต์)",
    platform: "tiktok",
    whenToLogin: "หลัง Approve แล้ว ตอนโพสต์จริง",
    purpose: "ลงคลิป/แคปชันด้วยมือ — ระบบไม่โพสต์แทน",
    status: "not_ready",
    loginUrl: "https://www.tiktok.com/login",
    signupUrl: "https://www.tiktok.com/tiktokstudio",
    loginCta: "Login TikTok",
  },
  {
    key: "facebook",
    label: "Facebook Page/Group",
    platform: "facebook",
    whenToLogin: "หลัง Approve แล้ว ตอนโพสต์จริง",
    purpose: "โพสต์ Page / Group / Reels ด้วยมือหลังตรวจ caption",
    status: "not_ready",
    loginUrl: "https://www.facebook.com/login",
    signupUrl: "https://www.facebook.com/pages/?category=your_pages",
    loginCta: "Login Facebook",
  },
];

export const LOGIN_TIMELINE = [
  {
    step: 1,
    title: "Login Affiliate",
    detail: "Shopee Affiliate + TikTok Shop Affiliate — เอาลิงก์สินค้า",
    accounts: ["shopee_affiliate", "tiktok_shop_affiliate"] as const,
  },
  {
    step: 2,
    title: "ใส่ในระบบเลือกดี",
    detail: "เพิ่มสินค้า / นำเข้า CSV — ขั้นตอนนี้ไม่ต้อง login Shopee/TikTok",
    accounts: [] as const,
  },
  {
    step: 3,
    title: "Morning → Approve",
    detail: "สร้าง draft และอนุมัติในระบบ — ยังไม่ต้อง login แอปโพสต์",
    accounts: [] as const,
  },
  {
    step: 4,
    title: "Login แอปโพสต์",
    detail: "TikTok + Facebook — คัดลอก caption ไปโพสต์ด้วยมือ",
    accounts: ["tiktok_app", "facebook"] as const,
  },
];

export function statusLabel(status: AccountStatus["status"]): string {
  switch (status) {
    case "logged_in_today":
      return "ล็อกอินวันนี้แล้ว";
    case "ready":
      return "พร้อมใช้ (มีบัญชี)";
    default:
      return "ยังไม่พร้อม";
  }
}

export function mergeAccounts(
  stored: AccountStatus[] | undefined,
): AccountStatus[] {
  const byKey = new Map((stored ?? []).map((a) => [a.key, a]));
  return DEFAULT_ACCOUNTS.map((base) => {
    const prev = byKey.get(base.key);
    if (!prev) return { ...base };
    return {
      ...base,
      // Keep portal URLs from code defaults so links stay current
      status: prev.status ?? base.status,
      notes: prev.notes,
      updatedAt: prev.updatedAt,
    };
  });
}
