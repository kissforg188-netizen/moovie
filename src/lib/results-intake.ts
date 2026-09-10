/**
 * Results Intake Queue — evening checklist for posts missing metrics.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentChannel,
  Database,
  PostMetrics,
  Product,
  ScheduledPost,
} from "./types";

export type IntakeGrade = "A" | "B" | "C" | "D";
export type IntakeBand = "overdue" | "today" | "partial" | "complete";

export type IntakeMetricField =
  | "views"
  | "clicks"
  | "orders"
  | "commission"
  | "notes";

export interface IntakeRow {
  scheduleId: string;
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabel: string;
  date: string;
  suggestedTime: string;
  daysAgo: number;
  band: IntakeBand;
  missingFields: IntakeMetricField[];
  filledFields: IntakeMetricField[];
  /** Soft 0–100 field completeness (views/clicks/orders/commission/notes). */
  completeness: number;
  /** Soft 0–100 fill-first priority for evening ritual. */
  priority: number;
  tip: string;
  href: string;
}

export interface IntakeAction {
  id: string;
  title: string;
  detail: string;
}

export interface ResultsIntake {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: IntakeGrade;
  score: number;
  summary: string;
  counts: {
    overdue: number;
    today: number;
    partial: number;
    complete: number;
    needsAttention: number;
    postedInWindow: number;
  };
  rows: IntakeRow[];
  actions: IntakeAction[];
  checklist: string[];
  lines: string[];
  disclaimer: string;
}

const BAND_RANK: Record<IntakeBand, number> = {
  overdue: 0,
  today: 1,
  partial: 2,
  complete: 3,
};

const CORE_FIELDS: IntakeMetricField[] = [
  "views",
  "clicks",
  "orders",
  "commission",
];

function productName(db: Database, id: string): string {
  return db.products.find((p: Product) => p.id === id)?.name ?? id;
}

