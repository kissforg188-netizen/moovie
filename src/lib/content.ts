import { sanitizeMarketingText } from "./compliance";
import { AFFILIATE_DISCLOSURE, withDisclosure } from "./disclosure";
import { newId } from "./db";
import type { ContentPack, Product } from "./types";

function softCopy(text: string): string {
  return sanitizeMarketingText(text).text;
}

function firstPain(product: Product): string {
  return product.painPoints[0]?.trim() || "ปัญหาจุกจิกในชีวิตประจำวัน";
}

function firstSell(product: Product): string {
  return product.sellingPoints[0]?.trim() || "ใช้งานง่าย ได้ผลจริง";
}

function priceLabel(price: number): string {
  return `฿${price.toLocaleString("th-TH")}`;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const n = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

export function generateHooks(product: Product, variant = 0): string[] {
  const pain = firstPain(product);
  const sell = firstSell(product);
  const platformHook =
    product.platform === "tiktok_shop"
      ? `โชว์ของจริงในคลิปสั้น แล้วค่อยเปิดดูรายละเอียดใน TikTok Shop ได้`
      : product.platform === "shopee"
        ? `เปิดดูสเปก/รีวิวบน Shopee ก่อนตัดสินใจ — ตัวเลือกหมวด ${product.category}`
        : `แชร์ตัวเลือกหมวด ${product.category} ให้ดูสเปกก่อน แล้วค่อยตัดสินใจเอง`;
  // Keep platform hook inside the first 5 after rotation so packs differ by platform.
  const hooks = [
    `เคยเจอไหม… ${pain}`,
    platformHook,
    `ถ้ากำลังหาของช่วยเรื่อง${product.category} ลองฟังก่อนตัดสินใจ`,
    `${sell} — ราคาประมาณ ${priceLabel(product.price)}`,
    `ของชิ้นเล็กที่คน${product.targetAudience || "ใช้งานจริง"}พูดถึงบ่อย`,
    `ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้`,
    `เล่าจากมุมคนใช้จริง: อยากลดเรื่อง${pain}`,
    `สั้น ๆ ตรง ๆ — จุดที่ชอบคือ ${sell}`,
  ];
  return rotate(hooks, variant).slice(0, 5);
}

export function generateCTAs(variant = 0): string[] {
  const ctas = [
    "สนใจดูรายละเอียดต่อได้ที่ลิงก์ในคอมเมนต์/ไบโอ — อ่านรีวิวและสเปกก่อนตัดสินใจนะ",
    "ถ้าเข้าเงื่อนไขใช้งานของคุณ ค่อยกดดูรายละเอียดเพิ่มที่ลิงก์ด้านล่าง",
    "อยากลองเทียบกับของเดิมไหม เปิดลิงก์ไปดูสเปก/รีวิวเพิ่มได้เลย",
    "ไม่เร่งซื้อ — เปิดดูรายละเอียดก่อน แล้วค่อยตัดสินใจเองได้",
  ];
  return rotate(ctas, variant).slice(0, 3);
}

/** Three soft selling angles — help the viewer choose, never guarantee results. */
export function generateSellingAngles(product: Product, variant = 0): string[] {
  const pain = firstPain(product);
  const sell = firstSell(product);
  const audience = product.targetAudience || "คนที่กำลังหาของอยู่";
  const angles = [
    `มุมปัญหา: เล่าสั้น ๆ เรื่อง${pain} แล้วค่อยโชว์ว่า ${sell} ช่วยได้แค่ไหน (ไม่โอเวอร์เคลม)`,
    `มุมเทียบเลือก: ให้${audience}เทียบสเปก/ราคาประมาณ ${priceLabel(product.price)} กับของที่ใช้อยู่ก่อนตัดสินใจ`,
    `มุมใช้งานจริง: โชว์ 1 สถานการณ์ประจำวันในหมวด ${product.category} + จุดที่ชอบคือ ${sell}`,
    `มุมประหยัดเวลา: บอกว่าทำไมของชิ้นนี้ลดขั้นตอนเรื่อง${pain} โดยไม่ต้องซื้อแพงก่อน`,
    `มุมเพื่อนแนะนำ: น้ำเสียงคุยกัน แชร์ตัวเลือก ไม่เร่งกดซื้อ — ให้ดูรีวิวเพิ่มที่ลิงก์`,
  ];
  return rotate(angles, variant).slice(0, 3).map((a) => softCopy(a));
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

type ScriptStyleVariant =
  | "problem_demo"
  | "howto"
  | "before_after"
  | "unbox"
  | "pov";

const SCRIPT_STYLE_VARIANTS: ScriptStyleVariant[] = [
  "problem_demo",
  "howto",
  "before_after",
  "unbox",
  "pov",
];

const SCRIPT_STYLE_LABEL: Record<ScriptStyleVariant, string> = {
  problem_demo: "โครงปัญหา→สาธิต",
  howto: "โครงวิธีใช้ทีละขั้น",
  before_after: "โครงก่อน–หลัง",
  unbox: "โครงแกะกล่อง",
  pov: "โครง POV",
};

type ProofStyleVariant =
  | "used_real"
  | "compare_help"
  | "spec_point"
  | "situation"
  | "soft_popular";

const PROOF_STYLE_VARIANTS: ProofStyleVariant[] = [
  "used_real",
  "compare_help",
  "spec_point",
  "situation",
  "soft_popular",
];

const PROOF_STYLE_LABEL: Record<ProofStyleVariant, string> = {
  used_real: "หลักฐานใช้จริง",
  compare_help: "หลักฐานเทียบเลือก",
  spec_point: "หลักฐานสเปก",
  situation: "หลักฐานสถานการณ์",
  soft_popular: "หลักฐานยอดนิยมเบา",
};

function scriptStyleForVariant(variant: number): ScriptStyleVariant {
  const i = Math.abs(variant) % SCRIPT_STYLE_VARIANTS.length;
  return SCRIPT_STYLE_VARIANTS[i]!;
}

function proofStyleForVariant(variant: number): ProofStyleVariant {
  const i = Math.abs(variant) % PROOF_STYLE_VARIANTS.length;
  return PROOF_STYLE_VARIANTS[i]!;
}

function buildTikTokScript(
  product: Product,
  hooks: string[],
  ctas: string[],
  variant = 0,
) {
  const pain = softCopy(firstPain(product));
  const sell = softCopy(firstSell(product));
  const audience = softCopy(product.targetAudience || "คนทั่วไป");
  const category = softCopy(product.category || "ของใช้");
  const style = scriptStyleForVariant(variant);
  const styleTag = SCRIPT_STYLE_LABEL[style];
  const price = priceLabel(product.price);

  const byStyle: Record<
    ScriptStyleVariant,
    { scenes: { time: string; line: string; visual: string }[]; voiceBits: string[] }
  > = {
    problem_demo: {
      scenes: [
        {
          time: "0-3วิ",
          line: hooks[0],
          visual: `${styleTag} · หน้ากล้องใกล้ ๆ / โชว์ปัญหาแบบสั้น ๆ`,
        },
        {
          time: "3-10วิ",
          line: softCopy(
            `ปัญหาคือ ${pain} เลยไปลองหาของที่ช่วยได้โดยไม่ต้องซื้อแพง`,
          ),
          visual: "โชว์สินค้าชัด + จุดใช้งานจริง 1–2 อย่าง",
        },
        {
          time: "10-20วิ",
          line: softCopy(
            `${sell} เหมาะกับ${audience} ราคาประมาณ ${price}`,
          ),
          visual: "สาธิตสั้น ไม่โอเวอร์เคลม",
        },
        {
          time: "20-25วิ",
          line: ctas[0],
          visual: "ชี้ลิงก์ + ข้อความ disclosure บนจอ",
        },
      ],
      voiceBits: [
        styleTag,
        hooks[0],
        `ตัวเลือกนี้ช่วยเรื่อง${category}: ${sell}`,
        `ราคาประมาณ ${price} — ดูสเปกและรีวิวเพิ่มก่อนซื้อได้`,
      ],
    },
    howto: {
      scenes: [
        {
          time: "0-3วิ",
          line: softCopy(`วิธีใช้ทีละขั้น: ${hooks[0]}`),
          visual: `${styleTag} · โชว์ของพร้อมใช้`,
        },
        {
          time: "3-12วิ",
          line: softCopy(`ก้าวที่ 1–2: เตรียมของ แล้วลอง${sell}`),
          visual: "ทีละขั้นชัด ๆ ไม่เร่ง",
        },
        {
          time: "12-20วิ",
          line: softCopy(
            `ช่วยเรื่อง${pain} ราคาประมาณ ${price} — เทียบรีวิวก่อนก็ได้`,
          ),
          visual: "โชว์ผลใช้งานเบา ๆ ไม่เคลมเกินจริง",
        },
        {
          time: "20-25วิ",
          line: ctas[0],
          visual: "ชี้ลิงก์ + disclosure",
        },
      ],
      voiceBits: [
        styleTag,
        `สอนใช้สั้น ๆ สำหรับ${audience}`,
        sell,
        `ราคาประมาณ ${price}`,
      ],
    },
    before_after: {
      scenes: [
        {
          time: "0-3วิ",
          line: softCopy(`ก่อนใช้: ${pain}`),
          visual: `${styleTag} · โชว์สถานการณ์ก่อนแบบสั้น`,
        },
        {
          time: "3-12วิ",
          line: softCopy(`หลังลองตัวเลือกนี้: ${sell}`),
          visual: "Before-After เบา ๆ ไม่โอเวอร์เคลม",
        },
        {
          time: "12-20วิ",
          line: softCopy(
            `เหมาะกับ${audience} ราคาประมาณ ${price} — ไม่การันตีผลทุกคน`,
          ),
          visual: "โชว์ของจริง + จุดที่ชอบ 1 ข้อ",
        },
        {
          time: "20-25วิ",
          line: ctas[0],
          visual: "ชี้ลิงก์ + disclosure",
        },
      ],
      voiceBits: [
        styleTag,
        `ก่อน–หลังเบา ๆ เรื่อง${category}`,
        sell,
        `ราคาประมาณ ${price}`,
      ],
    },
    unbox: {
      scenes: [
        {
          time: "0-3วิ",
          line: softCopy(`แกะกล่องสั้น ๆ: ${hooks[0]}`),
          visual: `${styleTag} · เปิดกล่อง / ของมาถึง`,
        },
        {
          time: "3-12วิ",
          line: softCopy(`จุดที่ชอบ: ${sell}`),
          visual: "ซูมรายละเอียด 1–2 จุด",
        },
        {
          time: "12-20วิ",
          line: softCopy(
            `ช่วยเรื่อง${pain} ราคาประมาณ ${price} — เปิดดูสเปกต่อได้`,
          ),
          visual: "วางของในฉากใช้งานจริง",
        },
        {
          time: "20-25วิ",
          line: ctas[0],
          visual: "ชี้ลิงก์ + disclosure",
        },
      ],
      voiceBits: [
        styleTag,
        "แกะกล่องสั้น ไม่เร่งซื้อ",
        sell,
        `ราคาประมาณ ${price}`,
      ],
    },
    pov: {
      scenes: [
        {
          time: "0-3วิ",
          line: softCopy(`POV: วันหนึ่งของ${audience}`),
          visual: `${styleTag} · ตามไปดูสถานการณ์จริง`,
        },
        {
          time: "3-12วิ",
          line: softCopy(`เจอ${pain} เลยลองตัวเลือกนี้: ${sell}`),
          visual: "มือถือ POV / ฉากประจำวัน",
        },
        {
          time: "12-20วิ",
          line: softCopy(
            `ราคาประมาณ ${price} — แชร์เป็นตัวเลือก ไม่เร่งกดซื้อ`,
          ),
          visual: "โชว์ของในชีวิตจริงสั้น ๆ",
        },
        {
          time: "20-25วิ",
          line: ctas[0],
          visual: "ชี้ลิงก์ + disclosure",
        },
      ],
      voiceBits: [
        styleTag,
        `ตามไปดูสถานการณ์${category}`,
        sell,
        `ราคาประมาณ ${price}`,
      ],
    },
  };

  const picked = byStyle[style];
  return {
    durationSec: 25,
    scenes: picked.scenes,
    voiceover: softCopy([...picked.voiceBits, AFFILIATE_DISCLOSURE].join(" ")),
  };
}

export function generateContentPack(
  product: Product,
  options?: { variant?: number },
): ContentPack {
  const variant = options?.variant ?? 0;
  const hooks = generateHooks(product, variant).map((h) => softCopy(h));
  const ctas = generateCTAs(variant).map((c) => softCopy(c));
  const tags = generateHashtags(product);
  const pain = firstPain(product);
  const sell = firstSell(product);

  const proofTag = PROOF_STYLE_LABEL[proofStyleForVariant(variant)];
  const proofLineByStyle: Record<ProofStyleVariant, string> = {
    used_real: softCopy(
      `${proofTag}: ลองใช้แล้วชอบจุดนี้ — ${sell} (ไม่การันตีผลทุกคน)`,
    ),
    compare_help: softCopy(
      `${proofTag}: เทียบตัวเลือกสั้น ๆ แล้วดูสเปกต่อเอง — จุดที่น่าสนใจ ${sell}`,
    ),
    spec_point: softCopy(`${proofTag}: ชี้จุดที่ชอบ 1 ข้อ — ${sell}`),
    situation: softCopy(
      `${proofTag}: เคยเจอไหม… ${pain} — แชร์ตัวเลือกที่ช่วยได้`,
    ),
    soft_popular: softCopy(
      `${proofTag}: คนถามบ่อยเรื่องหมวดนี้ — น่าลองดูสเปกก่อน ไม่เร่งซื้อ`,
    ),
  };
  const proofLine = proofLineByStyle[proofStyleForVariant(variant)];

  const facebookBody = softCopy(
    [
      hooks[1],
      "",
      proofLine,
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
    ].join("\n"),
  );

  const facebookGroupBody = softCopy(
    [
      `แชร์ให้เพื่อนในกลุ่มที่กำลังหาของหมวด ${product.category}`,
      "",
      proofLine,
      `บริบท: ${pain}`,
      `สิ่งที่น่าลอง: ${sell}`,
      `ราคาประมาณ ${priceLabel(product.price)} — ไม่การันตีว่าจะเหมาะทุกคน ลองเทียบรีวิวก่อนนะ`,
      "",
      "ถ้าใครใช้ตัวอื่นอยู่ แลกเปลี่ยนประสบการณ์ในคอมเมนต์ได้เลย (ช่วยกันเลือกของ)",
      "",
      ctas[2] ?? ctas[0],
      "",
      `ลิงก์: ${product.affiliateUrl}`,
      "",
      "หมายเหตุ: โพสต์นี้ไม่ใช่สแปมโปรโมทแข็ง — แชร์เป็นตัวเลือกให้พิจารณา",
    ].join("\n"),
  );

  const reelsBody = softCopy(
    [
      hooks[0],
      proofTag,
      `${sell} · ${priceLabel(product.price)}`,
      ctas[2] ?? ctas[0],
      `ลิงก์ในไบโอ/คอมเมนต์`,
      [...tags.th.slice(0, 3), ...tags.en.slice(0, 2)].join(" "),
    ].join("\n"),
  );

  const styleTag = SCRIPT_STYLE_LABEL[scriptStyleForVariant(variant)];
  const videoPriorityNote =
    product.videoEase >= 4
      ? `${styleTag} · ${proofTag} · ถ่ายง่าย: โชว์ปัญหา → สาธิต 1 จุด → ปิดด้วยลิงก์+disclosure (เริ่มตัวนี้ก่อน)`
      : product.videoEase >= 3
        ? `${styleTag} · ${proofTag} · ถ่ายระดับกลาง: เตรียมฉากใช้งานจริง 1 นาที แล้วตัดเหลือ 20–25 วิ`
        : `${styleTag} · ${proofTag} · ถ่ายยากกว่าเพื่อน: ใช้ภาพนิ่ง/สไลด์ + พากย์สั้นก่อน แล้วค่อยทำวิดีโอเต็ม`;

  const noteHint = product.notes?.trim()
    ? `โน้ตจากผู้ใช้: ${softCopy(product.notes.trim()).slice(0, 120)}`
    : null;

  const filmingChecklist = [
    "แสงพอ / มือนิ่ง หรือตั้งขาตั้ง — ถ่ายแนวดิ่ง 9:16",
    `เปิดคลิปด้วย pain: “${pain}” ไม่เกิน 3 วินาที`,
    `สาธิตจุดขายหลัก 1 ข้อ: ${sell}`,
    `โชว์ราคาประมาณ ${priceLabel(product.price)} แบบไม่เร่งซื้อ`,
    ...(noteHint ? [noteHint] : []),
    "ปิดด้วย CTA อ่อนโยน + ใส่ disclosure บนจอหรือในแคปชัน",
    "ตรวจแคปชันซ้ำกับโพสต์วันก่อน — ห้ามก็อปข้อความเดิมทั้งก้อน",
    "โพสต์จริงหลัง Approve ในแดชบอร์ดเท่านั้น",
  ];

  const sellingAngles = generateSellingAngles(product, variant);

  return {
    id: newId("pack"),
    productId: product.id,
    createdAt: new Date().toISOString(),
    disclosure: AFFILIATE_DISCLOSURE,
    hooks,
    ctas,
    hashtagsTh: tags.th,
    hashtagsEn: tags.en,
    tiktokScript: buildTikTokScript(product, hooks, ctas, variant),
    facebookCaption: withDisclosure(facebookBody),
    facebookGroupCaption: withDisclosure(facebookGroupBody),
    reelsCaption: withDisclosure(reelsBody),
    videoPriorityNote,
    filmingChecklist,
    sellingAngles,
    variant,
  };
}
