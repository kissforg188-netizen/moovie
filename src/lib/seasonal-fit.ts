/**
 * Seasonal Fit Lab — soft ranking of seasonal/trending potential bands from logged metrics.
 * Suggests season-aware mix for drafts; never auto-publishes or claims guaranteed income.
 * Aligns with scoring.seasonal (product.seasonalScore 1–5 + Thai calendar boost).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import { currentSeasonHint, thaiSeasonBoost } from "./seasonality";
import type { Database, Product, ScheduledPost } from "./types";

export type SeasonalFitGrade = "A" | "B" | "C" | "D";
export type SeasonalBandKind =
  | "cold1"
  | "soft2"
  | "mid3"
  | "trend4"
  | "peak5";
export type SeasonalFitStatus = "hot" | "steady" | "cold" | "no_data";
export type SeasonalFitConfidence = "thin" | "ok" | "solid";

export const SEASONAL_BAND_ORDER: SeasonalBandKind[] = [
  "cold1",
  "soft2",
  "mid3",
  "trend4",
  "peak5",
];

const BAND_STATUS_LABEL: Record<SeasonalFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<SeasonalFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<SeasonalBandKind, string> = {
  cold1: "ไม่ตามซีซัน (1)",
  soft2: "ซีซันอ่อน (2)",
  mid3: "ปานกลาง (3)",
  trend4: "ตามเทรนด์ (4)",
  peak5: "ซีซันแรง (5)",
};

const BAND_RANGE: Record<SeasonalBandKind, string> = {
  cold1: "seasonalScore = 1",
  soft2: "seasonalScore = 2",
  mid3: "seasonalScore = 3",
  trend4: "seasonalScore = 4",
  peak5: "seasonalScore = 5",
};

export interface SeasonalFitRow {
  band: SeasonalBandKind;
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
  avgSeasonalScore: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: SeasonalFitStatus;
  confidence: SeasonalFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface SeasonalFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: SeasonalBandKind;
  currentLabel: string;
  suggestedBand: SeasonalBandKind;
  suggestedLabel: string;
  seasonalScore: number;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface SeasonalFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface SeasonalFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  /** Current Thai calendar season label (Asia/Bangkok). */
  seasonLabel: string;
  grade: SeasonalFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: SeasonalFitRow[];
  mixTip: string;
  suggestions: SeasonalFitSuggestion[];
  actions: SeasonalFitAction[];
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

/** Clamp product.seasonalScore to 1–5 (same as scoring.scale1to5 input). */
export function seasonalScoreOf(product: Product): number {
  const raw = Number(product.seasonalScore);
  if (!Number.isFinite(raw)) return 3;
  return Math.max(1, Math.min(5, Math.round(raw)));
}

/**
 * Map seasonalScore 1–5 → band — matches scoring weight preference for easier shorts.
 */
export function seasonalBandOf(ease: number): SeasonalBandKind {
  const e = Math.max(1, Math.min(5, Math.round(Number(ease) || 1)));
  if (e <= 1) return "cold1";
  if (e === 2) return "soft2";
  if (e === 3) return "mid3";
  if (e === 4) return "trend4";
  return "peak5";
}

