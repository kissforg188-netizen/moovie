import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");

/** Reset DB to empty — no sample products. Account stubs kept for login checklist. */
const accounts = [
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

const db = {
  products: [],
  contentPacks: [],
  schedule: [],
  briefs: [],
  automationLogs: [],
  accounts,
};

await mkdir(dataDir, { recursive: true });
await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log(`Cleared database (0 products) → ${dbPath}`);
console.log("เพิ่มสินค้าจริงที่ /products หรือ /automation");
