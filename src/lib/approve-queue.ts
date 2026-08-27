/**
 * Approve Priority Queue — order today's drafts for human review.
 * Never auto-publishes; ready items still need explicit Approve.
 */

import { evaluateApproveGate } from "./approve";
import {
  qualityLabelTh,
  scoreCaptionQuality,
  type QualityGrade,
} from "./caption-quality";
import { AFFILIATE_DISCLOSURE, INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import { expectedCommissionBaht, expectedCommissionScore } from "./scoring";
import type {
  ContentChannel,
  Database,
  DraftStatus,
  Product,
  ScheduledPost,
} from "./types";

export type ApproveQueueBand = "ready" | "fix_first" | "blocked";

export interface ApproveQueueItem {
  scheduleId: string;
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabelTh: string;
  suggestedTime: string;
  status: DraftStatus;
  gateOk: boolean;
  gateErrors: string[];
  qualityGrade: QualityGrade;
  qualityScore: number;
  /** Soft 0–100 review order — experimental, not income. */
  priority: number;
  band: ApproveQueueBand;
  reason: string;
  nextAction: string;
  href: string;
  expectedBaht: number;
}

export interface ApproveQueue {
  date: string;
  summary: string;
  counts: {
    ready: number;
    fixFirst: number;
    blocked: number;
    total: number;
  };
  items: ApproveQueueItem[];
  lines: string[];
  disclaimer: string;
}

const BAND_RANK: Record<ApproveQueueBand, number> = {
  ready: 0,
  fix_first: 1,
  blocked: 2,
};

function productById(db: Database, id: string): Product | undefined {
  return db.products.find((p) => p.id === id);
}

function isDraft(status: DraftStatus): boolean {
  return status === "draft";
}

function bandFor(
  gateOk: boolean,
  grade: QualityGrade,
): ApproveQueueBand {
  if (!gateOk) return "blocked";
  if (grade === "C" || grade === "D") return "fix_first";
  return "ready";
}

function nextActionFor(
  band: ApproveQueueBand,
  gateErrors: string[],
  tips: string[],
): string {
  if (band === "blocked") {
    return gateErrors[0] ?? "แก้ disclosure / คำโฆษณาก่อน Approve";
  }
  if (band === "fix_first") {
    return tips[0]
      ? `ปรับแคปชัน: ${tips[0]}`
      : "ปรับน้ำเสียง/ความยาวแล้วค่อย Approve";
  }
  return "Approve ได้ — แล้วยังต้องโพสต์ด้วยมือ (ระบบไม่โพสต์ให้อัตโนมัติ)";
}

/**
 * Soft priority for human review order.
 * Ready + higher quality + better expected baht + earlier slot → higher.
 */
export function scoreApprovePriority(input: {
  gateOk: boolean;
  qualityScore: number;
  qualityGrade: QualityGrade;
  expectedBahtScore: number;
  videoEase: number;
  channel: ContentChannel;
  suggestedTime: string;
}): number {
  let score = 0;
  score += Math.min(40, input.expectedBahtScore * 0.35);
  score += Math.min(35, input.qualityScore * 0.35);

  const shortForm =
    input.channel === "tiktok" || input.channel === "facebook_reels";
  if (shortForm) {
    score += Math.min(12, Math.max(0, input.videoEase) * 2.2);
  } else {
    score += 4;
  }

  const hour = Number((input.suggestedTime || "12:00").slice(0, 2));
  if (Number.isFinite(hour)) {
    // Earlier daytime slots slightly first so filming/posting isn't rushed
    score += Math.max(0, 10 - Math.abs(hour - 10) * 0.8);
  }

  if (!input.gateOk) {
    score *= 0.35;
  } else if (input.qualityGrade === "C") {
    score *= 0.75;
  } else if (input.qualityGrade === "D") {
    score *= 0.55;
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

function reasonFor(item: {
  band: ApproveQueueBand;
  qualityGrade: QualityGrade;
  qualityScore: number;
  expectedBaht: number;
  channelLabelTh: string;
}): string {
  const baht =
    item.expectedBaht > 0
      ? `คอมคาดการณ์ ~฿${Math.round(item.expectedBaht)}/ชิ้น`
      : "ยังไม่ครบราคา/คอม";
  if (item.band === "blocked") {
    return `บล็อก Approve · ${item.channelLabelTh} · คุณภาพ ${item.qualityGrade} (${item.qualityScore}) · ${baht}`;
  }
  if (item.band === "fix_first") {
    return `ควรปรับแคปชันก่อน · ${item.channelLabelTh} · ${qualityLabelTh(item.qualityGrade)} · ${baht}`;
  }
  return `พร้อมตรวจ Approve · ${item.channelLabelTh} · ${qualityLabelTh(item.qualityGrade)} · ${baht}`;
}

export function buildApproveQueue(
  db: Database,
  date: string,
): ApproveQueue {
  const drafts = db.schedule
    .filter((s) => s.date === date && isDraft(s.status))
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const items: ApproveQueueItem[] = drafts.map((post) => {
    const product = productById(db, post.productId);
    const gate = evaluateApproveGate(post.captionPreview, AFFILIATE_DISCLOSURE);
    const quality = scoreCaptionQuality(post.captionPreview, post.channel);
    const band = bandFor(gate.ok, quality.grade);
    const expectedBaht = product
      ? expectedCommissionBaht(product.price, product.commissionRate)
      : 0;
    const expectedBahtScore = product
      ? expectedCommissionScore(product.price, product.commissionRate)
      : 0;
    const priority = scoreApprovePriority({
      gateOk: gate.ok,
      qualityScore: quality.score,
      qualityGrade: quality.grade,
      expectedBahtScore,
      videoEase: product?.videoEase ?? 3,
      channel: post.channel,
      suggestedTime: post.suggestedTime,
    });
    const channelLabelTh = channelLabel(post.channel);
    const productName = product?.name ?? post.productId;
    return {
      scheduleId: post.id,
      productId: post.productId,
      productName,
      channel: post.channel,
      channelLabelTh,
      suggestedTime: post.suggestedTime,
      status: post.status,
      gateOk: gate.ok,
      gateErrors: gate.errors,
      qualityGrade: quality.grade,
      qualityScore: quality.score,
      priority,
      band,
      reason: reasonFor({
        band,
        qualityGrade: quality.grade,
        qualityScore: quality.score,
        expectedBaht,
        channelLabelTh,
      }),
      nextAction: nextActionFor(band, gate.errors, quality.tips),
      href: "/calendar",
      expectedBaht,
    };
  });

  items.sort((a, b) => {
    const bandDiff = BAND_RANK[a.band] - BAND_RANK[b.band];
    if (bandDiff !== 0) return bandDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.suggestedTime.localeCompare(b.suggestedTime);
  });

  const counts = {
    ready: items.filter((i) => i.band === "ready").length,
    fixFirst: items.filter((i) => i.band === "fix_first").length,
    blocked: items.filter((i) => i.band === "blocked").length,
    total: items.length,
  };

  const summary =
    counts.total === 0
      ? `คิว Approve ${date}: ยังไม่มี draft — รัน Morning ก่อน`
      : `คิว Approve ${date}: พร้อม ${counts.ready} · ควรแก้ ${counts.fixFirst} · บล็อก ${counts.blocked} (ไม่โพสต์อัตโนมัติ)`;

  const lines = [`Approve Queue ${date}: ${summary}`];
  for (const item of items.slice(0, 5)) {
    const tag =
      item.band === "ready"
        ? "พร้อม"
        : item.band === "fix_first"
          ? "แก้ก่อน"
          : "บล็อก";
    lines.push(
      `[${tag}] ${item.suggestedTime} ${item.productName} · ${item.channelLabelTh} · ลำดับ ${item.priority} · ${item.nextAction}`,
    );
  }
  if (counts.ready > 0) {
    const first = items.find((i) => i.band === "ready");
    if (first) {
      lines.push(
        `เริ่ม Approve จาก: ${first.productName} (${first.suggestedTime} · ${first.channelLabelTh})`,
      );
    }
  } else if (counts.blocked > 0 || counts.fixFirst > 0) {
    lines.push(
      "ยังไม่มีชิ้นพร้อม Approve — กดสร้างแคปชันใหม่หรือแก้ disclosure ก่อน",
    );
  }
  lines.push("ทุกชิ้นยังเป็น draft จนกว่าคุณจะ Approve แล้วโพสต์ด้วยมือ");

  return {
    date,
    summary,
    counts,
    items,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function approveQueueLines(queue: ApproveQueue, limit = 6): string[] {
  return queue.lines.slice(0, Math.max(1, limit));
}

export function approveQueueToMarkdown(queue: ApproveQueue): string {
  const rows = queue.items.map(
    (i, idx) =>
      `${idx + 1}. **[${i.band}]** ${i.suggestedTime} · ${i.productName} · ${i.channelLabelTh}\n` +
      `   ลำดับ ${i.priority}/100 · คุณภาพ ${i.qualityGrade} (${i.qualityScore}) · gate ${i.gateOk ? "ผ่าน" : "ไม่ผ่าน"}\n` +
      `   ${i.reason}\n` +
      `   ทำต่อ: ${i.nextAction}`,
  );
  return [
    `# Approve Priority Queue · ${queue.date}`,
    "",
    queue.summary,
    "",
    `- พร้อม Approve: ${queue.counts.ready}`,
    `- ควรแก้แคปชันก่อน: ${queue.counts.fixFirst}`,
    `- บล็อก (disclosure/คำโฆษณา): ${queue.counts.blocked}`,
    "",
    "## ลำดับแนะนำให้ตรวจ",
    ...(rows.length ? rows : ["_(ยังไม่มี draft วันนี้)_"]),
    "",
    "> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ",
    "",
    queue.disclaimer,
    "",
  ].join("\n");
}

/** Helper for tests / callers that only have a post list. */
export function queueDraftPosts(
  posts: ScheduledPost[],
  products: Product[],
  date: string,
): ApproveQueue {
  return buildApproveQueue(
    {
      products,
      contentPacks: [],
      schedule: posts,
      briefs: [],
      automationLogs: [],
    },
    date,
  );
}
