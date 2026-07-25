import { AFFILIATE_DISCLOSURE, withDisclosure } from "./disclosure";
import { newId } from "./db";
import type { ContentPack, Product } from "./types";

function pickAudience(product: Product): string {
  return product.targetAudience.trim() || "คนที่กำลังเลือกของชิ้นนี้";
}

function primaryPain(product: Product): string {
  return product.painPoints[0]?.trim() || "เลือกของแล้วไม่มั่นใจว่าใช้แล้วจะโอเคไหม";
}

function primaryPoint(product: Product): string {
  return product.sellingPoints[0]?.trim() || "ใช้งานง่ายและคุ้มค่าเมื่อเทียบกับตัวเลือกใกล้เคียง";
}

function buildHooks(product: Product): string[] {
  const pain = primaryPain(product);
  const point = primaryPoint(product);
  const audience = pickAudience(product);
  return [
    `เคยเจอไหมว่า${pain}`,
    `ถ้าคุณเป็น${audience} ลองดูมุมนี้ก่อนซื้อ`,
    `เล่าจากมุมคนเลือกของ: ${product.name}`,
    `${point} — แต่ควรเช็กอะไรก่อนกดสั่ง?`,
    `ไม่ขายแข็ง แค่ช่วยไล่ประเด็นที่ควรรู้เรื่อง${product.category}`,
  ];
}

function buildCtas(): string[] {
  return [
    "ถ้ากำลังเปรียบเทียบตัวเลือก ลิงก์รายละเอียดอยู่ด้านล่าง สามารถอ่านรีวิวและสเปกเพิ่มได้",
    "สนใจลองดูข้อมูลสินค้าได้จากลิงก์ด้านล่าง แล้วค่อยตัดสินใจตามงบและความต้องการตัวเอง",
    "อยากให้ช่วยเทียบจุดดี-จุดควรระวัง คอมเมนต์ไว้ได้ ลิงก์สินค้าอยู่ด้านล่าง",
  ];
}

function buildHashtags(product: Product): { th: string[]; en: string[] } {
  const cat = product.category.replace(/\s+/g, "");
  return {
    th: [
      "#รีวิวของใช้",
      "#ช่วยเลือกของ",
      `#${cat || "สินค้าแนะนำ"}`,
      "#ช้อปอย่างมีเหตุผล",
      product.platform === "shopee" ? "#ShopeeAffiliate" : "#TikTokShopTH",
    ],
    en: [
      "#AffiliateDisclosure",
      "#HonestReview",
      "#ProductTips",
      "#SmartShopping",
      "#ShortFormContent",
    ],
  };
}

function buildTiktokScript(product: Product, hooks: string[]) {
  const pain = primaryPain(product);
  const point = primaryPoint(product);
  return {
    durationHint: "15–30 วินาที",
    scenes: [
      {
        time: "0–3 วิ",
        visual: "โชว์ปัญหา/สถานการณ์จริงแบบสั้น",
        voiceover: hooks[0],
      },
      {
        time: "3–12 วิ",
        visual: `โชว์ ${product.name} แบบใกล้ ๆ หรือ demo ใช้จริง`,
        voiceover: `ปัญหาหลักคือ${pain} จุดที่ช่วยได้คือ${point}`,
      },
      {
        time: "12–22 วิ",
        visual: "โชว์รายละเอียดที่ควรเช็ก เช่น วัสดุ ขนาด วิธีใช้",
        voiceover: "ไม่ใช่ของวิเศษนะ แค่ช่วยให้เลือกง่ายขึ้น ถ้าตรงโจทย์ค่อยตัดสินใจ",
      },
      {
        time: "22–30 วิ",
        visual: "ปิดด้วยลิงก์ในโปรไฟล์/คอมเมนต์ + ข้อความ disclosure",
        voiceover: "รายละเอียดและลิงก์ไว้ด้านล่าง มีบอกไว้ว่าเป็นลิงก์ affiliate ด้วย",
      },
    ],
    onScreenText: [
      "ช่วยเลือกของ ไม่ขายแข็ง",
      product.name,
      "เช็กสเปกก่อนซื้อ",
      "มี disclosure ลิงก์ affiliate",
    ],
  };
}

function buildFacebookCaption(product: Product, hooks: string[], ctas: string[]): string {
  const points = product.sellingPoints.slice(0, 3);
  const body = [
    hooks[1],
    "",
    `สินค้า: ${product.name}`,
    `ราคาประมาณ: ${product.price.toLocaleString("th-TH")} บาท`,
    `เหมาะกับ: ${pickAudience(product)}`,
    "",
    "ทำไมถึงน่าสนใจ (จากมุมคนเลือกของ):",
    ...points.map((p, i) => `${i + 1}. ${p}`),
    "",
    `ข้อควรรู้: ${primaryPain(product)}`,
    "",
    ctas[0],
    "",
    `ลิงก์: ${product.affiliateUrl}`,
  ].join("\n");
  return withDisclosure(body);
}

function buildReelsCaption(product: Product, hooks: string[], ctas: string[]): string {
  const body = [
    hooks[0],
    `${product.name} — ${primaryPoint(product)}`,
    ctas[1],
    `ลิงก์: ${product.affiliateUrl}`,
  ].join("\n");
  return withDisclosure(body);
}

export function generateContentPack(product: Product): ContentPack {
  const hooks = buildHooks(product);
  const ctas = buildCtas();
  const hashtags = buildHashtags(product);
  return {
    id: newId("content"),
    productId: product.id,
    createdAt: new Date().toISOString(),
    disclosure: AFFILIATE_DISCLOSURE,
    tiktokScript: buildTiktokScript(product, hooks),
    facebookCaption: buildFacebookCaption(product, hooks, ctas),
    reelsCaption: buildReelsCaption(product, hooks, ctas),
    hooks,
    ctas,
    hashtags,
    videoAngleSuggestion: product.videoFriendly
      ? `ทำคลิป demo ก่อน-หลัง หรือเทียบกับวิธีเดิม โดยเปิดด้วย hook: “${hooks[0]}”`
      : `เน้นเล่าเกณฑ์เลือกซื้อและข้อควรเช็ก เพราะสินค้าอาจโชว์ demo ยาก — ใช้ B-roll + ข้อความบนจอ`,
  };
}
