import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");

const now = new Date().toISOString();

/** Demo catalog for local experiments — not real affiliate links / income claims. */
const products = [
  {
    id: "demo_fan",
    name: "พัดลมพกพา USB เงียบ",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/demo-fan-affiliate",
    price: 159,
    commissionRate: 14,
    category: "พัดลม",
    sellingPoints: ["พกง่าย", "เสียงเบา", "ชาร์จ USB"],
    painPoints: ["ร้อนตอนเดินทาง", "พัดลมใหญ่พกไม่ได้", "แบตมือถือร้อนเวลาใช้งาน"],
    targetAudience: "คนเดินทาง / นักเรียน / คนออฟฟิศ",
    videoEase: 5,
    seasonalScore: 4,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo_cable",
    name: "กล่องเก็บสายชาร์จตั้งโต๊ะ",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/demo-cablebox-affiliate",
    price: 129,
    commissionRate: 18,
    category: "แกเจ็ต",
    sellingPoints: ["โต๊ะโล่งขึ้น", "ติดตั้งง่าย", "ราคาไม่แรง"],
    painPoints: ["สายยุ่ง", "โต๊ะรก", "หาที่ชาร์จไม่เจอ"],
    targetAudience: "คนทำงานจากบ้าน / คนออฟฟิศ",
    videoEase: 5,
    seasonalScore: 3,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo_bottle",
    name: "ขวดน้ำเก็บอุณหภูมิ 500ml",
    platform: "tiktok_shop",
    affiliateUrl: "https://shop.tiktok.com/demo-bottle-affiliate",
    price: 249,
    commissionRate: 12,
    category: "Lifestyle",
    sellingPoints: ["เก็บเย็นได้นาน", "พกสะดวก", "ล้างง่าย"],
    painPoints: ["น้ำอุ่นเร็ว", "ขวดหนัก", "หิวน้ำระหว่างวัน"],
    targetAudience: "คนออกกำลังกายเบา ๆ / คนพกของประจำวัน",
    videoEase: 4,
    seasonalScore: 4,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo_pad",
    name: "แผ่นรองเมาส์ข้อมือสบาย",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/demo-mousepad-affiliate",
    price: 99,
    commissionRate: 16,
    category: "แกเจ็ต",
    sellingPoints: ["ข้อมือไม่ล้า", "กันลื่น", "ราคา impulse"],
    painPoints: ["ข้อมือชาตอนพิมพ์นาน", "แผ่นบางเกินไป", "โต๊ะลื่น"],
    targetAudience: "คนพิมพ์งาน / เกมเมอร์เบา ๆ",
    videoEase: 4,
    seasonalScore: 3,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo_sunscreen",
    name: "ครีมกันแดดเนื้อบางเบา SPF50",
    platform: "tiktok_shop",
    affiliateUrl: "https://shop.tiktok.com/demo-sunscreen-affiliate",
    price: 289,
    commissionRate: 10,
    category: "สกินแคร์",
    sellingPoints: ["เนื้อบาง", "ไม่วอกขาว", "ทาเช้าได้เร็ว"],
    painPoints: ["ทาแล้วเหนอะ", "วอกขาว", "ลืมทากันแดด"],
    targetAudience: "คนทำงานกลางแจ้งบ้าง / คนผิวแพ้ง่าย",
    videoEase: 3,
    seasonalScore: 5,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ — ไม่เคลมผลทางการแพทย์",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo_bag",
    name: "กระเป๋าผ้าพับได้ใส่ของฉุกเฉิน",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/demo-bag-affiliate",
    price: 79,
    commissionRate: 20,
    category: "ของใช้",
    sellingPoints: ["พับเก็บได้", "น้ำหนักเบา", "ใช้ซ้ำได้"],
    painPoints: ["ลืมถุงผ้า", "ของล้นมือ", "ไม่อยากใช้ถุงพลาสติก"],
    targetAudience: "คนไปตลาด / คนเดินห้าง",
    videoEase: 5,
    seasonalScore: 3,
    notes: "สินค้าตัวอย่างสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
];

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
  products,
  contentPacks: [],
  schedule: [],
  briefs: [],
  automationLogs: [],
  accounts,
};

await mkdir(dataDir, { recursive: true });
await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log(`Demo seed → ${products.length} products → ${dbPath}`);
console.log("รันต่อ: npm run workflow:morning");
console.log("หมายเหตุ: ลิงก์เป็นตัวอย่าง ไม่ใช่ลิงก์ affiliate จริง และไม่การันตีรายได้");
