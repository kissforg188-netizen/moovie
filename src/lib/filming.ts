/**
 * Filming priority queue — decide which short videos to shoot first today.
 * Combines ease-of-shoot, rank fit, expected commission, and whether a draft
 * is already on today's calendar. Never claims guaranteed income.
 */

import { expectedCommissionBaht } from "./scoring";
import type { ContentPack, Product, RankedProduct, ScheduledPost } from "./types";
import { INCOME_DISCLAIMER } from "./disclosure";

export interface FilmingQueueItem {
  productId: string;
  productName: string;
  platform: Product["platform"];
  videoEase: number;
  rankIndex: number;
  rankTotal: number;
  expectedBaht: number;
  onTodaySchedule: boolean;
  /** Soft 0–100 priority for filming order (experimental). */
  priority: number;
  reason: string;
  firstChecklist?: string;
  sellingAngle?: string;
  videoPriorityNote: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Rank top products into a shoot-first queue.
 * Higher priority = film earlier. Soft heuristic only.
 */
export function buildFilmingQueue(
  ranked: RankedProduct[],
  packs: ContentPack[],
  schedule: ScheduledPost[] = [],
  date?: string,
): FilmingQueueItem[] {
  const packByProduct = new Map<string, ContentPack>();
  for (const pack of packs) {
    const prev = packByProduct.get(pack.productId);
    if (!prev || pack.createdAt >= prev.createdAt) {
      packByProduct.set(pack.productId, pack);
    }
  }

  const todayIds = new Set(
    schedule
      .filter(
        (s) =>
          (!date || s.date === date) &&
          s.status !== "skipped" &&
          (s.channel === "tiktok" || s.channel === "facebook_reels"),
      )
      .map((s) => s.productId),
  );

  const items: FilmingQueueItem[] = ranked.map((r, index) => {
    const pack = packByProduct.get(r.product.id);
    const baht = expectedCommissionBaht(
      r.product.price,
      r.product.commissionRate,
    );
    const ease = clamp(r.product.videoEase, 1, 5);
    const rankFit = ranked.length <= 1 ? 100 : (1 - index / (ranked.length - 1)) * 100;
    const bahtScore = clamp((baht / 40) * 100, 0, 100);
    const onToday = todayIds.has(r.product.id);
    // Ease 40% · rank 30% · expected baht 20% · calendar boost 10%
    const priority =
      ease * 20 * 0.4 +
      rankFit * 0.3 +
      bahtScore * 0.2 +
      (onToday ? 10 : 0);

    const reasons: string[] = [];
    if (ease >= 4) reasons.push("ถ่ายง่าย");
    else if (ease <= 2) reasons.push("ถ่ายยากกว่า — เตรียมสไลด์/พากย์สั้นก่อน");
    if (index === 0) reasons.push("ติด Top ranking");
    if (baht >= 20) reasons.push(`ค่าคอมคาดหวัง ~฿${baht.toFixed(0)}/ชิ้น`);
    if (onToday) reasons.push("มีคิว short/reels วันนี้");
    if (reasons.length === 0) reasons.push("ลำดับตามคะแนนรวมทดลอง");

    return {
      productId: r.product.id,
      productName: r.product.name,
      platform: r.product.platform,
      videoEase: ease,
      rankIndex: index + 1,
      rankTotal: r.score.total,
      expectedBaht: Math.round(baht * 10) / 10,
      onTodaySchedule: onToday,
      priority: Math.round(priority * 10) / 10,
      reason: reasons.join(" · "),
      firstChecklist: pack?.filmingChecklist?.[0],
      sellingAngle: pack?.sellingAngles?.[0],
      videoPriorityNote:
        pack?.videoPriorityNote ??
        "เตรียมคลิปสั้น pain → สาธิต 1 จุด → CTA + disclosure",
    };
  });

  return items.sort((a, b) => b.priority - a.priority);
}

/** Short Thai lines for morning brief recommendations. */
export function filmingQueueLines(queue: FilmingQueueItem[], limit = 3): string[] {
  if (queue.length === 0) return ["ยังไม่มีคิวถ่ายวิดีโอ — เพิ่มสินค้าแล้วรัน Morning"];
  const top = queue.slice(0, limit);
  const lines = [
    `คิวถ่ายวิดีโอวันนี้ (ทดลอง): ${top.map((q, i) => `${i + 1}) ${q.productName}`).join(" → ")}`,
  ];
  for (const q of top) {
    lines.push(
      `ถ่าย #${q.rankIndex} ${q.productName}: ${q.reason} — ${q.videoPriorityNote}`,
    );
  }
  return lines;
}

/** Markdown export for a filming day plan. */
export function filmingQueueToMarkdown(
  queue: FilmingQueueItem[],
  date: string,
): string {
  const lines: string[] = [
    `# คิวถ่ายวิดีโอ — ${date}`,
    "",
    `> ${INCOME_DISCLAIMER}`,
    "",
    "ลำดับด้านล่างเป็นคำแนะนำทดลอง (ease × ranking × ค่าคอมคาดหวัง × คิววันนี้) ไม่การันตียอดขาย",
    "",
    "| ลำดับ | สินค้า | ความง่าย | ค่าคอมคาดหวัง | คิววันนี้ | เหตุผล |",
    "|---:|---|---:|---:|:---:|---|",
  ];

  queue.forEach((q, i) => {
    lines.push(
      `| ${i + 1} | ${q.productName} | ${q.videoEase}/5 | ~฿${q.expectedBaht} | ${q.onTodaySchedule ? "✓" : "—"} | ${q.reason} |`,
    );
  });

  lines.push("", "## Checklist ต่อชิ้น", "");
  for (const q of queue) {
    lines.push(`### ${q.productName}`);
    lines.push(`- แพลตฟอร์ม: ${q.platform}`);
    lines.push(`- โน้ตถ่าย: ${q.videoPriorityNote}`);
    if (q.sellingAngle) lines.push(`- มุมขาย: ${q.sellingAngle}`);
    if (q.firstChecklist) lines.push(`- ขั้นแรก: ${q.firstChecklist}`);
    lines.push("- ใส่ disclosure บนจอหรือในแคปชันทุกครั้ง");
    lines.push("- โพสต์จริงหลัง Approve ในแดชบอร์ดเท่านั้น");
    lines.push("");
  }

  return lines.join("\n");
}
