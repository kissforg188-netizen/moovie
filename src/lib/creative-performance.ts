/**
 * Creative Performance Board — soft leaderboard for hooks / CTAs / combos.
 * Uses manually logged metrics only. Never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentChannel,
  ContentPack,
  Database,
  PostMetrics,
  ScheduledPost,
} from "./types";

export type CreativeGrade = "A" | "B" | "C" | "D";
export type AngleBand = "leader" | "solid" | "thin" | "weak";
export type AngleKind = "hook" | "cta";

export interface CreativeAngleRow {
  kind: AngleKind;
  index: number;
  label: string;
  fingerprint: string;
  samples: number;
  avgScore: number;
  totalCommission: number;
  totalOrders: number;
  avgCtr: number;
  channels: ContentChannel[];
  band: AngleBand;
  tip: string;
}

export interface CreativeComboRow {
  hookIndex: number;
  ctaIndex: number;
  hookLabel: string;
  ctaLabel: string;
  samples: number;
  avgScore: number;
  totalCommission: number;
  tip: string;
}

export interface CreativeAction {
  id: string;
  title: string;
  detail: string;
}

export interface CreativePerformance {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: CreativeGrade;
  score: number;
  summary: string;
  counts: {
    withMetrics: number;
    uniqueHooks: number;
    uniqueCtas: number;
    combos: number;
    leaders: number;
    weak: number;
  };
  hooks: CreativeAngleRow[];
  ctas: CreativeAngleRow[];
  combos: CreativeComboRow[];
  tryNext: string[];
  avoidReuse: string[];
  actions: CreativeAction[];
  checklist: string[];
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

function truncate(text: string, max = 56): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Normalize hook/CTA text for grouping near-duplicates. */
export function creativeFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function packFor(
  db: Database,
  post: ScheduledPost,
): ContentPack | undefined {
  return (
    db.contentPacks.find((p) => p.id === post.contentPackId) ??
    db.contentPacks
      .filter((p) => p.productId === post.productId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  );
}

function resolveAngle(
  pack: ContentPack | undefined,
  kind: AngleKind,
  index: number,
): { label: string; fingerprint: string; index: number } {
  const list = kind === "hook" ? pack?.hooks : pack?.ctas;
  const raw =
    list?.[index] ??
    list?.[0] ??
    (kind === "hook" ? `hook #${index + 1}` : `CTA #${index + 1}`);
  return {
    index,
    label: truncate(raw),
    fingerprint: creativeFingerprint(raw) || `${kind}:${index}`,
  };
}

function hasUsableMetrics(m?: PostMetrics): boolean {
  if (!m) return false;
  return (
    m.views > 0 ||
    m.clicks > 0 ||
    m.orders > 0 ||
    m.commissionEarned > 0 ||
    Boolean(m.notes?.trim())
  );
}

function softScore(m: PostMetrics): {
  score: number;
  ctr: number;
  commission: number;
  orders: number;
} {
  const views = Math.max(m.views, 0);
  const clicks = Math.max(m.clicks, 0);
  const orders = Math.max(m.orders, 0);
  const commission = Math.max(m.commissionEarned, 0);
  const ctr = views > 0 ? clicks / views : 0;
  const ordersPerClick = clicks > 0 ? orders / clicks : 0;
  const score =
    ctr * 40 +
    ordersPerClick * 30 +
    Math.min(commission / 100, 1) * 20 +
    Math.min(commission / Math.max(clicks, 1), 10);
  return { score, ctr, commission, orders };
}

function bandFor(avgScore: number, samples: number): AngleBand {
  if (samples < 2) return "thin";
  if (avgScore >= 18) return "leader";
  if (avgScore >= 10) return "solid";
  return "weak";
}

function tipFor(row: {
  kind: AngleKind;
  band: AngleBand;
  samples: number;
  label: string;
}): string {
  const kindTh = row.kind === "hook" ? "hook" : "CTA";
  if (row.band === "thin") {
    return `${kindTh} นี้มี n=${row.samples} — ทดลองซ้ำอีก 1–2 ครั้งก่อนสรุป`;
  }
  if (row.band === "leader") {
    return `${kindTh} นี้คะแนนเฉลี่ยดีในชุดข้อมูล (ทดลอง) — ใช้เป็นสมมติฐาน ไม่การันตี`;
  }
  if (row.band === "solid") {
    return `${kindTh} ใช้ได้ — ลองจับคู่กับช่องทางอื่นหรือปรับแคปชันเล็กน้อย`;
  }
  return `${kindTh} อ่อนในชุดนี้ — พักซ้ำข้อความเดิม ลองมุมใหม่หลัง Approve`;
}

interface Acc {
  kind: AngleKind;
  index: number;
  label: string;
  fingerprint: string;
  samples: number;
  scoreSum: number;
  ctrSum: number;
  commission: number;
  orders: number;
  channels: Set<ContentChannel>;
}

function toAngleRow(acc: Acc): CreativeAngleRow {
  const avgScore = acc.samples > 0 ? acc.scoreSum / acc.samples : 0;
  const avgCtr = acc.samples > 0 ? acc.ctrSum / acc.samples : 0;
  const band = bandFor(avgScore, acc.samples);
  const row: CreativeAngleRow = {
    kind: acc.kind,
    index: acc.index,
    label: acc.label,
    fingerprint: acc.fingerprint,
    samples: acc.samples,
    avgScore: Math.round(avgScore * 10) / 10,
    totalCommission: Math.round(acc.commission * 100) / 100,
    totalOrders: acc.orders,
    avgCtr: Math.round(avgCtr * 1000) / 1000,
    channels: [...acc.channels],
    band,
    tip: "",
  };
  row.tip = tipFor(row);
  return row;
}

function gradeFrom(counts: {
  withMetrics: number;
  uniqueHooks: number;
  uniqueCtas: number;
  leaders: number;
}): { grade: CreativeGrade; score: number } {
  let score = 35;
  score += Math.min(30, counts.withMetrics * 5);
  score += Math.min(15, counts.uniqueHooks * 4);
  score += Math.min(10, counts.uniqueCtas * 4);
  score += Math.min(10, counts.leaders * 5);
  score = Math.max(0, Math.min(100, Math.round(score)));
  let grade: CreativeGrade = "D";
  if (score >= 80) grade = "A";
  else if (score >= 65) grade = "B";
  else if (score >= 50) grade = "C";
  return { grade, score };
}

/**
 * Build creative performance board for a calendar day (Asia/Bangkok YMD).
 */
export function buildCreativePerformance(
  db: Database,
  date: string,
  windowDays = 7,
): CreativePerformance {
  const window = Math.max(3, Math.min(14, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));

  const posted = db.schedule.filter(
    (s) =>
      s.status === "posted" &&
      s.date >= fromDate &&
      s.date <= date &&
      hasUsableMetrics(s.metrics),
  );

  const hookMap = new Map<string, Acc>();
  const ctaMap = new Map<string, Acc>();
  const comboMap = new Map<
    string,
    {
      hookIndex: number;
      ctaIndex: number;
      hookLabel: string;
      ctaLabel: string;
      samples: number;
      scoreSum: number;
      commission: number;
    }
  >();

  for (const post of posted) {
    const m = post.metrics!;
    const { score, ctr, commission, orders } = softScore(m);
    const pack = packFor(db, post);
    const hook = resolveAngle(pack, "hook", post.hookIndex);
    const cta = resolveAngle(pack, "cta", post.ctaIndex);

    const hookKey = `hook:${hook.fingerprint}`;
    const hookAcc =
      hookMap.get(hookKey) ??
      ({
        kind: "hook" as const,
        index: hook.index,
        label: hook.label,
        fingerprint: hook.fingerprint,
        samples: 0,
        scoreSum: 0,
        ctrSum: 0,
        commission: 0,
        orders: 0,
        channels: new Set<ContentChannel>(),
      } satisfies Acc);
    hookAcc.samples += 1;
    hookAcc.scoreSum += score;
    hookAcc.ctrSum += ctr;
    hookAcc.commission += commission;
    hookAcc.orders += orders;
    hookAcc.channels.add(post.channel);
    hookMap.set(hookKey, hookAcc);

    const ctaKey = `cta:${cta.fingerprint}`;
    const ctaAcc =
      ctaMap.get(ctaKey) ??
      ({
        kind: "cta" as const,
        index: cta.index,
        label: cta.label,
        fingerprint: cta.fingerprint,
        samples: 0,
        scoreSum: 0,
        ctrSum: 0,
        commission: 0,
        orders: 0,
        channels: new Set<ContentChannel>(),
      } satisfies Acc);
    ctaAcc.samples += 1;
    ctaAcc.scoreSum += score;
    ctaAcc.ctrSum += ctr;
    ctaAcc.commission += commission;
    ctaAcc.orders += orders;
    ctaAcc.channels.add(post.channel);
    ctaMap.set(ctaKey, ctaAcc);

    const comboKey = `${hook.fingerprint}||${cta.fingerprint}`;
    const combo =
      comboMap.get(comboKey) ??
      {
        hookIndex: hook.index,
        ctaIndex: cta.index,
        hookLabel: hook.label,
        ctaLabel: cta.label,
        samples: 0,
        scoreSum: 0,
        commission: 0,
      };
    combo.samples += 1;
    combo.scoreSum += score;
    combo.commission += commission;
    comboMap.set(comboKey, combo);
  }

  const hooks = [...hookMap.values()]
    .map(toAngleRow)
    .sort((a, b) => b.avgScore - a.avgScore || b.samples - a.samples);
  const ctas = [...ctaMap.values()]
    .map(toAngleRow)
    .sort((a, b) => b.avgScore - a.avgScore || b.samples - a.samples);
  const combos: CreativeComboRow[] = [...comboMap.values()]
    .map((c) => {
      const avgScore = c.samples > 0 ? c.scoreSum / c.samples : 0;
      let tip = "ข้อมูลบาง — ทดลองซ้ำก่อนสรุป";
      if (c.samples >= 2 && avgScore >= 18) {
        tip =
          "คู่ hook+CTA นี้น่าสนใจในชุดข้อมูล (ทดลอง) — อย่าสแปมซ้ำวันติด";
      } else if (c.samples >= 2 && avgScore < 10) {
        tip = "คู่นี้อ่อน — ลอง regenerate มุมใหม่แล้ว Approve ก่อนโพสต์";
      }
      return {
        hookIndex: c.hookIndex,
        ctaIndex: c.ctaIndex,
        hookLabel: c.hookLabel,
        ctaLabel: c.ctaLabel,
        samples: c.samples,
        avgScore: Math.round(avgScore * 10) / 10,
        totalCommission: Math.round(c.commission * 100) / 100,
        tip,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore || b.samples - a.samples);

  const leaders = [...hooks, ...ctas].filter((r) => r.band === "leader").length;
  const weak = [...hooks, ...ctas].filter((r) => r.band === "weak").length;
  const counts = {
    withMetrics: posted.length,
    uniqueHooks: hooks.length,
    uniqueCtas: ctas.length,
    combos: combos.length,
    leaders,
    weak,
  };
  const { grade, score } = gradeFrom(counts);

  const tryNext: string[] = [];
  const topHook = hooks.find((h) => h.band === "leader" || h.band === "solid");
  const topCta = ctas.find((c) => c.band === "leader" || c.band === "solid");
  if (topHook) {
    tryNext.push(
      `ลองใช้ hook แนว “${topHook.label}” อีกครั้งบนช่องทางอื่น (หลัง Approve)`,
    );
  }
  if (topCta) {
    tryNext.push(`ลอง CTA แนว “${topCta.label}” กับสินค้าใหม่ในคิวถ่าย`);
  }
  const thinHooks = hooks.filter((h) => h.band === "thin").slice(0, 2);
  for (const h of thinHooks) {
    tryNext.push(`เก็บตัวอย่าง hook “${h.label}” เพิ่ม — ยังสรุปไม่ได้`);
  }
  if (tryNext.length === 0) {
    tryNext.push(
      "ยังไม่พอข้อมูลมุมขาย — โพสต์ draft ที่อนุมัติแล้ว 1–2 ชิ้น แล้วกรอกผลเย็นนี้",
    );
  }

  const avoidReuse: string[] = [];
  for (const h of hooks.filter((x) => x.band === "weak" && x.samples >= 2)) {
    avoidReuse.push(
      `พักซ้ำ hook “${h.label}” (n=${h.samples}, คะแนนเฉลี่ย ${h.avgScore})`,
    );
  }
  for (const c of ctas.filter((x) => x.band === "weak" && x.samples >= 2)) {
    avoidReuse.push(
      `พักซ้ำ CTA “${c.label}” (n=${c.samples}, คะแนนเฉลี่ย ${c.avgScore})`,
    );
  }
  for (const combo of combos
    .filter((c) => c.samples >= 2 && c.avgScore < 10)
    .slice(0, 2)) {
    avoidReuse.push(
      `เลี่ยงคู่ hook#${combo.hookIndex + 1}+CTA#${combo.ctaIndex + 1} ที่อ่อนในชุดนี้`,
    );
  }

  const actions: CreativeAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "no-metrics",
      title: "ยังไม่มีผลพอวิเคราะห์มุมขาย",
      detail:
        "Approve → โพสต์ด้วยมือ → กรอก views/clicks ที่ /results แล้วค่อยดูบอร์ดนี้",
    });
  } else {
    if (topHook) {
      actions.push({
        id: "reuse-hook",
        title: `ทดลอง hook #${topHook.index + 1}`,
        detail: `${topHook.label} · ${channelLabel(topHook.channels[0] ?? "tiktok")} · ไม่การันตีผล`,
      });
    }
    if (weak > 0) {
      actions.push({
        id: "regen-weak",
        title: "สร้างแคปชันใหม่มุมอ่อน",
        detail:
          "ที่ตารางโพสต์ กดสร้างแคปชันใหม่ แล้ว Approve ก่อนโพสต์ — ห้ามสแปมข้อความเดิม",
      });
    }
    if (counts.withMetrics < 4) {
      actions.push({
        id: "more-samples",
        title: "เก็บตัวอย่างเพิ่ม",
        detail: `มี ${counts.withMetrics} โพสต์ที่มีผล — เป้าอย่างน้อย 4–6 ชิ้น/สัปดาห์เพื่อเทียบ hook/CTA`,
      });
    }
  }
  actions.push({
    id: "compliance",
    title: "ตรวจ disclosure ก่อน Approve",
    detail:
      "ทุกแคปชันต้องมีข้อความ affiliate — ระบบบล็อก Approve ถ้าไม่มีหรือมีคำโฆษณาเกินจริง",
  });

  const checklist = [
    "ดู hook/CTA ที่คะแนนดี แล้วใช้เป็นสมมติฐานทดลองเท่านั้น",
    "อย่าคัดลอกแคปชันเดิมซ้ำติดกัน — ใช้ regenerate + Approve",
    "ตรวจ disclosure ก่อนโพสต์ด้วยมือ",
    "กรอกผลที่ /results ให้ครบเพื่อให้บอร์ดนี้แม่นขึ้น",
    "ห้ามเคลมรายได้แน่นอนในแคปชันหรือสตอรี่",
  ];

  const summary =
    posted.length === 0
      ? "Creative Performance: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลโพสต์ก่อนวิเคราะห์มุมขาย"
      : `Creative Performance: ${posted.length} โพสต์ · hook ${hooks.length} / CTA ${ctas.length} มุม · เกรดข้อมูล ${grade} (ทดลองจากตัวเลขที่กรอก ไม่การันตี)`;

  const lines: string[] = [
    `Creative Performance · เกรด ${grade} (${score}/100)`,
    summary,
  ];
  if (topHook) {
    lines.push(
      `Hook เด่นในชุดนี้: #${topHook.index + 1} “${topHook.label}” (n=${topHook.samples})`,
    );
  }
  if (topCta) {
    lines.push(
      `CTA เด่นในชุดนี้: #${topCta.index + 1} “${topCta.label}” (n=${topCta.samples})`,
    );
  }
  if (avoidReuse[0]) {
    lines.push(avoidReuse[0]);
  }
  lines.push(
    "ใช้บอร์ดนี้เลือกมุมทดลอง — ยังเป็น draft และต้อง Approve ก่อนโพสต์จริง",
  );

  return {
    date,
    fromDate,
    windowDays: window,
    grade,
    score,
    summary,
    counts,
    hooks,
    ctas,
    combos: combos.slice(0, 8),
    tryNext: tryNext.slice(0, 5),
    avoidReuse: avoidReuse.slice(0, 5),
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function creativePerformanceLines(
  board: CreativePerformance,
  limit = 6,
): string[] {
  return board.lines.slice(0, limit);
}

export function creativePerformanceToMarkdown(
  board: CreativePerformance,
): string {
  const hookList =
    board.hooks.length === 0
      ? "- ยังไม่มี hook ให้จัดอันดับ"
      : board.hooks
          .slice(0, 8)
          .map(
            (h, i) =>
              `${i + 1}. **#${h.index + 1}** [${h.band}] “${h.label}” · n=${h.samples} · avg ${h.avgScore} · ค่าคอม ฿${h.totalCommission}\n` +
              `   - ${h.tip}`,
          )
          .join("\n");

  const ctaList =
    board.ctas.length === 0
      ? "- ยังไม่มี CTA ให้จัดอันดับ"
      : board.ctas
          .slice(0, 8)
          .map(
            (c, i) =>
              `${i + 1}. **#${c.index + 1}** [${c.band}] “${c.label}” · n=${c.samples} · avg ${c.avgScore} · ออเดอร์ ${c.totalOrders}\n` +
              `   - ${c.tip}`,
          )
          .join("\n");

  const comboList =
    board.combos.length === 0
      ? "- ยังไม่มีคู่ hook+CTA"
      : board.combos
          .map(
            (c) =>
              `- hook#${c.hookIndex + 1} + CTA#${c.ctaIndex + 1} · n=${c.samples} · avg ${c.avgScore}\n` +
              `  - ${c.hookLabel} / ${c.ctaLabel}\n` +
              `  - ${c.tip}`,
          )
          .join("\n");

  const tryNext = board.tryNext.map((t) => `- ${t}`).join("\n");
  const avoid = board.avoidReuse.length
    ? board.avoidReuse.map((t) => `- ${t}`).join("\n")
    : "- ไม่มีมุมอ่อนชัดในชุดนี้";
  const actions = board.actions
    .map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`)
    .join("\n");
  const checklist = board.checklist.map((c) => `- [ ] ${c}`).join("\n");

  return (
    `# Creative Performance · ${board.date}\n\n` +
    `เกรดข้อมูล **${board.grade}** (${board.score}/100)\n\n` +
    `${board.summary}\n\n` +
    `หน้าต่าง: ${board.fromDate} → ${board.date} (${board.windowDays} วัน)\n\n` +
    `## สรุปจำนวน\n` +
    `- โพสต์มีเมตริก: ${board.counts.withMetrics}\n` +
    `- Hook ไม่ซ้ำ: ${board.counts.uniqueHooks}\n` +
    `- CTA ไม่ซ้ำ: ${board.counts.uniqueCtas}\n` +
    `- คู่ hook+CTA: ${board.counts.combos}\n` +
    `- มุมเด่น (leader): ${board.counts.leaders}\n` +
    `- มุมอ่อน (weak): ${board.counts.weak}\n\n` +
    `## Hook leaderboard\n${hookList}\n\n` +
    `## CTA leaderboard\n${ctaList}\n\n` +
    `## คู่ที่ลองแล้ว\n${comboList}\n\n` +
    `## ลองต่อไป\n${tryNext}\n\n` +
    `## พักซ้ำ\n${avoid}\n\n` +
    `## ทำก่อน\n${actions}\n\n` +
    `## Checklist\n${checklist}\n\n` +
    `${board.disclaimer}\n` +
    `> ไม่โพสต์อัตโนมัติ — ใช้เป็นสมมติฐานทดลองหลัง Approve เท่านั้น\n`
  );
}
