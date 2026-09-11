/**
 * Channel Fit Lab — soft ranking of TikTok / Facebook / Reels from logged metrics.
 * Suggests channel mix for drafts; never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type { ContentChannel, Database, ScheduledPost } from "./types";

export type ChannelFitGrade = "A" | "B" | "C" | "D";
export type ChannelBand = "strong" | "ok" | "weak" | "no_data";
export type ChannelConfidence = "thin" | "ok" | "solid";

const ALL_CHANNELS: ContentChannel[] = [
  "tiktok",
  "facebook_reels",
  "facebook_post",
  "facebook_group",
];

const BAND_LABEL: Record<ChannelBand, string> = {
  strong: "แข็งแรง",
  ok: "พอใช้",
  weak: "อ่อน",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<ChannelConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

export interface ChannelFitRow {
  channel: ContentChannel;
  channelLabel: string;
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  band: ChannelBand;
  confidence: ChannelConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface ChannelFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentChannel: ContentChannel;
  currentLabel: string;
  suggestedChannel: ContentChannel;
  suggestedLabel: string;
  status: ScheduledPost["status"];
  reason: string;
  tip: string;
}

export interface ChannelFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface ChannelFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: ChannelFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    channelsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    strong: number;
  };
  channels: ChannelFitRow[];
  mixTip: string;
  suggestions: ChannelFitSuggestion[];
  actions: ChannelFitAction[];
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function confidenceOf(samples: number): ChannelConfidence {
  if (samples >= 4) return "solid";
  if (samples >= 2) return "ok";
  return "thin";
}

function scoreChannel(params: {
  samples: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgOrders: number;
  shareOfPosts: number;
  globalAvgCommission: number;
}): number {
  if (params.samples === 0) return 0;

  const commBase = params.globalAvgCommission > 0
    ? clamp((params.avgCommission / params.globalAvgCommission) * 50, 0, 70)
    : clamp(params.avgCommission * 2, 0, 50);
  const ctrScore = clamp(params.avgCtr * 200, 0, 20);
  const opcScore = clamp(params.avgOrdersPerClick * 100, 0, 15);
  const orderScore = clamp(params.avgOrders * 8, 0, 15);
  let score = commBase + ctrScore + opcScore + orderScore;

  // Soft diversity: over-concentration is not "fit" — risk of spam feel.
  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  // Thin samples stay conservative.
  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function bandOf(score: number, samples: number): ChannelBand {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "strong";
  if (score >= 45) return "ok";
  return "weak";
}

function tipFor(row: Omit<ChannelFitRow, "tip">): string {
  if (row.samples === 0) {
    return "ยังไม่มีผลในช่องนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำวันเดียวกัน)";
  }
  if (row.band === "strong") {
    return `ช่องนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุมขาย/สินค้าเพื่อไม่ให้ซ้ำ`;
  }
  if (row.band === "weak") {
    return `ผลอ่อนในช่องนี้ — ลองเปลี่ยน hook/มุม หรือย้ายไปช่องที่แข็งแรงกว่าในรอบถัดไป`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้ช่องนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายไปช่องอื่นเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่องนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, channelsWithData: number): ChannelFitGrade {
  if (channelsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Channel Fit Lab from manually logged post metrics.
 */
