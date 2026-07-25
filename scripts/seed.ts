import { promises as fs } from "fs";
import path from "path";
import type { Database, Product } from "../src/lib/types";

const now = new Date().toISOString();

function product(partial: Omit<Product, "createdAt" | "updatedAt">): Product {
  return { ...partial, createdAt: now, updatedAt: now };
}

const products: Product[] = [
  product({
    id: "prod_seed_01",
    name: "พัดลมพกพา USB มินิ",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/affiliate-example-fan",
    price: 159,
    commissionRate: 15,
    category: "gadget",
    sellingPoints: ["พกง่าย", "เสียงเบา", "ชาร์จ USB"],
    painPoints: ["ร้อนในรถไฟฟ้า / คิวยาวแล้วเหงื่อออก"],
    targetAudience: "คนเดินทางและพนักงานออฟฟิศ",
    seasonalTags: ["ร้อน", "summer", "เทรนด์"],
    videoFriendly: true,
    notes: "demo เปิด-ปิดและเทียบความเย็นง่าย",
  }),
  product({
    id: "prod_seed_02",
    name: "กล่องจัดเก็บใต้เตียงแบบมีล้อ",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/affiliate-example-box",
    price: 289,
    commissionRate: 12,
    category: "จัดเก็บ",
    sellingPoints: ["มีล้อเลื่อน", "กันฝุ่น", "พับเก็บได้"],
    painPoints: ["ของseasonalรกใต้เตียงหาไม่เจอ"],
    targetAudience: "คนอยู่คอนโดพื้นที่จำกัด",
    seasonalTags: ["เปิดเทอม", "จัดบ้าน"],
    videoFriendly: true,
  }),
  product({
    id: "prod_seed_03",
    name: "เซรั่มกันแดดเนื้อบางเบา SPF50",
    platform: "tiktok_shop",
    affiliateUrl: "https://shop.tiktok.com/affiliate-example-serum",
    price: 249,
    commissionRate: 18,
    category: "ความงาม",
    sellingPoints: ["ไม่เหนอะ", "เกลี่ยง่าย", "โทนอัพเบา ๆ"],
    painPoints: ["ทากันแดดแล้วหน้ามันและขาวลอย"],
    targetAudience: "คนผิวผสมที่ต้องออกนอกบ้านทุกวัน",
    seasonalTags: ["ร้อน", "สงกรานต์", "เทรนด์"],
    videoFriendly: true,
  }),
  product({
    id: "prod_seed_04",
    name: "หูฟังบลูทูธหนีบหู เบาไม่อึดอัด",
    platform: "tiktok_shop",
    affiliateUrl: "https://shop.tiktok.com/affiliate-example-ear",
    price: 390,
    commissionRate: 10,
    category: "ไอที",
    sellingPoints: ["ใส่ทำงานได้ทั้งวัน", "กันน้ำระดับพื้นฐาน", "เชื่อมมือถือง่าย"],
    painPoints: ["หูฟังอินเอียร์ใส่แล้วเจ็บหลัง 1 ชม."],
    targetAudience: "คนทำงานจากคาเฟ่ / เดินทาง",
    seasonalTags: ["เทรนด์"],
    videoFriendly: true,
  }),
  product({
    id: "prod_seed_05",
    name: "หม้อทอดไร้น้ำมันขนาดเล็ก 2 ลิตร",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/affiliate-example-airfryer",
    price: 1290,
    commissionRate: 8,
    category: "ครัว",
    sellingPoints: ["ประหยัดน้ำมัน", "ล้างง่าย", "เหมาะครัวเล็ก"],
    painPoints: ["อยากลดน้ำมันแต่ไม่อยากซื้อเครื่องใหญ่เกินครัว"],
    targetAudience: "คนเริ่มทำอาหารบ้าน / ครัวคอนโด",
    seasonalTags: ["ฝน"],
    videoFriendly: true,
  }),
  product({
    id: "prod_seed_06",
    name: "ชุดแปรงทำความสะอาดช่องแอร์",
    platform: "shopee",
    affiliateUrl: "https://shopee.co.th/affiliate-example-brush",
    price: 99,
    commissionRate: 20,
    category: "บ้าน",
    sellingPoints: ["ราคาเอื้อมถึง", "เข้าซอกได้", "ใช้ซ้ำได้"],
    painPoints: ["แอร์มีฝุ่นแต่จ้างล้างแพง"],
    targetAudience: "คนเช่าห้องที่อยากดูแลแอร์เบื้องต้น",
    seasonalTags: ["ร้อน", "ฝน"],
    videoFriendly: true,
  }),
];

async function main() {
  const dataDir = path.join(process.cwd(), "data");
  await fs.mkdir(dataDir, { recursive: true });
  const db: Database = {
    products,
    contentPacks: [],
    schedule: [],
    metrics: [],
    briefs: [],
  };
  await fs.writeFile(
    path.join(dataDir, "db.json"),
    JSON.stringify(db, null, 2),
    "utf8"
  );
  console.log(`Seeded ${products.length} products → data/db.json`);
  console.log("รัน morning workflow ต่อด้วย: npm run workflow:morning");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
