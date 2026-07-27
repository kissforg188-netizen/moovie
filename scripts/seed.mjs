import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");

function id(prefix, n) {
  return `${prefix}_seed_${n}`;
}

const now = new Date().toISOString();

const products = [
  {
    id: id("prod", 1),
    name: "พัดลมมือถือมินิ USB",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/example-fan",
    price: 159,
    commissionRate: 12,
    category: "แกджет",
    sellingPoints: ["พกพาง่าย", "ชาร์จ USB", "เสียงเบา"],
    painPoints: ["ร้อนในรถไฟฟ้า", "พัดลมใหญ่พกไม่ไหว"],
    targetAudience: "คนทำงานออฟฟิศและนักศึกษา",
    videoEase: 5,
    seasonalScore: 4,
    notes: "ตัวอย่างสินค้าสำหรับทดลองระบบ",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: id("prod", 2),
    name: "ขวดน้ำเก็บอุณหภูมิ 500ml",
    platform: "tiktok_shop",
    affiliateUrl: "https://www.tiktok.com/shop/example-bottle",
    price: 249,
    commissionRate: 15,
    category: "ไลฟ์สไตล์",
    sellingPoints: ["เก็บเย็นนาน", "ไม่หนักมือ", "ดีไซน์เรียบ"],
    painPoints: ["น้ำอุ่นกลางวัน", "ขวดเดิมรั่ว"],
    targetAudience: "คนออกกำลังกายและทำงานนอกบ้าน",
    videoEase: 4,
    seasonalScore: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: id("prod", 3),
    name: "แผ่นรองเมาส์ข้อมือกันเมื่อย",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/example-wrist",
    price: 99,
    commissionRate: 18,
    category: "ทำงานบ้าน",
    sellingPoints: ["ราคาเข้าถึงง่าย", "ติดตั้งไว", "ลดเมื่อยข้อมือ"],
    painPoints: ["พิมพ์นานแล้วเมื่อย", "โต๊ะทำงานไม่เออร์โก"],
    targetAudience: "คนทำงานคอมพิวเตอร์",
    videoEase: 5,
    seasonalScore: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: id("prod", 4),
    name: "ครีมกันแดดเนื้อบางเบา SPF50",
    platform: "tiktok_shop",
    affiliateUrl: "https://www.tiktok.com/shop/example-sunscreen",
    price: 390,
    commissionRate: 20,
    category: "บิวตี้",
    sellingPoints: ["ไม่เหนอะ", "ใช้ทุกวันได้", "บรรจุพกง่าย"],
    painPoints: ["หน้าร้อนมันง่าย", "กันแดดเดิมหนักหน้า"],
    targetAudience: "คนผิวมันและคนเดินทางกลางแจ้ง",
    videoEase: 3,
    seasonalScore: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: id("prod", 5),
    name: "กล่องจัดระเบียบสายชาร์จ",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/example-cablebox",
    price: 129,
    commissionRate: 10,
    category: "ของใช้ในบ้าน",
    sellingPoints: ["โต๊ะโล่งขึ้น", "หาสายง่าย", "ติดตั้งไม่ต้องเจาะ"],
    painPoints: ["สายพันกันใต้โต๊ะ", "ดูรกเวลา Zoom"],
    targetAudience: "คนทำงานจากบ้าน",
    videoEase: 4,
    seasonalScore: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: id("prod", 6),
    name: "หมอนรองคอเดินทาง",
    platform: "facebook",
    affiliateUrl: "https://example.com/affiliate/neck-pillow",
    price: 890,
    commissionRate: 8,
    category: "ท่องเที่ยว",
    sellingPoints: ["พับเก็บได้", "รองรับคอ", "ซักปลอกได้"],
    painPoints: ["นั่งรถไฟนานคอตก", "หมอนโรงแรมสูงไป"],
    targetAudience: "คนเดินทางบ่อย",
    videoEase: 2,
    seasonalScore: 3,
    createdAt: now,
    updatedAt: now,
  },
];

const db = {
  products,
  contentPacks: [],
  schedule: [],
  briefs: [],
};

await mkdir(dataDir, { recursive: true });
await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log(`Seeded ${products.length} products → ${dbPath}`);
console.log("ต่อไปลอง: npm run workflow:morning");
