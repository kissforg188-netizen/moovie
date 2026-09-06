/**
 * Manual Publish Queue — order approved drafts for human posting.
 * Never auto-publishes; checklist only after Approve.
 */

import { evaluateApproveGate } from "./approve";
import { bangkokParts } from "./db";
import { AFFILIATE_DISCLOSURE, INCOME_DISCLAIMER } from "./disclosure";
import { buildPostingPack } from "./posting-pack";
import { channelLabel } from "./schedule";
import { expectedCommissionBaht, expectedCommissionScore } from "./scoring";
import type {
  ContentChannel,
  ContentPack,
  Database,
  Product,
  ScheduledPost,
} from "./types";

export type PublishBand = "overdue" | "due_now" | "today" | "upcoming";
export type PublishGrade = "A" | "B" | "C" | "D";

export interface PublishQueueItem {
  scheduleId: string;
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabelTh: string;
  date: string;
  suggestedTime: string;
  status: "approved";
  band: PublishBand;
  /** Soft 0–100 post-now order — experimental, not income. */
  priority: number;
  packReady: boolean;
  gateOk: boolean;
  gateErrors: string[];
  needsFilm: boolean;
  steps: string[];
  reason: string;
  nextAction: string;
  href: string;
  expectedBaht: number;
}

export interface PublishAction {
  id: string;
  title: string;
  detail: string;
}

export interface PublishQueue {
  date: string;
  nowHm: string;
  grade: PublishGrade;
  score: number;
  summary: string;
  counts: {
    overdue: number;
    dueNow: number;
    today: number;
    upcoming: number;
    total: number;
    needsAttention: number;
  };
  items: PublishQueueItem[];
  actions: PublishAction[];
  checklist: string[];
  lines: string[];
  disclaimer: string;
}

const BAND_RANK: Record<PublishBand, number> = {
  overdue: 0,
  due_now: 1,
  today: 2,
  upcoming: 3,
};

const BAND_LABEL_TH: Record<PublishBand, string> = {
  overdue: "ค้าง",
  due_now: "ถึงเวลา",
  today: "วันนี้",
  upcoming: "เร็วๆ นี้",
};

function productById(db: Database, id: string): Product | undefined {
  return db.products.find((p) => p.id === id);
}

