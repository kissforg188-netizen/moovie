import type { Product, RankedProduct, ScoreBreakdown } from "./types";

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Impulse-buy sweet spot roughly 99–799 THB */
function impulsePriceScore(price: number): number {
  if (price <= 0) return 0;
  if (price >= 99 && price <= 399) return 100;
  if (price > 399 && price <= 799) return 80;
  if (price > 799 && price <= 1499) return 55;
  if (price < 99) return 70;
  if (price <= 2999) return 35;
  return 15;
}

function commissionScore(product: Product): number {
  const rate = product.commissionRate;
  const amount =
    product.commissionAmount ?? (product.price * product.commissionRate) / 100;
  const ratePart = clamp((rate / 30) * 70);
  const amountPart = clamp((amount / 80) * 30);
  return clamp(ratePart + amountPart);
}

function painClarityScore(product: Product): number {
  const pains = product.painPoints.filter((p) => p.trim().length >= 4);
  const points = product.sellingPoints.filter((p) => p.trim().length >= 4);
  if (pains.length === 0) return 20;
  let score = 40 + Math.min(pains.length, 3) * 15;
  if (points.length >= 2) score += 15;
  if (product.targetAudience.trim().length >= 6) score += 10;
  return clamp(score);
}

function videoEaseScore(product: Product): number {
  let score = product.videoFriendly ? 75 : 35;
  const demoHints = ["ก่อน", "หลัง", "เทียบ", "ใช้จริง", "แกะกล่อง", "ทดสอบ"];
  const blob = [...product.sellingPoints, ...product.painPoints, product.notes ?? ""]
    .join(" ")
    .toLowerCase();
  if (demoHints.some((h) => blob.includes(h))) score += 20;
  if (product.category.match(/ความงาม|ครัว|gadget|จัดเก็บ|ไอที|สุขภาพ/i)) {
    score += 10;
  }
  return clamp(score);
}

function seasonalScore(product: Product, now = new Date()): number {
  const tags = product.seasonalTags.map((t) => t.toLowerCase());
  if (tags.length === 0) return 40;
  const month = now.getMonth() + 1;
  const seasonMap: Record<string, number[]> = {
    summer: [3, 4, 5],
    rainy: [6, 7, 8, 9],
    winter: [11, 12, 1, 2],
    ร้อน: [3, 4, 5],
    ฝน: [6, 7, 8, 9],
    หนาว: [11, 12, 1, 2],
    songkran: [4],
    สงกรานต์: [4],
    "back to school": [5, 6],
    เปิดเทอม: [5, 6],
    "double day": [month],
    trending: [month],
    เทรนด์: [month],
  };
  let hit = false;
  for (const tag of tags) {
    for (const [key, months] of Object.entries(seasonMap)) {
      if (tag.includes(key) && months.includes(month)) {
        hit = true;
      }
    }
  }
  if (tags.some((t) => t.includes("trending") || t.includes("เทรนด์"))) {
    return 90;
  }
  return hit ? 85 : 50;
}

function reasonsFor(product: Product, score: ScoreBreakdown): string[] {
  const reasons: string[] = [];
  if (score.commission >= 70) reasons.push("ค่าคอมน่าสนใจเมื่อเทียบกับราคา");
  if (score.impulsePrice >= 80) reasons.push("ราคาอยู่ในช่วงตัดสินใจซื้อง่าย");
  if (score.painClarity >= 70) reasons.push("pain point ชัด เล่าเรื่องในคลิปได้");
  if (score.videoEase >= 70) reasons.push("เหมาะทำวิดีโอสั้น / demo");
  if (score.seasonal >= 80) reasons.push("มีโอกาสตามฤดูกาลหรือเทรนด์");
  if (reasons.length === 0) {
    reasons.push("คะแนนปานกลาง — ทดลองโพสต์แล้ววัดผลจริงก่อนขยาย");
  }
  return reasons;
}

export function scoreProduct(product: Product, now = new Date()): RankedProduct {
  const breakdown: ScoreBreakdown = {
    commission: commissionScore(product),
    impulsePrice: impulsePriceScore(product.price),
    painClarity: painClarityScore(product),
    videoEase: videoEaseScore(product),
    seasonal: seasonalScore(product, now),
    total: 0,
  };
  breakdown.total = Math.round(
    breakdown.commission * 0.25 +
      breakdown.impulsePrice * 0.2 +
      breakdown.painClarity * 0.25 +
      breakdown.videoEase * 0.2 +
      breakdown.seasonal * 0.1
  );
  return {
    product,
    score: breakdown,
    reasons: reasonsFor(product, breakdown),
  };
}

export function rankProducts(products: Product[], limit = 5): RankedProduct[] {
  return [...products]
    .map((p) => scoreProduct(p))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);
}
