import type { PostPerformance } from "./analytics";
import type { ContentChannel, LearningState } from "./types";

/**
 * Build experimental learning hints from evening performance.
 * Soft signals only — never claims guaranteed income or auto-publishes.
 */
export function buildLearningState(
  performances: PostPerformance[],
  sourceDate: string,
): LearningState {
  const notes: string[] = [];
  const winnerProductIds: string[] = [];

  if (performances.length === 0) {
    return {
      updatedAt: new Date().toISOString(),
      sourceDate,
      winnerProductIds: [],
      notes: [
        "ยังไม่มีเมตริกพอสำหรับเรียนรู้ — วันถัดไปทดลองโพสต์คุณภาพ 1–2 ชิ้นแล้วกรอกผล",
      ],
    };
  }

  const sorted = [...performances].sort((a, b) => b.score - a.score);
  for (const w of sorted.slice(0, 3)) {
    if (!winnerProductIds.includes(w.post.productId)) {
      winnerProductIds.push(w.post.productId);
    }
  }

  const byChannel = new Map<ContentChannel, { n: number; score: number }>();
  for (const p of performances) {
    const cur = byChannel.get(p.post.channel) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    byChannel.set(p.post.channel, cur);
  }
  let preferredChannel: ContentChannel | undefined;
  if (byChannel.size > 0) {
    preferredChannel = [...byChannel.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0][0];
    notes.push(
      `ทดลองเน้นช่องทาง ${preferredChannel} มากขึ้นเล็กน้อย (จากข้อมูลเย็น ${sourceDate})`,
    );
  }

  const hookBuckets = new Map<number, { n: number; score: number }>();
  const ctaBuckets = new Map<number, { n: number; score: number }>();
  for (const p of performances) {
    const h = hookBuckets.get(p.post.hookIndex) ?? { n: 0, score: 0 };
    h.n += 1;
    h.score += p.score;
    hookBuckets.set(p.post.hookIndex, h);
    const c = ctaBuckets.get(p.post.ctaIndex) ?? { n: 0, score: 0 };
    c.n += 1;
    c.score += p.score;
    ctaBuckets.set(p.post.ctaIndex, c);
  }

  let preferredHookIndex: number | undefined;
  let preferredCtaIndex: number | undefined;
  if (hookBuckets.size >= 2) {
    preferredHookIndex = [...hookBuckets.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0][0];
    notes.push(`สมมติฐาน hook #${preferredHookIndex + 1} ดีกว่าในชุดข้อมูลเล็กนี้`);
  }
  if (ctaBuckets.size >= 2) {
    preferredCtaIndex = [...ctaBuckets.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0][0];
    notes.push(`สมมติฐาน CTA #${preferredCtaIndex + 1} ดีกว่าในชุดข้อมูลเล็กนี้`);
  }

  if (winnerProductIds.length) {
    notes.push(
      `สินค้าที่คะแนนดีกว่าในชุดข้อมูล: เก็บไว้ทดลองต่อ (ไม่การันตีผลซ้ำ)`,
    );
  }

  return {
    updatedAt: new Date().toISOString(),
    sourceDate,
    preferredChannel,
    preferredHookIndex,
    preferredCtaIndex,
    winnerProductIds,
    notes,
  };
}

/** Soft total-score boost 0–8 for products that won in recent evening learning. */
export function learningRankBoost(
  productId: string,
  learning?: LearningState | null,
): number {
  if (!learning?.winnerProductIds?.length) return 0;
  const idx = learning.winnerProductIds.indexOf(productId);
  if (idx === -1) return 0;
  return Math.max(0, 8 - idx * 2);
}
