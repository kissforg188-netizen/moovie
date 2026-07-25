import { AFFILIATE_DISCLOSURE, withDisclosure } from "./disclosure";
import { newId } from "./db";
import type { ContentPack, Product } from "./types";

function firstPain(product: Product): string {
  return product.painPoints[0]?.trim() || "ปัญหาจุกจิกในชีวิตประจำวัน";
}

function firstSell(product: Product): string {
  return product.sellingPoints[0]?.trim() || "ใช้งานง่าย ได้ผลจริง";
}

function priceLabel(price: number): string {
  return `฿${price.toLocaleString("th-TH")}`;
}

export function generateHooks(product: Product): string[] {
  const pain = firstPain(product);
  const sell = firstSell(product);
  return [
    `เคยเจอไหม… ${pain}`,
    `ถ้ากำลังหาของช่วยเรื่อง${product.category} ลองฟังก่อนตัดสินใจ`,
    `${sell} — ราคาประมาณ ${priceLabel(product.price)}`,
    `ของชิ้นเล็กที่คน${product.targetAudience || "ใช้งานจริง"}พูดถึงบ่อย`,
    `ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้`,
  ];
}

export function generateCTAs(): string[] {
  return [
    "สนใจ dig ต่อได้ที่ลิงก์ในคอมเมนต์/ไบโอ — อ่านรีวิวและสเปกก่อนตัดสินใจนะ",
    "ถ้าเข้าเงื่อนไขใช้งานของคุณ ค่อยกดดูรายละเอียดเพิ่มที่ลิงก์ด้านล่าง",
    "อยากลองเทียบกับของเดิมไหม เปิดลิงก์ไปดูสเปก/รีวิวเพิ่มได้เลย",
  ];
}

export function generateHashtags(product: Product): {
  th: string[];
  en: string[];
} {
  const cat = product.category.replace(/\s+/g, "") || "ของใช้";
  return {
    th: [
      "#รีวิวของใช้",
      `#${cat}`,
      "#แนะนำของดี",
      "#ช้อปอย่างมีเหตุผล",
      "#เลือกดี",
      product.platform === "shopee" ? "#ShopeeAffiliate" : "#TikTokShop",
    ],
    en: [
      "#AffiliateDisclosure",
      "#ProductPick",
      "#HonestReview",
      "#ShortVideo",
      "#Thailand",
    ],
  };
}

function buildTikTokScript(product: Product, hooks: string[], ctas: string[]) {
  const pain = firstPain(product);
  const sell = firstSell(product);
  return {
    durationSec: 25,
    scenes: [
      {
        time: "0-3วิ",
        line: hooks[0],
        visual: "หน้ากล้องใกล้ ๆ น้ำเสียงเป็นกันเอง / โชว์ปัญหาแบบสั้น ๆ",
      },
      {
        time: "3-10วิ",
        line: `ปัญหาคือ ${pain} เลยไปลองหาของที่ช่วยได้โดยไม่ต้องซื้อแพง`,
        visual: "โชว์สินค้าชัด + จุดใช้งานจริง 1–2 อย่าง",
      },
      {
        time: "10-20วิ",
        line: `${sell} เหมาะกับ${product.targetAudience || "คนทั่วไป"} ราคาประมาณ ${priceLabel(product.price)}`,
        visual: "สาธิตสั้น / Before-After เบา ๆ ไม่โอเวอร์เคลม",
      },
      {
        time: "20-25วิ",
        line: ctas[0],
        visual: "ชี้ลิงก์ + ข้อความ disclosure บนจอ",
      },
    ],
    voiceover: [
      hooks[0],
      `ตัวเลือกนี้ช่วยเรื่อง${product.category}: ${sell}`,
      `ราคาประมาณ ${priceLabel(product.price)} — ดูสเปกและรีวิวเพิ่มก่อนซื้อได้`,
      AFFILIATE_DISCLOSURE,
    ].join(" "),
  };
}

export function generateContentPack(product: Product): ContentPack {
  const hooks = generateHooks(product);
  const ctas = generateCTAs();
  const tags = generateHashtags(product);
  const pain = firstPain(product);
  const sell = firstSell(product);

  const facebookBody = [
    hooks[1],
    "",
    `วันนี้มาแชร์ตัวเลือกในหมวด ${product.category} สำหรับ${product.targetAudience || "คนที่กำลังหาของอยู่"}`,
    `จุดที่น่าสนใจ: ${sell}`,
    `ช่วยเรื่อง: ${pain}`,
    `ราคาประมาณ ${priceLabel(product.price)} (ตรวจราคาก่อนซื้อเสมอ)`,
    "",
    ctas[1],
    "",
    `ลิงก์: ${product.affiliateUrl}`,
    "",
    [...tags.th.slice(0, 4), ...tags.en.slice(0, 2)].join(" "),
  ].join("\n");

  const reelsBody = [
    hooks[0],
    `${sell} · ${priceLabel(product.price)}`,
    ctas[2],
    `ลิงก์ในไบโอ/คอมเมนต์`,
    [...tags.th.slice(0, 3), ...tags.en.slice(0, 2)].join(" "),
  ].join("\n");

  const videoPriorityNote =
    product.videoEase >= 4
      ? "ถ่ายง่าย: โชว์ปัญหา → สาธิต 1 จุด → ปิดด้วยลิงก์+disclosure (เริ่มตัวนี้ก่อน)"
      : product.videoEase >= 3
        ? "ถ่ายระดับกลาง: เตรียมฉากใช้งานจริง 1 นาที แล้วตัดเหลือ 20–25 วิ"
        : "ถ่ายยากกว่าเพื่อน: ใช้ภาพนิ่ง/สไลด์ + พากย์สั้นก่อน แล้วค่อยทำวิดีโอเต็ม";

  return {
    id: newId("pack"),
    productId: product.id,
    createdAt: new Date().toISOString(),
    disclosure: AFFILIATE_DISCLOSURE,
    hooks,
    ctas,
    hashtagsTh: tags.th,
    hashtagsEn: tags.en,
    tiktokScript: buildTikTokScript(product, hooks, ctas),
    facebookCaption: withDisclosure(facebookBody),
    reelsCaption: withDisclosure(reelsBody),
    videoPriorityNote,
  };
}
