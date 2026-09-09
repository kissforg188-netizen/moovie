/**
 * Pain Clarity Lab — soft ranking of pain-point clarity bands from logged metrics.
 * Suggests richer pain/sell briefs for drafts; never auto-publishes or claims guaranteed income.
 * Aligns with scoring.painClarityScore weights (pain ×22, sell ×10, audience +14).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type { Database, Product, ScheduledPost } from "./types";

export type PainClarityFitGrade = "A" | "B" | "C" | "D";
export type PainClarityBandKind =
  | "empty"
  | "thin"
  | "solid"
  | "clear"
  | "sharp";
export type PainClarityStatus = "hot" | "steady" | "cold" | "no_data";
export type PainClarityConfidence = "thin" | "ok" | "solid";

export const PAIN_CLARITY_BAND_ORDER: PainClarityBandKind[] = [
  "empty",
  "thin",
  "solid",
  "clear",
  "sharp",
];

const BAND_STATUS_LABEL: Record<PainClarityStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<PainClarityConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<PainClarityBandKind, string> = {
  empty: "ว่าง/ไม่ชัด",
  thin: "บาง (≈1 pain)",
  solid: "พอใช้ (≈2 pain)",
  clear: "ชัด",
  sharp: "คมมาก",
};

const BAND_RANGE: Record<PainClarityBandKind, string> = {
  empty: "คะแนน <22",
  thin: "22–43",
  solid: "44–65",
  clear: "66–84",
  sharp: "≥85",
};

export interface PainClarityFitRow {
  band: PainClarityBandKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  productCount: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgPrice: number;
  avgPainScore: number;
  avgPainCount: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: PainClarityStatus;
  confidence: PainClarityConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface PainClarityFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: PainClarityBandKind;
  currentLabel: string;
  suggestedBand: PainClarityBandKind;
  suggestedLabel: string;
  painScore: number;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface PainClarityFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface PainClarityFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: PainClarityFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: PainClarityFitRow[];
  mixTip: string;
  suggestions: PainClarityFitSuggestion[];
  actions: PainClarityFitAction[];
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

/**
 * Same formula as scoring.painClarityScore — kept here so the lab stays
 * aligned without exporting private scoring helpers.
 */
export function painClarityScoreOf(product: Product): number {
  const pains = product.painPoints.filter((p) => p.trim().length > 0);
  const sells = product.sellingPoints.filter((p) => p.trim().length > 0);
  const painPart = Math.min(pains.length, 3) * 22;
  const sellPart = Math.min(sells.length, 3) * 10;
  const audience = product.targetAudience.trim().length > 8 ? 14 : 0;
  return Math.min(100, painPart + sellPart + audience);
}

/**
 * Map pain-clarity score to band — thresholds match scoring building blocks
 * (22 per pain point; rich briefs land in clear/sharp).
 */
export function painClarityBandOf(score: number): PainClarityBandKind {
  if (!Number.isFinite(score) || score < 22) return "empty";
  if (score < 44) return "thin";
  if (score < 66) return "solid";
  if (score < 85) return "clear";
  return "sharp";
}

export function painClarityBandLabel(band: PainClarityBandKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): PainClarityConfidence {
  if (samples >= 4) return "solid";
  if (samples >= 2) return "ok";
  return "thin";
}

