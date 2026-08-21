import type { LearningState, Product, ScheduledPost } from "./types";

export interface PauseSuggestion {
  productId: string;
  productName: string;
  reason: string;
}

/**
 * Soft suggestions only — never auto-pauses products.
 * Uses evening underperformers + posted history with weak conversion.
 */
export function buildPauseSuggestions(params: {
  products: Product[];
  schedule: ScheduledPost[];
  learning?: LearningState | null;
  /** Minimum posted samples with metrics before suggesting pause. */
  minPostedSamples?: number;
}): PauseSuggestion[] {
  const minPosted = params.minPostedSamples ?? 2;
  const under = new Set(params.learning?.underperformerProductIds ?? []);
  const vanity = new Set(params.learning?.vanityProductIds ?? []);
  const suggestions: PauseSuggestion[] = [];

  for (const product of params.products) {
    if (product.active === false) continue;

    const posted = params.schedule.filter(
      (s) =>
        s.productId === product.id &&
        s.status === "posted" &&
        s.metrics != null,
    );
    if (posted.length < minPosted) continue;

    const orders = posted.reduce((n, s) => n + (s.metrics?.orders ?? 0), 0);
    const clicks = posted.reduce((n, s) => n + (s.metrics?.clicks ?? 0), 0);
    const commission = posted.reduce(
      (n, s) => n + (s.metrics?.commissionEarned ?? 0),
      0,
    );

    const reasons: string[] = [];
    if (under.has(product.id) && orders === 0) {
      reasons.push(
        `อ่อนใน Learning และยังไม่มีออเดอร์จาก ${posted.length} โพสต์ที่บันทึกผล`,
      );
    }
    if (vanity.has(product.id) && orders === 0) {
      reasons.push("วิวสูงแต่ยังไม่แปลงเป็นออเดอร์ (vanity) — ลองพักหรือเปลี่ยนมุมขาย");
    }
    if (clicks >= 20 && orders === 0 && commission <= 0) {
      reasons.push(
        `คลิก ${clicks} ครั้งแล้วยังไม่มีออเดอร์/ค่าคอม — อาจไม่เหมาะกลุ่มเป้าหมาย`,
      );
    }

    if (reasons.length === 0) continue;
    suggestions.push({
      productId: product.id,
      productName: product.name,
      reason: reasons.join(" · "),
    });
  }

  return suggestions.slice(0, 5);
}

export function pauseSuggestionLines(
  suggestions: PauseSuggestion[],
): string[] {
  if (suggestions.length === 0) {
    return [
      "ยังไม่มีคำแนะนำพักสินค้า — เก็บผลโพสต์ต่ออีก 2–3 ชิ้นก่อนตัดสินใจ",
    ];
  }
  return [
    `แนะนำพิจารณาพักชั่วคราว ${suggestions.length} สินค้า (ไม่พักอัตโนมัติ — กดพักเองที่ /products):`,
    ...suggestions.map(
      (s, i) => `${i + 1}) ${s.productName} — ${s.reason}`,
    ),
  ];
}