export function buildChannelFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): ChannelFitLab {
  const window = Math.max(7, Math.min(30, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));
  const productById = new Map(db.products.map((p) => [p.id, p]));

  const posted = db.schedule.filter(
    (s) =>
      s.status === "posted" &&
      s.metrics != null &&
      s.date >= fromDate &&
      s.date <= date,
  );

  const byChannel = new Map<ContentChannel, ScheduledPost[]>();
  for (const ch of ALL_CHANNELS) byChannel.set(ch, []);
  for (const post of posted) {
    const list = byChannel.get(post.channel) ?? [];
    list.push(post);
    byChannel.set(post.channel, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const channels: ChannelFitRow[] = ALL_CHANNELS.map((channel) => {
    const list = byChannel.get(channel) ?? [];
    const samples = list.length;
    const views = list.map((p) => p.metrics!.views);
    const clicks = list.map((p) => p.metrics!.clicks);
    const orders = list.map((p) => p.metrics!.orders);
    const commissions = list.map((p) => p.metrics!.commissionEarned);
    const avgViews = avg(views);
    const avgClicks = avg(clicks);
    const avgOrders = avg(orders);
    const avgCommission = avg(commissions);
    const totalViews = views.reduce((a, b) => a + b, 0);
    const totalClicks = clicks.reduce((a, b) => a + b, 0);
    const totalOrders = orders.reduce((a, b) => a + b, 0);
    const avgCtr = totalViews > 0 ? totalClicks / totalViews : 0;
    const avgOrdersPerClick = totalClicks > 0 ? totalOrders / totalClicks : 0;
    const shareOfPosts = posted.length > 0 ? samples / posted.length : 0;
    const score = scoreChannel({
      samples,
      avgCommission,
      avgCtr,
      avgOrdersPerClick,
      avgOrders,
      shareOfPosts,
      globalAvgCommission,
    });
    const confidence = confidenceOf(samples);
    const band = bandOf(score, samples);
    const row: Omit<ChannelFitRow, "tip"> = {
      channel,
      channelLabel: channelLabel(channel),
      samples,
      avgViews: round1(avgViews),
      avgClicks: round1(avgClicks),
      avgOrders: round2(avgOrders),
      avgCommission: round1(avgCommission),
      avgCtr: round2(avgCtr),
      avgOrdersPerClick: round2(avgOrdersPerClick),
      score,
      band,
      confidence,
      shareOfPosts: round2(shareOfPosts),
    };
    return { ...row, tip: tipFor(row) };
  }).sort((a, b) => b.score - a.score || b.samples - a.samples);

  const withData = channels.filter((c) => c.samples > 0);
  const strong = channels.filter((c) => c.band === "strong").length;
  const topShare = Math.max(0, ...channels.map((c) => c.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((c) => c.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3) labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best = withData.find((c) => c.band === "strong") ?? withData[0];
  const weak = withData.filter((c) => c.band === "weak");

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกช่องทาง — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์"
      : unbalanced && best
        ? `มิกซ์เอนไปทาง ${best.channelLabel} มาก — วันถัดไปลองสลับช่องอื่น 1 ชิ้น (ทดลอง)`
        : best
          ? `ช่องเด่นช่วงนี้: ${best.channelLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ช่องเดียว`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามช่องทางก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: ChannelFitSuggestion[] = [];
  const preferred =
    channels.find((c) => c.band === "strong") ??
    channels.find((c) => c.band === "ok" && c.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const currentRow = channels.find((c) => c.channel === slot.channel);
    if (!product || !preferred) continue;

    const currentWeak =
      currentRow != null &&
      (currentRow.band === "weak" ||
        (currentRow.band === "no_data" && preferred.band === "strong"));
    const sameAsPreferred = slot.channel === preferred.channel;

    if (currentWeak && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentChannel: slot.channel,
        currentLabel: channelLabel(slot.channel),
        suggestedChannel: preferred.channel,
        suggestedLabel: preferred.channelLabel,
        status: slot.status,
        reason: `${channelLabel(slot.channel)} อ่อน/ข้อมูลน้อยกว่า · ${preferred.channelLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่เปลี่ยนอัตโนมัติ — ถ้าย้ายช่อง ให้สร้างแคปชันใหม่ + Approve ใหม่ก่อนโพสต์มือ",
      });
    } else if (
      unbalanced &&
      sameAsPreferred &&
      weak[0] &&
      suggestions.length < 2
    ) {
      // Soft diversity nudge: if today piles onto the dominant channel, suggest one alternate.
      const alt =
        channels.find(
          (c) =>
            c.channel !== slot.channel &&
            (c.band === "ok" || c.band === "no_data"),
        ) ?? weak[0];
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentChannel: slot.channel,
        currentLabel: channelLabel(slot.channel),
        suggestedChannel: alt.channel,
        suggestedLabel: alt.channelLabel,
        status: slot.status,
        reason: `วันนี้ซ้อนช่อง ${channelLabel(slot.channel)} — ลองกระจายไป ${alt.channelLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่ย้ายช่องเอง — แก้ที่ตารางโพสต์แล้ว Approve ใหม่",
      });
    }
  }

  const actions: ChannelFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายช่องทาง",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อช่อง",
    });
  }
  if (best && best.band === "strong") {
    actions.push({
      id: "lean-best",
      title: `เอียงทดลองไป ${best.channelLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต ไม่ถล่มทุกช่อง`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์ช่องทาง",
      detail: "ช่องเด่นกินสัดส่วนสูง — เพิ่ม draft คนละช่อง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (weak.length > 0) {
    actions.push({
      id: "review-weak",
      title: `ทบทวนช่องอ่อน: ${weak.map((w) => w.channelLabel).join(", ")}`,
      detail: "เปลี่ยน hook/มุมขาย หรือพักช่องนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail: "ทุกช่องต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Channel Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับช่องทาง"
      : `Channel Fit Lab: ${posted.length} โพสต์มีเมตริก · ช่องที่มีข้อมูล ${withData.length} · แข็งแรง ${strong}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับช่องทางมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำย้ายช่องเป็นคำแนะนำเท่านั้น — ต้องแก้ draft + Approve เอง",
    "อย่าถล่มช่องเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Channel Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
    mixTip,
  ];
  for (const c of withData.slice(0, 3)) {
    lines.push(
      `${BAND_LABEL[c.band]} · ${c.channelLabel}: คะแนน ${c.score} (${CONF_LABEL[c.confidence]}, n=${c.samples}, CTR ~${round1(c.avgCtr * 100)}%)`,
    );
  }
  for (const s of suggestions.slice(0, 2)) {
    lines.push(
      `แนะนำทดลอง · ${s.productName}: ${s.currentLabel} → ${s.suggestedLabel}`,
    );
  }
  lines.push(INCOME_DISCLAIMER);

  return {
    date,
    fromDate,
    windowDays: window,
    grade,
    score: labScore,
    summary,
    counts: {
      postsWithMetrics: posted.length,
      channelsWithData: withData.length,
      unbalanced,
      suggestions: suggestions.length,
      strong,
    },
    channels,
    mixTip,
    suggestions: suggestions.slice(0, 5),
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function channelFitLabLines(lab: ChannelFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function channelFitLabToMarkdown(lab: ChannelFitLab): string {
  const channelRows = lab.channels.map(
    (c, idx) =>
      `${idx + 1}. **[${BAND_LABEL[c.band]}]** ${c.channelLabel} · คะแนน ${c.score}/100 · n=${c.samples} · ${CONF_LABEL[c.confidence]}\n` +
      `   CTR ~${round1(c.avgCtr * 100)}% · ออเดอร์/คลิก ~${c.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${c.avgCommission}\n` +
      `   สัดส่วนในหน้าต่าง ~${Math.round(c.shareOfPosts * 100)}%\n` +
      `   ${c.tip}`,
  );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Channel Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- ช่องที่มีข้อมูล: ${lab.counts.channelsWithData}`,
    `- ช่องแข็งแรง: ${lab.counts.strong}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับช่องทาง (ทดลอง)",
    ...(channelRows.length ? channelRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำย้ายช่องวันนี้)_"]),
    "",
    "## Actions",
    ...actionLines,
    "",
    "## Checklist",
    ...lab.checklist.map((c) => `- ${c}`),
    "",
    lab.disclaimer,
    "",
  ].join("\n");
}