function packFor(db: Database, post: ScheduledPost): ContentPack | undefined {
  return (
    db.contentPacks.find((p) => p.id === post.contentPackId) ??
    db.contentPacks
      .filter((p) => p.productId === post.productId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  );
}

function needsFilmChannel(channel: ContentChannel): boolean {
  return channel === "tiktok" || channel === "facebook_reels";
}

function parseHm(hm: string): number {
  const [h, m] = (hm || "12:00").split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 12 * 60;
  return h * 60 + m;
}

function bandFor(
  postDate: string,
  suggestedTime: string,
  today: string,
  nowMinutes: number,
): PublishBand {
  if (postDate < today) return "overdue";
  if (postDate > today) return "upcoming";
  const slot = parseHm(suggestedTime);
  if (slot <= nowMinutes) return "due_now";
  return "today";
}

/**
 * Soft priority for human publish order.
 * Overdue / due_now + pack ready + compliant + short-form ease → higher.
 */
export function scorePublishPriority(input: {
  band: PublishBand;
  gateOk: boolean;
  packReady: boolean;
  needsFilm: boolean;
  videoEase: number;
  expectedBahtScore: number;
  suggestedTime: string;
  nowMinutes: number;
}): number {
  let score = 40;
  if (input.band === "overdue") score += 35;
  else if (input.band === "due_now") score += 28;
  else if (input.band === "today") score += 14;
  else score += 4;

  if (input.packReady) score += 12;
  if (input.gateOk) score += 10;
  else score -= 25;

  score += Math.min(12, input.expectedBahtScore * 0.12);

  if (input.needsFilm) {
    score += Math.min(10, Math.max(0, input.videoEase) * 1.8);
  } else {
    score += 5;
  }

  if (input.band === "today" || input.band === "due_now") {
    const delta = Math.abs(parseHm(input.suggestedTime) - input.nowMinutes);
    score += Math.max(0, 8 - delta / 30);
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

function buildSteps(input: {
  band: PublishBand;
  gateOk: boolean;
  packReady: boolean;
  needsFilm: boolean;
  channelLabelTh: string;
}): string[] {
  const steps: string[] = [];
  if (!input.gateOk) {
    steps.push("แก้ disclosure / คำโฆษณาก่อน (หรือ regenerate แล้ว Approve ใหม่)");
  }
  if (!input.packReady) {
    steps.push("เปิดตารางโพสต์ → คัดลอก Posting Pack");
  } else {
    steps.push("คัดลอก Posting Pack (แคปชัน + ลิงก์ + hashtag)");
  }
  if (input.needsFilm) {
    steps.push(`ถ่าย/อัปโหลดคลิปสั้นสำหรับ ${input.channelLabelTh}`);
  } else {
    steps.push(`วางแคปชันลง ${input.channelLabelTh} ด้วยมือ`);
  }
  steps.push("ตรวจ disclosure ในโพสต์จริงอีกครั้ง");
  steps.push("หลังโพสต์แล้ว → กด Mark posted ที่ตาราง");
  if (input.band === "overdue") {
    steps.unshift("ชิ้นนี้ค้างจากวันก่อน — โพสต์หรือ Skip เพื่อไม่ให้คิวตัน");
  }
  return steps;
}

function gradeFromScore(score: number): PublishGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * Build manual publish queue for approved-but-not-posted items.
 * Optional `now` injects Bangkok clock for tests.
 */
export function buildPublishQueue(
  db: Database,
  date: string,
  now: Date = new Date(),
): PublishQueue {
  const parts = bangkokParts(now);
  const nowHm = parts.hm;
  const nowMinutes = parts.hour * 60 + parts.minute;

  const approved = db.schedule.filter((s) => s.status === "approved");

  const items: PublishQueueItem[] = approved.map((post) => {
    const product = productById(db, post.productId);
    const pack = packFor(db, post);
    const gate = evaluateApproveGate(post.captionPreview, AFFILIATE_DISCLOSURE);
    const postingPack = buildPostingPack(post, product, pack);
    const band = bandFor(post.date, post.suggestedTime, date, nowMinutes);
    const needsFilm = needsFilmChannel(post.channel);
    const expectedBaht = product
      ? expectedCommissionBaht(product.price, product.commissionRate)
      : 0;
    const expectedBahtScore = product
      ? expectedCommissionScore(product.price, product.commissionRate)
      : 0;
    const priority = scorePublishPriority({
      band,
      gateOk: gate.ok,
      packReady: postingPack.readyToCopy,
      needsFilm,
      videoEase: product?.videoEase ?? 3,
      expectedBahtScore,
      suggestedTime: post.suggestedTime,
      nowMinutes,
    });
    const channelLabelTh = channelLabel(post.channel);
    const productName = product?.name ?? post.productId;
    const steps = buildSteps({
      band,
      gateOk: gate.ok,
      packReady: postingPack.readyToCopy,
      needsFilm,
      channelLabelTh,
    });
    const baht =
      expectedBaht > 0
        ? `คอมคาดการณ์ ~฿${Math.round(expectedBaht)}/ชิ้น`
        : "ยังไม่ครบราคา/คอม";
    const reason = `${BAND_LABEL_TH[band]} · ${channelLabelTh} · ${post.date} ${post.suggestedTime} · ${baht}${
      gate.ok ? "" : " · gate ไม่ผ่าน"
    }`;
    const nextAction = !gate.ok
      ? gate.errors[0] ?? "แก้แคปชัน/disclosure ก่อนโพสต์"
      : band === "overdue"
        ? "โพสต์ค้างก่อน หรือ Skip ถ้าเลิกโปรโมตมุมนี้"
        : band === "due_now"
          ? "ถึงเวลาแล้ว — คัดลอก pack แล้วโพสต์ด้วยมือ"
          : band === "today"
            ? `รอถึง ${post.suggestedTime} หรือโพสต์เมื่อพร้อม (ยังไม่ auto)`
            : `เตรียมล่วงหน้าสำหรับ ${post.date}`;

    return {
      scheduleId: post.id,
      productId: post.productId,
      productName,
      channel: post.channel,
      channelLabelTh,
      date: post.date,
      suggestedTime: post.suggestedTime,
      status: "approved",
      band,
      priority,
      packReady: postingPack.readyToCopy,
      gateOk: gate.ok,
      gateErrors: gate.errors,
      needsFilm,
      steps,
      reason,
      nextAction,
      href: "/calendar",
      expectedBaht,
    };
  });

  items.sort((a, b) => {
    const bandDiff = BAND_RANK[a.band] - BAND_RANK[b.band];
    if (bandDiff !== 0) return bandDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.suggestedTime.localeCompare(b.suggestedTime);
  });

  const counts = {
    overdue: items.filter((i) => i.band === "overdue").length,
    dueNow: items.filter((i) => i.band === "due_now").length,
    today: items.filter((i) => i.band === "today").length,
    upcoming: items.filter((i) => i.band === "upcoming").length,
    total: items.length,
    needsAttention: items.filter(
      (i) => i.band === "overdue" || i.band === "due_now" || !i.gateOk,
    ).length,
  };

  let score = 100;
  score -= Math.min(40, counts.overdue * 18);
  score -= Math.min(20, counts.dueNow * 6);
  const blocked = items.filter((i) => !i.gateOk).length;
  score -= Math.min(25, blocked * 12);
  const notReady = items.filter((i) => !i.packReady).length;
  score -= Math.min(10, notReady * 4);
  if (counts.total === 0) score = 90;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);

  const summary =
    counts.total === 0
      ? `คิวโพสต์มือ ${date}: ยังไม่มีชิ้นที่ Approve — ตรวจคิว Approve ก่อน (ระบบไม่โพสต์ให้อัตโนมัติ)`
      : `คิวโพสต์มือ ${date}: ค้าง ${counts.overdue} · ถึงเวลา ${counts.dueNow} · วันนี้ ${counts.today} · เร็วๆ นี้ ${counts.upcoming} · เกรดคิว ${grade}`;

  const actions: PublishAction[] = [];
  if (counts.overdue > 0) {
    const first = items.find((i) => i.band === "overdue");
    actions.push({
      id: "clear-overdue",
      title: "เคลียร์โพสต์ค้าง",
      detail: first
        ? `เริ่มที่ ${first.productName} (${first.channelLabelTh}) — โพสต์หรือ Skip`
        : `มี ${counts.overdue} ชิ้นค้าง`,
    });
  }
  if (counts.dueNow > 0) {
    const first = items.find((i) => i.band === "due_now" && i.gateOk);
    actions.push({
      id: "post-due",
      title: "โพสต์ชิ้นที่ถึงเวลา",
      detail: first
        ? `${first.suggestedTime} · ${first.productName} · คัดลอก Posting Pack`
        : `มี ${counts.dueNow} ชิ้นถึงเวลาแล้ว`,
    });
  }
  if (blocked > 0) {
    actions.push({
      id: "fix-gate",
      title: "แก้ชิ้นที่ gate ไม่ผ่าน",
      detail: "อย่าโพสต์ถ้าขาด disclosure หรือมีคำโฆษณาเกินจริง",
    });
  }
  if (counts.today > 0 && counts.dueNow === 0 && counts.overdue === 0) {
    const next = items.find((i) => i.band === "today");
    actions.push({
      id: "prep-today",
      title: "เตรียมแพ็กวันนี้",
      detail: next
        ? `ชิ้นถัดไป ${next.suggestedTime} · ${next.productName}`
        : "เตรียมแคปชัน/คลิปก่อนถึงเวลา",
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "approve-first",
      title: "Approve draft ก่อน",
      detail: "คิวโพสต์มือว่าง — ไปที่ Approve Queue แล้วค่อยกลับมาโพสต์ด้วยมือ",
    });
  }

  const checklist = [
    "โพสต์เฉพาะชิ้นที่สถานะ approved เท่านั้น",
    "คัดลอก Posting Pack แล้ววางด้วยมือ — ระบบไม่โพสต์อัตโนมัติ",
    "ตรวจ disclosure ในโพสต์จริงทุกครั้ง",
    "หลังโพสต์ กด Mark posted แล้วกรอกผลเย็นที่ Results Intake",
    "ชิ้นค้างหลายวัน → โพสต์หรือ Skip เพื่อไม่ให้ซ้ำ/สแปม",
  ];

  const lines = [
    `Publish Queue · ${date} ${nowHm}: เกรด ${grade} (${score}/100)`,
    summary,
  ];
  for (const item of items.slice(0, 5)) {
    lines.push(
      `[${BAND_LABEL_TH[item.band]}] ${item.date} ${item.suggestedTime} ${item.productName} · ${item.channelLabelTh} · ลำดับ ${item.priority} · ${item.nextAction}`,
    );
  }
  if (counts.needsAttention > 0) {
    const first = items.find(
      (i) => i.band === "overdue" || i.band === "due_now" || !i.gateOk,
    );
    if (first) {
      lines.push(
        `เริ่มโพสต์จาก: ${first.productName} (${first.date} ${first.suggestedTime} · ${first.channelLabelTh})`,
      );
    }
  } else if (counts.total > 0) {
    lines.push("คิววันนี้ยังไม่ถึงเวลา — เตรียม pack/คลิปล่วงหน้าได้");
  } else {
    lines.push("ยังไม่มี approved รอโพสต์ — อย่าโพสต์จาก draft โดยตรง");
  }
  lines.push("ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ");

  return {
    date,
    nowHm,
    grade,
    score,
    summary,
    counts,
    items,
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function publishQueueLines(queue: PublishQueue, limit = 6): string[] {
  return queue.lines.slice(0, Math.max(1, limit));
}

export function publishQueueToMarkdown(queue: PublishQueue): string {
  const rows = queue.items.map((i, idx) => {
    const steps = i.steps.map((s) => `   - ${s}`).join("\n");
    return (
      `${idx + 1}. **[${BAND_LABEL_TH[i.band]}]** ${i.date} ${i.suggestedTime} · ${i.productName} · ${i.channelLabelTh}\n` +
      `   ลำดับ ${i.priority}/100 · pack ${i.packReady ? "พร้อมคัดลอก" : "ยังไม่พร้อม"} · gate ${i.gateOk ? "ผ่าน" : "ไม่ผ่าน"}\n` +
      `   ${i.reason}\n` +
      `   ทำต่อ: ${i.nextAction}\n` +
      `   Checklist:\n${steps}`
    );
  });

  const actionLines = queue.actions.map(
    (a) => `- **${a.title}**: ${a.detail}`,
  );

  return [
    `# Manual Publish Queue · ${queue.date} (${queue.nowHm})`,
    "",
    queue.summary,
    "",
    `- เกรดคิว: ${queue.grade} (${queue.score}/100)`,
    `- ค้าง: ${queue.counts.overdue}`,
    `- ถึงเวลา: ${queue.counts.dueNow}`,
    `- วันนี้ (ยังไม่ถึงเวลา): ${queue.counts.today}`,
    `- เร็วๆ นี้: ${queue.counts.upcoming}`,
    "",
    "## ลำดับแนะนำให้โพสต์ด้วยมือ",
    ...(rows.length ? rows : ["_(ยังไม่มีชิ้นที่ Approve)_"]),
    "",
    "## Actions",
    ...actionLines,
    "",
    "## Checklist",
    ...queue.checklist.map((c) => `- ${c}`),
    "",
    "> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องคัดลอกไปโพสต์ด้วยมือ แล้ว Mark posted",
    "",
    queue.disclaimer,
    "",
  ].join("\n");
}
