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
  const underperformerProductIds: string[] = [];
  const vanityProductIds: string[] = [];

  if (performances.length === 0) {
    return {
      updatedAt: new Date().toISOString(),
      sourceDate,
      winnerProductIds: [],
      underperformerProductIds: [],
      vanityProductIds: [],
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

  // Soft underperformers: bottom scorers clearly below the top (small-n experiment).
  // Protect only the #1 product so small samples (2 posts) can still mark a weak #2.
  const topScore = sorted[0]?.score ?? 0;
  const protectedId = sorted[0]?.post.productId;
  for (const weak of [...sorted].reverse()) {
    if (underperformerProductIds.length >= 2) break;
    if (weak.post.productId === protectedId) continue;
    if (topScore > 0 && weak.score <= topScore * 0.35) {
      if (!underperformerProductIds.includes(weak.post.productId)) {
        underperformerProductIds.push(weak.post.productId);
      }
    }
  }
  if (underperformerProductIds.length) {
    notes.push(
      "สินค้าที่คะแนนอ่อนในชุดข้อมูลนี้ถูกลดน้ำหนักเล็กน้อยวันถัดไป — ลองเปลี่ยนมุมหรือพัก ไม่ใช่ห้ามถาวร",
    );
  }

  // Vanity / engagement-bait: high views, zero orders (soft signal)
  for (const p of performances) {
    const views = p.post.metrics?.views ?? 0;
    const orders = p.post.metrics?.orders ?? 0;
    if (views >= 500 && orders === 0) {
      if (!vanityProductIds.includes(p.post.productId)) {
        vanityProductIds.push(p.post.productId);
      }
    }
  }
  if (vanityProductIds.length) {
    notes.push(
      "มีโพสต์วิวสูงแต่ยังไม่มียอดสั่ง — ลองปรับ hook ให้ตรง pain หรือ CTA อ่อนลง (ทดลอง ไม่การันตี)",
    );
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

  // Preferred time slot (HH:mm) from scores
  const byTime = new Map<string, { n: number; score: number }>();
  for (const p of performances) {
    const t = p.post.suggestedTime;
    if (!t) continue;
    const cur = byTime.get(t) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    byTime.set(t, cur);
  }
  let preferredTime: string | undefined;
  if (byTime.size >= 2) {
    preferredTime = [...byTime.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0][0];
    notes.push(
      `สมมติฐานช่วงเวลา ${preferredTime} ให้คะแนนเฉลี่ยดีกว่าในชุดข้อมูลเล็กนี้`,
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
    preferredTime,
    winnerProductIds,
    underperformerProductIds,
    vanityProductIds,
    notes,
  };
}

/** Soft total-score delta for products from recent evening learning (−6…+8). */
export function learningRankBoost(
  productId: string,
  learning?: LearningState | null,
): number {
  if (!learning) return 0;
  // Underperformer penalty wins over winner boost when both appear in small-n samples.
  if (learning.underperformerProductIds?.includes(productId)) {
    return -4;
  }
  let boost = 0;
  if (learning.winnerProductIds?.length) {
    const idx = learning.winnerProductIds.indexOf(productId);
    if (idx !== -1) boost = Math.max(0, 8 - idx * 2);
  }
  // Mild vanity penalty (views without orders) — stacks lightly under winners
  if (learning.vanityProductIds?.includes(productId)) {
    boost -= 2;
  }
  return boost;
}