export function seasonalBandLabel(band: SeasonalBandKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): SeasonalFitConfidence {
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
  band: SeasonalBandKind;
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

  // Soft nudge toward easier filming (matches product scoring seasonalScore weight).
  if (params.band === "peak5") score += 6;
  else if (params.band === "trend4") score += 5;
  else if (params.band === "mid3") score += 2;
  else if (params.band === "soft2") score -= 1;
  else if (params.band === "cold1") score -= 4;

  // Soft diversity: over-concentration risks spam feel / audience fatigue.
  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): SeasonalFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<SeasonalFitRow, "tip">): string {
  if (row.samples === 0) {
    return "ยังไม่มีผลในช่วงซีซันนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)";
  }
  if (row.status === "hot") {
    return `ช่วงซีซัน/เทรนด์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในช่วงซีซันนี้ — อัปเดต seasonalScore หรือเลือกหมวดที่ตรงปฏิทินไทยกว่า`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้ช่วงซีซันนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายระดับ seasonalScore เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงซีซันนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): SeasonalFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Seasonal Fit Lab from manually logged post metrics.
 */
export function buildSeasonalFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): SeasonalFitLab {
  const window = Math.max(7, Math.min(30, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const seasonHint = currentSeasonHint(dateFromYmd(date));
  const seasonLabel = seasonHint.label;

  const posted = db.schedule.filter(
    (s) =>
      s.status === "posted" &&
      s.metrics != null &&
      s.date >= fromDate &&
      s.date <= date,
  );

  const byBand = new Map<SeasonalBandKind, ScheduledPost[]>();
  const productsByBand = new Map<SeasonalBandKind, Set<string>>();
  for (const band of SEASONAL_BAND_ORDER) {
    byBand.set(band, []);
    productsByBand.set(band, new Set());
  }
  for (const p of db.products) {
    const key = seasonalBandOf(seasonalScoreOf(p));
    productsByBand.get(key)?.add(p.id);
  }

  for (const post of posted) {
    const product = productById.get(post.productId);
    const key = seasonalBandOf(product ? seasonalScoreOf(product) : 3);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
    const set = productsByBand.get(key) ?? new Set();
    set.add(post.productId);
    productsByBand.set(key, set);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: SeasonalFitRow[] = SEASONAL_BAND_ORDER.map((band) => {
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
    const avgSeasonalScore =
      productsInBand.length > 0
        ? avg(productsInBand.map((p) => seasonalScoreOf(p)))
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
    const row: Omit<SeasonalFitRow, "tip"> = {
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
      avgSeasonalScore: round1(avgSeasonalScore),
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
      ? `ยังไม่มีเมตริกช่วงซีซัน/เทรนด์ — ปฏิทินไทยตอนนี้: ${seasonLabel} · โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์`
      : unbalanced && best
        ? `มิกซ์เอนไปช่วง ${best.bandLabel} มาก — วันถัดไปลองสลับระดับซีซันอื่น 1 ชิ้น (ทดลอง) · ปฏิทิน: ${seasonLabel}`
        : best
          ? `ช่วงซีซัน/เทรนด์เด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ · ปฏิทิน: ${seasonLabel}`
          : `เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับซีซันก่อนจัดอันดับมิกซ์ · ปฏิทิน: ${seasonLabel}`;

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: SeasonalFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    if (!product || !preferred) continue;
    const ease = seasonalScoreOf(product);
    const currentKey = seasonalBandOf(ease);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot") ||
        currentKey === "cold1" ||
        currentKey === "soft2");

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        seasonalScore: ease,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น/ไม่ตรงซีซันกว่า · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับสินค้าอัตโนมัติ — ปรับ seasonalScore ที่หน้าสินค้า หรือเลือกสินค้าตามซีซันกว่า แล้ว Approve ก่อนโพสต์มือ",
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
            b.band !== "cold1",
        ) ?? cold[0];
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: alt.band,
        suggestedLabel: alt.bandLabel,
        seasonalScore: ease,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนช่วง ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนสินค้าเอง — แก้ seasonalScore/คิวแล้ว Approve ใหม่",
      });
    }
  }

  const actions: SeasonalFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายระดับซีซัน",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อระดับ seasonalScore",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-season",
      title: `เอียงทดลองไปช่วงซีซัน ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์ระดับซีซัน",
      detail:
        "ระดับซีซันเด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนช่วงเย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "อัปเดต seasonalScore / เลือกหมวดตรงปฏิทิน หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  const hardCatalog = db.products.filter(
    (p) => seasonalBandOf(seasonalScoreOf(p)) === "cold1",
  ).length;
  if (hardCatalog > 0) {
    actions.push({
      id: "ease-cold",
      title: `ทบทวนสินค้าไม่ตามซีซัน ${hardCatalog} ชิ้น`,
      detail:
        "สินค้า seasonalScore=1 ไม่ตรงซีซัน — อัปเดตคะแนนหรือเลือกหมวดที่ตรงปฏิทินไทยกว่า",
    });
  }
  const calendarMiss = db.products.filter((p) => {
    const { boost } = thaiSeasonBoost(p.category, dateFromYmd(date));
    return boost < 6 && seasonalScoreOf(p) >= 4;
  }).length;
  if (calendarMiss > 0) {
    actions.push({
      id: "calendar-align",
      title: `เช็กหมวดกับปฏิทิน (${seasonLabel})`,
      detail: `มี ${calendarMiss} สินค้าคะแนนซีซันสูงแต่หมวดไม่ค่อยตรงปฏิทิน — ปรับหมวด/คะแนนให้สอดคล้องก่อน Approve`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail:
      "ทุกระดับซีซันต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Seasonal Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับศักยภาพซีซัน/เทรนด์"
      : `Seasonal Fit Lab: ${posted.length} โพสต์มีเมตริก · ช่วงที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับระดับซีซันมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่มมุมซีซันแบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Seasonal Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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
    seasonLabel,
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

export function seasonalFitLabLines(
  lab: SeasonalFitLab,
  limit = 6,
): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function seasonalFitLabToMarkdown(lab: SeasonalFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0 || b.productCount > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   สินค้าในแคตตาล็อก ${b.productCount} · seasonalScore avg ~${b.avgSeasonalScore}\n` +
        `   CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · seasonalScore ${s.seasonalScore}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Seasonal Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- ปฏิทินไทย: ${lab.seasonLabel}`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- ระดับซีซันที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับระดับซีซัน/เทรนด์ (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับระดับซีซันวันนี้)_"]),
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
