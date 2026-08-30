/**
 * Daily Action Digest — one checklist for humans before Approve / evening log.
 * Never auto-publishes; tips only.
 */

import { evaluateApproveGate } from "./approve";
import { scoreCaptionQuality } from "./caption-quality";
import { INCOME_DISCLAIMER } from "./disclosure";
import { buildFilmingQueue } from "./filming";
import { buildPauseSuggestions } from "./pause-suggestions";
import { channelLabel } from "./schedule";
import { rankProducts } from "./scoring";
import type { Database, DraftStatus, ScheduledPost } from "./types";
import { dateFromYmd } from "./db";

export type DigestPriority = "now" | "soon" | "later";

export interface DigestAction {
  id: string;
  priority: DigestPriority;
  title: string;
  detail: string;
  href?: string;
}

export interface DailyDigest {
  date: string;
  summary: string;
  counts: {
    draftPending: number;
    approveBlocked: number;
    approvedWaitingPost: number;
    missingMetrics: number;
    activeProducts: number;
    pausedProducts: number;
  };
  actions: DigestAction[];
  lines: string[];
  disclaimer: string;
}

function ymdOffset(date: string, days: number): string {
  const d = dateFromYmd(date);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function productName(db: Database, productId: string): string {
  return db.products.find((p) => p.id === productId)?.name ?? productId;
}

function isMissingMetrics(post: ScheduledPost): boolean {
  if (post.status !== "posted") return false;
  const m = post.metrics;
  if (!m) return true;
  // Treat all-zero with no notes as "not filled yet" for evening nudge
  const empty =
    (m.views ?? 0) === 0 &&
    (m.clicks ?? 0) === 0 &&
    (m.orders ?? 0) === 0 &&
    (m.commissionEarned ?? 0) === 0 &&
    !m.notes;
  return empty;
}

/**
 * Build a human action checklist for the given Bangkok calendar date.
 */
export function buildDailyDigest(
  db: Database,
  date: string,
): DailyDigest {
  const today = db.schedule.filter((s) => s.date === date);
  const yesterday = ymdOffset(date, -1);
  const recentPosted = db.schedule.filter(
    (s) =>
      s.status === "posted" &&
      (s.date === date || s.date === yesterday),
  );

  const drafts = today.filter((s) => s.status === "draft");
  const approved = today.filter((s) => s.status === "approved");
  const blocked = drafts.filter(
    (s) => !evaluateApproveGate(s.captionPreview).ok,
  );
  const missingMetricsPosts = recentPosted.filter(isMissingMetrics);

  const activeProducts = db.products.filter((p) => p.active !== false);
  const pausedProducts = db.products.filter((p) => p.active === false);

  const ranked = rankProducts(
    db.products,
    5,
    db.schedule,
    db.learning,
    dateFromYmd(date),
  );
  const packsForRanked = ranked
    .map((r) =>
      db.contentPacks
        .filter((p) => p.productId === r.product.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    )
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const filming = buildFilmingQueue(
    ranked,
    packsForRanked,
    db.schedule,
    date,
  );
  const pauses = buildPauseSuggestions({
    products: db.products,
    schedule: db.schedule,
    learning: db.learning,
  });

  const actions: DigestAction[] = [];

  if (drafts.length === 0 && today.length === 0) {
    actions.push({
      id: "run-morning",
      priority: "now",
      title: "รัน Morning workflow",
      detail:
        "ยังไม่มี draft วันนี้ — รัน Morning เพื่อคัด Top 5 + สร้างตาราง draft (ยังไม่โพสต์จริง)",
      href: "/automation",
    });
  }

  for (const s of blocked.slice(0, 5)) {
    const gate = evaluateApproveGate(s.captionPreview);
    actions.push({
      id: `blocked-${s.id}`,
      priority: "now",
      title: `แก้แคปชันก่อน Approve · ${productName(db, s.productId)}`,
      detail: `${channelLabel(s.channel)} ${s.suggestedTime} — ${gate.errors[0] ?? "ไม่ผ่านเกณฑ์"}`,
      href: "/calendar",
    });
  }

  for (const s of drafts.filter((d) => evaluateApproveGate(d.captionPreview).ok).slice(0, 5)) {
    const q = scoreCaptionQuality(s.captionPreview, s.channel);
    actions.push({
      id: `review-${s.id}`,
      priority: q.grade === "D" || q.grade === "C" ? "soon" : "now",
      title: `ตรวจ draft เกรด ${q.grade} · ${productName(db, s.productId)}`,
      detail: `${channelLabel(s.channel)} ${s.suggestedTime} · คะแนนคุณภาพ ${q.score}/100${q.tips[0] ? ` — ${q.tips[0]}` : ""}`,
      href: "/calendar",
    });
  }

  for (const s of approved.slice(0, 5)) {
    actions.push({
      id: `post-${s.id}`,
      priority: "soon",
      title: `โพสต์ด้วยมือแล้วกดยืนยัน · ${productName(db, s.productId)}`,
      detail: `${channelLabel(s.channel)} แนะนำ ${s.suggestedTime} — คัดลอกจาก Posting Pack แล้วโพสต์เอง (ระบบไม่โพสต์ให้อัตโนมัติ)`,
      href: "/calendar",
    });
  }

  for (const s of missingMetricsPosts.slice(0, 5)) {
    actions.push({
      id: `metrics-${s.id}`,
      priority: "soon",
      title: `กรอกผลโพสต์ · ${productName(db, s.productId)}`,
      detail: `${s.date} ${channelLabel(s.channel)} — ใส่ views/clicks/orders/ค่าคอม ที่ /results เพื่อให้ Evening เรียนรู้`,
      href: "/results",
    });
  }

  if (filming.length > 0) {
    const top = filming[0];
    actions.push({
      id: "film-top",
      priority: drafts.length > 0 ? "later" : "soon",
      title: `ถ่ายคลิปก่อน: ${top.productName}`,
      detail: top.reason,
      href: "/products",
    });
  }

  if (pauses.length > 0) {
    actions.push({
      id: "pause-soft",
      priority: "later",
      title: `พิจารณาพักสินค้า ${pauses.length} ชิ้น (คำแนะนำ)`,
      detail: pauses[0]?.reason ?? "ดู soft pause suggestions จาก Evening",
      href: "/products",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "idle-ok",
      priority: "later",
      title: "คิววันนี้เรียบร้อย",
      detail:
        "ไม่มี draft ค้าง / ไม่มีผลที่ต้องกรอก — พักหรือเพิ่มสินค้าใหม่ได้เมื่อพร้อม",
      href: "/affiliate",
    });
  }

  const priorityRank: Record<DigestPriority, number> = {
    now: 0,
    soon: 1,
    later: 2,
  };
  actions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  const counts = {
    draftPending: drafts.length,
    approveBlocked: blocked.length,
    approvedWaitingPost: approved.length,
    missingMetrics: missingMetricsPosts.length,
    activeProducts: activeProducts.length,
    pausedProducts: pausedProducts.length,
  };

  const summary =
    [
      `วันนี้ draft ${counts.draftPending}`,
      counts.approveBlocked ? `บล็อก Approve ${counts.approveBlocked}` : null,
      counts.approvedWaitingPost
        ? `รอโพสต์มือ ${counts.approvedWaitingPost}`
        : null,
      counts.missingMetrics ? `รอกรอกผล ${counts.missingMetrics}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "ไม่มีคิวค้างวันนี้";

  const base: DailyDigest = {
    date,
    summary,
    counts,
    actions,
    lines: [],
    disclaimer: INCOME_DISCLAIMER,
  };
  return { ...base, lines: digestLines(base) };
}

export function digestLines(digest: DailyDigest): string[] {
  const out: string[] = [
    `Digest ${digest.date}: ${digest.summary}`,
    `สินค้า active ${digest.counts.activeProducts} · พัก ${digest.counts.pausedProducts}`,
  ];
  for (const a of digest.actions.slice(0, 12)) {
    const tag =
      a.priority === "now" ? "ตอนนี้" : a.priority === "soon" ? "ถัดไป" : "ภายหลัง";
    out.push(`[${tag}] ${a.title} — ${a.detail}`);
  }
  out.push(digest.disclaimer);
  return out;
}

export function dailyDigestToMarkdown(digest: DailyDigest): string {
  const sections = [
    `# เลือกดี — Daily Action Digest (${digest.date})`,
    "",
    `> ${digest.disclaimer}`,
    "",
    `## สรุป`,
    digest.summary,
    "",
    `## ตัวเลข`,
    `- Draft รอตรวจ: ${digest.counts.draftPending}`,
    `- บล็อก Approve: ${digest.counts.approveBlocked}`,
    `- อนุมัติแล้วรอโพสต์มือ: ${digest.counts.approvedWaitingPost}`,
    `- โพสต์แล้วรอกรอกผล: ${digest.counts.missingMetrics}`,
    `- สินค้า active / พัก: ${digest.counts.activeProducts} / ${digest.counts.pausedProducts}`,
    "",
    `## เช็กลิสต์`,
    ...digest.actions.map(
      (a, i) =>
        `${i + 1}. **[${a.priority}]** ${a.title}\n   ${a.detail}${a.href ? ` → ${a.href}` : ""}`,
    ),
    "",
    `_ไม่โพสต์อัตโนมัติ — Approve แล้วคัดลอกไปโพสต์ด้วยมือ_`,
    "",
  ];
  return sections.join("\n");
}

/** Statuses that still occupy today's "active" posting slot. */
export function activeDraftStatuses(): DraftStatus[] {
  return ["draft", "approved", "posted"];
}