function ymdOffset(date: string, days: number): string {
  const d = dateFromYmd(date);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = dateFromYmd(fromYmd).getTime();
  const b = dateFromYmd(toYmd).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function inspectMetrics(metrics?: PostMetrics): {
  missingFields: IntakeMetricField[];
  filledFields: IntakeMetricField[];
  completeness: number;
  isEmpty: boolean;
} {
  const missing: IntakeMetricField[] = [];
  const filled: IntakeMetricField[] = [];

  if (!metrics) {
    return {
      missingFields: [...CORE_FIELDS, "notes"],
      filledFields: [],
      completeness: 0,
      isEmpty: true,
    };
  }

  const checks: Array<{ field: IntakeMetricField; ok: boolean }> = [
    { field: "views", ok: (metrics.views ?? 0) > 0 },
    { field: "clicks", ok: (metrics.clicks ?? 0) > 0 },
    { field: "orders", ok: (metrics.orders ?? 0) > 0 },
    { field: "commission", ok: (metrics.commissionEarned ?? 0) > 0 },
    { field: "notes", ok: Boolean(metrics.notes?.trim()) },
  ];

  for (const c of checks) {
    if (c.ok) filled.push(c.field);
    else missing.push(c.field);
  }

  // Completeness weights core fields higher than notes
  let score = 0;
  if ((metrics.views ?? 0) > 0) score += 25;
  if ((metrics.clicks ?? 0) > 0) score += 25;
  if ((metrics.orders ?? 0) > 0 || (metrics.commissionEarned ?? 0) > 0) {
    // Orders or commission both count as conversion signal
    score += 25;
  } else if (
    (metrics.views ?? 0) > 0 &&
    (metrics.clicks ?? 0) === 0 &&
    (metrics.orders ?? 0) === 0
  ) {
    // Views-only still partial credit for starting the log
    score += 5;
  }
  if ((metrics.commissionEarned ?? 0) > 0) score += 15;
  if (metrics.notes?.trim()) score += 10;

  const empty =
    (metrics.views ?? 0) === 0 &&
    (metrics.clicks ?? 0) === 0 &&
    (metrics.orders ?? 0) === 0 &&
    (metrics.commissionEarned ?? 0) === 0 &&
    !metrics.notes?.trim();

  return {
    missingFields: missing,
    filledFields: filled,
    completeness: Math.max(0, Math.min(100, score)),
    isEmpty: empty,
  };
}

function bandFor(input: {
  date: string;
  today: string;
  isEmpty: boolean;
  completeness: number;
}): IntakeBand {
  if (input.completeness >= 75 && !input.isEmpty) return "complete";
  if (!input.isEmpty && input.completeness > 0 && input.completeness < 75) {
    return "partial";
  }
  if (input.date === input.today) return "today";
  return "overdue";
}

function tipFor(row: {
  band: IntakeBand;
  missingFields: IntakeMetricField[];
  daysAgo: number;
  channelLabel: string;
}): string {
  if (row.band === "complete") {
    return "ผลครบพอวิเคราะห์ต่อได้ — ไม่ต้องกรอกซ้ำถ้าตัวเลขตรงแล้ว";
  }
  if (row.band === "partial") {
    const miss = row.missingFields
      .filter((f) => f !== "notes")
      .slice(0, 3)
      .join(", ");
    return miss
      ? `มีผลบางส่วน — เติม ${miss} แล้วค่อยรัน Evening`
      : "มีผลบางส่วน — เติม notes สั้น ๆ ช่วยจำมุมขายได้";
  }
  if (row.band === "today") {
    return `โพสต์วันนี้บน ${row.channelLabel} — กรอก views/clicks หลังโพสต์ด้วยมือ`;
  }
  return `ค้างมา ${row.daysAgo} วัน — กรอกผลก่อนเพื่อให้ learning เย็นนี้มีข้อมูล`;
}

/**
 * Soft priority for evening fill order.
 * Overdue + emptier + short-form + earlier slot → higher.
 */
export function scoreIntakePriority(input: {
  band: IntakeBand;
  completeness: number;
  daysAgo: number;
  channel: ContentChannel;
  suggestedTime: string;
}): number {
  let score = 40;
  if (input.band === "overdue") score += 35;
  else if (input.band === "today") score += 22;
  else if (input.band === "partial") score += 15;
  else score -= 20;

  score += Math.min(25, (100 - input.completeness) * 0.25);
  score += Math.min(15, input.daysAgo * 4);

  const shortForm =
    input.channel === "tiktok" || input.channel === "facebook_reels";
  if (shortForm) score += 8;
  else score += 3;

  const hour = Number((input.suggestedTime || "12:00").slice(0, 2));
  if (Number.isFinite(hour)) {
    score += Math.max(0, 6 - Math.abs(hour - 12) * 0.4);
  }

  if (input.band === "complete") score *= 0.25;

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

function gradeFromScore(score: number): IntakeGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * Build evening Results Intake Queue for a Bangkok calendar day.
 */
export function buildResultsIntake(
  db: Database,
  date: string,
  windowDays = 7,
): ResultsIntake {
  const window = Math.max(3, Math.min(14, Math.round(windowDays)));
  const fromDate = ymdOffset(date, -(window - 1));

  const posted = db.schedule
    .filter(
      (s: ScheduledPost) =>
        s.status === "posted" && s.date >= fromDate && s.date <= date,
    )
    .slice();

  const rows: IntakeRow[] = posted.map((s) => {
    const inspected = inspectMetrics(s.metrics);
    const daysAgo = daysBetween(s.date, date);
    const band = bandFor({
      date: s.date,
      today: date,
      isEmpty: inspected.isEmpty,
      completeness: inspected.completeness,
    });
    const rowBase = {
      band,
      missingFields: inspected.missingFields,
      daysAgo,
      channelLabel: channelLabel(s.channel),
    };
    return {
      scheduleId: s.id,
      productId: s.productId,
      productName: productName(db, s.productId),
      channel: s.channel,
      channelLabel: rowBase.channelLabel,
      date: s.date,
      suggestedTime: s.suggestedTime,
      daysAgo,
      band,
      missingFields: inspected.missingFields,
      filledFields: inspected.filledFields,
      completeness: inspected.completeness,
      priority: scoreIntakePriority({
        band,
        completeness: inspected.completeness,
        daysAgo,
        channel: s.channel,
        suggestedTime: s.suggestedTime,
      }),
      tip: tipFor(rowBase),
      href: "/results",
    };
  });

  rows.sort((a, b) => {
    const bandDiff = BAND_RANK[a.band] - BAND_RANK[b.band];
    if (bandDiff !== 0) return bandDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.date.localeCompare(b.date) || a.suggestedTime.localeCompare(b.suggestedTime);
  });

  const counts = {
    overdue: rows.filter((r) => r.band === "overdue").length,
    today: rows.filter((r) => r.band === "today").length,
    partial: rows.filter((r) => r.band === "partial").length,
    complete: rows.filter((r) => r.band === "complete").length,
    needsAttention: rows.filter((r) => r.band !== "complete").length,
    postedInWindow: rows.length,
  };

  // Health score: completeness of posted metrics in window
  let score = 100;
  if (counts.postedInWindow === 0) {
    score = 70; // no posts yet — neutral, not punishment
  } else {
    const avgCompleteness =
      rows.reduce((sum, r) => sum + r.completeness, 0) / counts.postedInWindow;
    score = Math.round(avgCompleteness);
    score -= Math.min(25, counts.overdue * 8);
    score -= Math.min(15, counts.partial * 4);
    score += Math.min(10, counts.complete * 2);
  }
  score = Math.max(0, Math.min(100, score));
  const grade = gradeFromScore(score);

  const actions: IntakeAction[] = [];
  if (counts.overdue > 0) {
    const first = rows.find((r) => r.band === "overdue");
    actions.push({
      id: "fill-overdue",
      title: `กรอกผลค้าง ${counts.overdue} ชิ้นก่อน`,
      detail: first
        ? `เริ่มที่ “${first.productName}” (${first.channelLabel}) · ${first.tip}`
        : "โพสต์เก่าที่ยังไม่มีตัวเลขทำให้ learning อ่อน",
    });
  }
  if (counts.today > 0) {
    actions.push({
      id: "fill-today",
      title: `บันทึกผลโพสต์วันนี้ ${counts.today} ชิ้น`,
      detail: "หลังโพสต์ด้วยมือ ให้กรอก views/clicks อย่างน้อย — ค่าคอมใส่ทีหลังได้",
    });
  }
  if (counts.partial > 0) {
    actions.push({
      id: "finish-partial",
      title: `เติมผลบางส่วน ${counts.partial} ชิ้น`,
      detail: "มีตัวเลขไม่ครบ — เติม orders/commission แล้วรัน Evening อีกรอบ (force)",
    });
  }
  if (counts.needsAttention === 0 && counts.postedInWindow > 0) {
    actions.push({
      id: "run-evening",
      title: "ผลครบแล้ว — รัน Evening ได้",
      detail: "ระบบจะสรุปมุมที่เวิร์กและ foreshadow วันถัดไป (ยังไม่โพสต์อัตโนมัติ)",
    });
  }
  if (counts.postedInWindow === 0) {
    actions.push({
      id: "post-first",
      title: "ยังไม่มีโพสต์ในหน้าต่างนี้",
      detail: "Approve draft → โพสต์ด้วยมือ → กลับมากรอกผลที่นี่",
    });
  }

  const checklist = [
    "โพสต์ด้วยมือเท่านั้น — ระบบไม่ยิงโพสต์ให้อัตโนมัติ",
    "กรอก views / clicks อย่างน้อยสำหรับทุกโพสต์ที่ขึ้นสถานะ posted",
    "ใส่ commission เมื่อมีออเดอร์จริง — ห้ามเดาตัวเลข",
    "ถ้ายังไม่มียอด ให้ใส่ notes ว่า “ยังไม่แปลง” เพื่อไม่ให้ว่างทั้งก้อน",
    "มี disclosure ในแคปชันทุกครั้งก่อนโพสต์",
    "ตัวเลขเป็นการทดลอง ไม่รับประกันรายได้",
  ];

  const summaryParts: string[] = [];
  if (counts.postedInWindow === 0) {
    summaryParts.push("ยังไม่มีโพสต์ใน 7 วันล่าสุดให้กรอกผล");
  } else if (counts.needsAttention === 0) {
    summaryParts.push(
      `ผลครบ ${counts.complete}/${counts.postedInWindow} ชิ้น — พร้อมวิเคราะห์เย็น`,
    );
  } else {
    summaryParts.push(
      `รอกรอก/เติมผล ${counts.needsAttention}/${counts.postedInWindow} ชิ้น (ค้าง ${counts.overdue} · วันนี้ ${counts.today} · บางส่วน ${counts.partial})`,
    );
  }
  summaryParts.push(`เกรดข้อมูล ${grade} (${score}/100)`);

  const attention = rows.filter((r) => r.band !== "complete").slice(0, 5);
  const lines: string[] = [
    `Results Intake: ${summaryParts.join(" · ")}`,
    ...attention.map(
      (r, i) =>
        `กรอกผล #${i + 1}: ${r.productName} · ${r.channelLabel} · ${r.band} · ขาด ${r.missingFields.slice(0, 3).join("/") || "—"}`,
    ),
  ];
  if (actions[0]) {
    lines.push(`ทำก่อน: ${actions[0].title}`);
  }

  return {
    date,
    fromDate,
    windowDays: window,
    grade,
    score,
    summary: summaryParts.join(" · "),
    counts,
    rows,
    actions,
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function resultsIntakeLines(
  intake: ResultsIntake,
  limit = 6,
): string[] {
  return intake.lines.slice(0, limit);
}

export function resultsIntakeToMarkdown(intake: ResultsIntake): string {
  const attention = intake.rows.filter((r) => r.band !== "complete");
  const queue =
    attention.length === 0
      ? "- ไม่มีรายการค้าง — ผลครบในหน้าต่างนี้"
      : attention
          .map(
            (r, i) =>
              `${i + 1}. **${r.productName}** · ${r.channelLabel} · ${r.date} ${r.suggestedTime}\n` +
              `   - แบนด์: ${r.band} · ความครบ ${r.completeness}/100 · ลำดับ ${r.priority}\n` +
              `   - ขาด: ${r.missingFields.join(", ") || "—"}\n` +
              `   - มีแล้ว: ${r.filledFields.join(", ") || "—"}\n` +
              `   - ${r.tip}`,
          )
          .join("\n");

  const complete =
    intake.rows.filter((r) => r.band === "complete").length === 0
      ? "- ยังไม่มีชิ้นที่ครบพอ"
      : intake.rows
          .filter((r) => r.band === "complete")
          .slice(0, 8)
          .map(
            (r) =>
              `- **${r.productName}** · ${r.channelLabel} · ${r.date} (${r.completeness}/100)`,
          )
          .join("\n");

  const actions = intake.actions
    .map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`)
    .join("\n");
  const checklist = intake.checklist.map((c) => `- [ ] ${c}`).join("\n");

  return (
    `# Results Intake · ${intake.date}\n\n` +
    `เกรด **${intake.grade}** (${intake.score}/100)\n\n` +
    `${intake.summary}\n\n` +
    `หน้าต่าง: ${intake.fromDate} → ${intake.date} (${intake.windowDays} วัน)\n\n` +
    `## สรุปจำนวน\n` +
    `- โพสต์ในหน้าต่าง: ${intake.counts.postedInWindow}\n` +
    `- ต้องสนใจ: ${intake.counts.needsAttention}\n` +
    `- ค้าง (overdue): ${intake.counts.overdue}\n` +
    `- วันนี้: ${intake.counts.today}\n` +
    `- บางส่วน: ${intake.counts.partial}\n` +
    `- ครบ: ${intake.counts.complete}\n\n` +
    `## คิวกรอกผล (เรียงลำดับ)\n${queue}\n\n` +
    `## ผลครบแล้ว\n${complete}\n\n` +
    `## ทำก่อน\n${actions}\n\n` +
    `## Checklist\n${checklist}\n\n` +
    `${intake.disclaimer}\n` +
    `> ไม่โพสต์อัตโนมัติ — กรอกผลด้วยมือหลังโพสต์จริง\n`
  );
}