function scoreBand(params: {
  samples: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgOrders: number;
  shareOfPosts: number;
  globalAvgCommission: number;
  band: PainClarityBandKind;
}): number {
  if (params.samples === 0) return 0;

  const commBase =
    params.globalAvgCommission > 0
      ? clamp((params.avgCommission / params.globalAvgCommission) * 50, 0, 70)
      : clamp(params.avgCommission * 2, 0, 50);
  const ctrScore = clamp(params.avgCtr * 200, 0, 20);
  const opcScore = clamp(params.avgOrdersPerClick * 100, 0, 15);
  const orderScore = clamp(params.avgOrders * 8, 0, 15);
  let score = commBase + ctrScore + opcScore + orderScore;

  // Soft nudge toward clearer pain briefs (matches product scoring weight).
  if (params.band === "clear") score += 5;
  else if (params.band === "sharp") score += 6;
  else if (params.band === "solid") score += 2;
  else if (params.band === "thin") score -= 1;
  else if (params.band === "empty") score -= 4;

  // Soft diversity: over-concentration risks spam feel / audience fatigue.
  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): PainClarityStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<PainClarityFitRow, "tip">): string {
  if (row.samples === 0) {
    return "ยังไม่มีผลในช่วงความชัดของ pain นี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)";
  }
  if (row.status === "hot") {
    return `ช่วง pain นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุม/สินค้าเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในช่วง pain นี้ — เติมจุดเจ็บ/จุดขายให้ชัดขึ้น หรือเลี่ยงช่วงนี้ชั่วคราว`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้ช่วง pain นี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายระดับความชัดเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วง pain นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): PainClarityFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Pain Clarity Lab from manually logged post metrics.
 */
export function buildPainClarityFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): PainClarityFitLab {
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

  const byBand = new Map<PainClarityBandKind, ScheduledPost[]>();
  const productsByBand = new Map<PainClarityBandKind, Set<string>>();
  for (const band of PAIN_CLARITY_BAND_ORDER) {
    byBand.set(band, []);
    productsByBand.set(band, new Set());
  }
  for (const p of db.products) {
    const key = painClarityBandOf(painClarityScoreOf(p));
    productsByBand.get(key)?.add(p.id);
  }

  for (const post of posted) {
    const product = productById.get(post.productId);
    const key = painClarityBandOf(
      product ? painClarityScoreOf(product) : 0,
    );
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
    const set = productsByBand.get(key) ?? new Set();
    set.add(post.productId);
    productsByBand.set(key, set);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: PainClarityFitRow[] = PAIN_CLARITY_BAND_ORDER.map((band) => {
    const list = byBand.get(band) ?? [];
    const samples = list.length;
    const productIds = productsByBand.get(band) ?? new Set();
    const productsInBand = [...productIds]
      .map((id) => productById.get(id))
      .filter((p): p is Product => Boolean(p));
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
    const avgPrice =
      productsInBand.length > 0
        ? avg(productsInBand.map((p) => p.price))
        : 0;
    const avgPainScore =
      productsInBand.length > 0
        ? avg(productsInBand.map((p) => painClarityScoreOf(p)))
        : 0;
    const avgPainCount =
      productsInBand.length > 0
        ? avg(
            productsInBand.map(
              (p) => p.painPoints.filter((x) => x.trim().length > 0).length,
            ),
          )
        : 0;
    const score = scoreBand({
      samples,
      avgCommission,
      avgCtr,
      avgOrdersPerClick,
      avgOrders,
      shareOfPosts,
      globalAvgCommission,
      band,
    });
    const confidence = confidenceOf(samples);
    const status = statusOf(score, samples);
    const row: Omit<PainClarityFitRow, "tip"> = {
      band,
      bandLabel: BAND_LABEL[band],
      rangeLabel: BAND_RANGE[band],
      samples,
      productCount: productIds.size,
      avgViews: round1(avgViews),
      avgClicks: round1(avgClicks),
      avgOrders: round2(avgOrders),
      avgCommission: round1(avgCommission),
      avgCtr: round2(avgCtr),
      avgOrdersPerClick: round2(avgOrdersPerClick),
      avgPrice: round1(avgPrice),
      avgPainScore: round1(avgPainScore),
      avgPainCount: round1(avgPainCount),
      score,
      status,
      confidence,
      shareOfPosts: round2(shareOfPosts),
    };
    return { ...row, tip: tipFor(row) };
  }).sort((a, b) => b.score - a.score || b.samples - a.samples);

  const withData = bands.filter((b) => b.samples > 0);
  const hot = bands.filter((b) => b.status === "hot").length;
  const topShare = Math.max(0, ...bands.map((b) => b.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((b) => b.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best = withData.find((b) => b.status === "hot") ?? withData[0];
  const cold = withData.filter((b) => b.status === "cold");

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกช่วง pain — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์ความชัดของปัญหา"
      : unbalanced && best
        ? `มิกซ์เอนไปช่วง ${best.bandLabel} มาก — วันถัดไปลองสลับระดับความชัดของ pain อื่น 1 ชิ้น (ทดลอง)`
        : best
          ? `ช่วง pain เด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ระดับเดียว`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับ pain ก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: PainClarityFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    if (!product || !preferred) continue;
    const painScore = painClarityScoreOf(product);
    const currentKey = painClarityBandOf(painScore);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot") ||
        currentKey === "empty" ||
        currentKey === "thin");

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        painScore,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น/บางกว่า · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับสินค้าอัตโนมัติ — เติม pain/จุดขายที่หน้าสินค้า หรือเลือกสินค้าที่ brief ชัดกว่า แล้ว Approve ก่อนโพสต์มือ",
      });
    } else if (
      unbalanced &&
      sameAsPreferred &&
      cold[0] &&
      suggestions.length < 2
    ) {
      const alt =
        bands.find(
          (b) =>
            b.band !== currentKey &&
            (b.status === "steady" || b.status === "no_data") &&
            b.band !== "empty",
        ) ?? cold[0];
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: alt.band,
        suggestedLabel: alt.bandLabel,
        painScore,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนช่วง ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนสินค้าเอง — แก้ brief ที่สินค้า/คิวแล้ว Approve ใหม่",
      });
    }
  }

  const actions: PainClarityFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายระดับ pain",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อระดับความชัด",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-best",
      title: `เอียงทดลองไปช่วง ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์ระดับ pain",
      detail:
        "ระดับ pain เด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนช่วงเย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "เติม pain point / จุดขาย / กลุ่มเป้าหมาย หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  const emptyCatalog = db.products.filter(
    (p) => painClarityBandOf(painClarityScoreOf(p)) === "empty",
  ).length;
  if (emptyCatalog > 0) {
    actions.push({
      id: "fill-briefs",
      title: `เติม brief สินค้าว่าง ${emptyCatalog} ชิ้น`,
      detail:
        "สินค้าที่ยังไม่มี pain point จะสร้าง hook อ่อน — ใส่ปัญหาจริง 1–3 ข้อก่อนสร้างแคปชัน",
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail:
      "ทุกระดับ pain ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Pain Clarity Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความชัดของ pain"
      : `Pain Clarity Lab: ${posted.length} โพสต์มีเมตริก · ช่วงที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับระดับ pain มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำเติม brief/สลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่มมุม pain เดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Pain Clarity Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
    mixTip,
  ];
  for (const b of withData.slice(0, 3)) {
    lines.push(
      `${BAND_STATUS_LABEL[b.status]} · ${b.bandLabel}: คะแนน ${b.score} (${CONF_LABEL[b.confidence]}, n=${b.samples}, CTR ~${round1(b.avgCtr * 100)}%)`,
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
      bandsWithData: withData.length,
      unbalanced,
      suggestions: suggestions.length,
      hot,
    },
    bands,
    mixTip,
    suggestions: suggestions.slice(0, 5),
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function painClarityFitLabLines(
  lab: PainClarityFitLab,
  limit = 6,
): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function painClarityFitLabToMarkdown(lab: PainClarityFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0 || b.productCount > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   สินค้าในแคตตาล็อก ${b.productCount} · pain avg ~${b.avgPainScore} · จำนวน pain ~${b.avgPainCount}\n` +
        `   CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · pain score ${s.painScore}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Pain Clarity Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- ระดับ pain ที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับระดับความชัดของ pain (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับระดับ pain วันนี้)_"]),
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
