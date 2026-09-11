/**
 * Offer Fit Lab — soft ranking of value / offer framing from logged metrics.
 * Suggests sincere help-choose offer styles (value_compare / soft_save /
 * problem_first / fair_price); flags hard_push; never auto-rewrites captions
 * or claims guaranteed income. Complements Price Band + Proof Fit Labs with
 * “ควรพูดคุ้มค่าแบบไหน” (ช่วยเลือกของ ไม่ขายแข็ง ไม่หลอก).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type OfferFitGrade = "A" | "B" | "C" | "D";
export type OfferStyleKind =
  | "value_compare"
  | "soft_save"
  | "problem_first"
  | "fair_price"
  | "hard_push"
  | "none";
export type OfferFitStatus = "hot" | "steady" | "cold" | "no_data";
export type OfferFitConfidence = "thin" | "ok" | "solid";

export const OFFER_STYLE_ORDER: OfferStyleKind[] = [
  "value_compare",
  "soft_save",
  "problem_first",
  "fair_price",
  "hard_push",
  "none",
];

const BAND_STATUS_LABEL: Record<OfferFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<OfferFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<OfferStyleKind, string> = {
  value_compare: "เสนอคุ้มเทียบ",
  soft_save: "เสนอประหยัดเบา",
  problem_first: "เสนอแก้ปัญหาก่อน",
  fair_price: "เสนอราคาพอดี",
  hard_push: "เสนอขายแข็ง / ลดแรง",
  none: "ไม่มีสัญญาณเสนอคุ้มค่า",
};

const BAND_RANGE: Record<OfferStyleKind, string> = {
  value_compare: "เทียบความคุ้มกับของเดิม/ตัวเลือกอื่นแบบช่วยตัดสินใจ",
  soft_save: "พูดประหยัดงบเบา ๆ ไม่เร่งกดซื้อ",
  problem_first: "เปิดด้วยปัญหา/pain ก่อน แล้วค่อยพูดราคา",
  fair_price: "บอกราคาประมาณแบบพอดี ไม่โอเวอร์เคลมคุ้ม",
  hard_push: "ลดแรง / รีบซื้อ / ของหมด — ไม่แนะนำ",
  none: "ไม่มีสัญญาณเสนอคุ้มค่าหรือกรอบราคาในแคปชัน",
};

const STYLE_HINT: Record<OfferStyleKind, string> = {
  value_compare: "เทียบคุ้มสั้น ๆ 1 ข้อ + ให้ดูสเปกต่อเอง + disclosure",
  soft_save: "พูดช่วยเซฟงบเบา ๆ ไม่การันตีประหยัดกี่บาท",
  problem_first: "เปิดด้วยปัญหา → แชร์ตัวเลือก → ราคาประมาณท้าย ๆ",
  fair_price: "บอกราคาประมาณแบบตรวจก่อนซื้อเสมอ",
  hard_push: "หลีกเลี่ยง — regenerate เป็นเสนอคุ้มแบบช่วยเลือกของ",
  none: "ใส่ป้ายเสนอ (คุ้มเทียบ / ประหยัดเบา / แก้ปัญหาก่อน / ราคาพอดี) ให้ชัดก่อน Approve",
};

const VALUE_COMPARE_RE =
  /เสนอคุ้มเทียบ|คุ้มเทียบ|เทียบคุ้ม|คุ้มกว่า|value.?compare|คุ้มกับราคา|คุ้มกับงาน/i;

const SOFT_SAVE_RE =
  /เสนอประหยัดเบา|ประหยัดเบา|ช่วยเซฟงบ|เซฟงบ|soft.?save|ประหยัดงบ|ไม่ต้องซื้อแพง/i;

const PROBLEM_FIRST_RE =
  /เสนอแก้ปัญหาก่อน|แก้ปัญหาก่อน|problem.?first|ปัญหาคือ|เคยเจอไหม|ช่วยเรื่อง/i;

const FAIR_PRICE_RE =
  /เสนอราคาพอดี|ราคาพอดี|ราคาประมาณ|fair.?price|ตรวจราคาก่อน|ราคาไม่แรง/i;

const HARD_PUSH_RE =
  /เสนอขายแข็ง|ลดแรง|รีบซื้อ|ของหมด|flash.?sale|สุดคุ้มแน่นอน|ถูกที่สุด|ต้องกดเลย|hard.?push|ด่วนสุด ๆ|โอกาสสุดท้าย/i;

export interface OfferFitRow {
  band: OfferStyleKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: OfferFitStatus;
  confidence: OfferFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface OfferFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: OfferStyleKind;
  currentLabel: string;
  suggestedBand: OfferStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface OfferFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface OfferFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: OfferFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    hardPushSamples: number;
    noneSamples: number;
  };
  bands: OfferFitRow[];
  mixTip: string;
  suggestions: OfferFitSuggestion[];
  actions: OfferFitAction[];
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

function resolveOfferText(
  pack: ContentPack | undefined,
  captionPreview?: string,
): string {
  const parts: string[] = [];
  if (captionPreview?.trim()) parts.push(captionPreview.trim());
  if (pack?.facebookCaption) parts.push(pack.facebookCaption);
  if (pack?.facebookGroupCaption) parts.push(pack.facebookGroupCaption);
  if (pack?.reelsCaption) parts.push(pack.reelsCaption);
  if (pack?.tiktokScript) {
    const scenes = pack.tiktokScript.scenes ?? [];
    for (const s of scenes) {
      if (s.line) parts.push(s.line);
      if (s.visual) parts.push(s.visual);
    }
    if (pack.tiktokScript.voiceover) parts.push(pack.tiktokScript.voiceover);
  }
  if (pack?.videoPriorityNote) parts.push(pack.videoPriorityNote);
  if (pack?.sellingAngles?.length) {
    parts.push(pack.sellingAngles.slice(0, 3).join(" "));
  }
  if (pack?.hooks?.length) parts.push(pack.hooks.slice(0, 2).join(" "));
  return parts.join("\n");
}

/**
 * Classify value / offer framing into a soft band.
 * Prefer explicit “เสนอ…” labels; hard_push wins when detected; else soft cues.
 */
export function classifyOfferStyle(text: string): OfferStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "none";

  // Compliance-first: hard push overrides soft labels.
  if (HARD_PUSH_RE.test(raw)) return "hard_push";

  const firstLabel = raw.match(
    /เสนอคุ้มเทียบ|เสนอประหยัดเบา|เสนอแก้ปัญหาก่อน|เสนอราคาพอดี|เสนอขายแข็ง/i,
  )?.[0];
  if (firstLabel) {
    const label = firstLabel.toLowerCase();
    if (label.includes("คุ้มเทียบ")) return "value_compare";
    if (label.includes("ประหยัดเบา")) return "soft_save";
    if (label.includes("แก้ปัญหาก่อน")) return "problem_first";
    if (label.includes("ราคาพอดี")) return "fair_price";
    if (label.includes("ขายแข็ง")) return "hard_push";
  }

  const value = VALUE_COMPARE_RE.test(raw);
  const save = SOFT_SAVE_RE.test(raw);
  const problem = PROBLEM_FIRST_RE.test(raw);
  const fair = FAIR_PRICE_RE.test(raw);

  // Soft priority when mixed: problem_first → value_compare → soft_save → fair_price.
  if (problem) return "problem_first";
  if (value) return "value_compare";
  if (save) return "soft_save";
  if (fair) return "fair_price";
  return "none";
}

export function offerStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): OfferStyleKind {
  return classifyOfferStyle(resolveOfferText(pack, post.captionPreview));
}

export function offerStyleLabel(band: OfferStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): OfferFitConfidence {
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
  band: OfferStyleKind;
}): number {
  if (params.samples === 0) return 0;

  const commBase =
    params.globalAvgCommission > 0
      ? clamp((params.avgCommission / params.globalAvgCommission) * 50, 0, 70)
      : clamp(params.avgCommission * 2, 0, 50);
  const ctrScore = clamp(params.avgCtr * 220, 0, 22);
  const opcScore = clamp(params.avgOrdersPerClick * 100, 0, 15);
  const orderScore = clamp(params.avgOrders * 8, 0, 15);
  let score = commBase + ctrScore + opcScore + orderScore;

  // Soft nudge toward sincere help-choose offer framing.
  if (params.band === "problem_first") score += 5;
  else if (params.band === "value_compare") score += 4;
  else if (params.band === "soft_save") score += 4;
  else if (params.band === "fair_price") score += 3;
  else if (params.band === "hard_push") score -= 18;
  else if (params.band === "none") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): OfferFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<OfferFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลมุมเสนอนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "hard_push") {
    return `มุมขายแข็ง/ลดแรง — หลีกเลี่ยง regenerate เป็นเสนอคุ้มแบบช่วยเลือกของก่อน Approve`;
  }
  if (row.band === "none") {
    return `ไม่มีสัญญาณเสนอคุ้มค่า — ใส่ป้ายเสนอให้ชัด แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `มุมเสนอนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในมุมเสนอนี้ — ลองปรับกรอบคุ้มค่าหรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้มุมเสนอนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายคุ้มเทียบ/ประหยัดเบา/แก้ปัญหาก่อน เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในมุมเสนอนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): OfferFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Offer Fit Lab from manually logged post metrics + captions/scripts.
 */
export function buildOfferFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): OfferFitLab {
  const window = Math.max(7, Math.min(30, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));
  const packById = new Map(db.contentPacks.map((p) => [p.id, p]));
  const productById = new Map(db.products.map((p) => [p.id, p]));

  const posted = db.schedule.filter(
    (s) =>
      s.status === "posted" &&
      s.metrics != null &&
      s.date >= fromDate &&
      s.date <= date,
  );

  const byBand = new Map<OfferStyleKind, ScheduledPost[]>();
  for (const band of OFFER_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = offerStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: OfferFitRow[] = OFFER_STYLE_ORDER.map((band) => {
    const list = byBand.get(band) ?? [];
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
    const row: Omit<OfferFitRow, "tip"> = {
      band,
      bandLabel: BAND_LABEL[band],
      rangeLabel: BAND_RANGE[band],
      samples,
      avgViews: round1(avgViews),
      avgClicks: round1(avgClicks),
      avgOrders: round2(avgOrders),
      avgCommission: round1(avgCommission),
      avgCtr: round2(avgCtr),
      avgOrdersPerClick: round2(avgOrdersPerClick),
      score,
      status,
      confidence,
      shareOfPosts: round2(shareOfPosts),
    };
    return { ...row, tip: tipFor(row) };
  }).sort((a, b) => b.score - a.score || b.samples - a.samples);

  const withData = bands.filter((b) => b.samples > 0);
  const hot = bands.filter((b) => b.status === "hot").length;
  const hardPushSamples = byBand.get("hard_push")?.length ?? 0;
  const noneSamples = byBand.get("none")?.length ?? 0;
  const topShare = Math.max(0, ...bands.map((b) => b.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((b) => b.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  if (hardPushSamples > 0) labScore = Math.max(0, labScore - 10);
  if (noneSamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hard_push",
    ) ??
    withData.find((b) => b.band !== "none" && b.band !== "hard_push") ??
    withData[0];
  const cold = withData.filter(
    (b) =>
      b.status === "cold" || b.band === "none" || b.band === "hard_push",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายมุมเสนอ — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์เสนอคุ้มค่า"
      : hardPushSamples > 0
        ? `พบเสนอขายแข็ง ${hardPushSamples} ชิ้น — regenerate เป็นมุมช่วยเลือกของก่อน Approve (ทดลอง)`
        : noneSamples > 0 && noneSamples >= Math.ceil(posted.length / 2)
          ? `พบเสนอ none ${noneSamples} ชิ้น — ใส่ป้ายเสนอคุ้มค่าให้ชัดก่อน Approve (ทดลอง)`
          : unbalanced && best
            ? `มิกซ์เอนไปมุม ${best.bandLabel} มาก — วันถัดไปลองสลับมุมเสนอ 1 ชิ้น (ทดลอง)`
            : best
              ? `มุมเสนอเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
              : "เก็บผลต่ออีก 2–3 โพสต์ข้ามมุมเสนอก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: OfferFitSuggestion[] = [];
  const preferred =
    bands.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hard_push",
    ) ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "none" &&
        b.band !== "hard_push",
    ) ??
    bands.find((b) => b.band === "problem_first");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = offerStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "none" ||
      currentKey === "hard_push" ||
      (currentRow != null &&
        (currentRow.status === "cold" ||
          (currentRow.status === "no_data" && preferred.status === "hot")));

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        captionPreview: preview || "(ไม่มีแคปชัน)",
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น/ไม่ชัด · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่แก้แคปชันอัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์",
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
            b.band !== "none" &&
            b.band !== "hard_push" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find(
          (b) => b.band === "value_compare" || b.band === "soft_save",
        ) ??
        cold.find((b) => b.band !== "none" && b.band !== "hard_push");
      if (!alt) continue;
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: alt.band,
        suggestedLabel: alt.bandLabel,
        captionPreview: preview || "(ไม่มีแคปชัน)",
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนมุม ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: OfferFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายมุมเสนอ",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมุมเสนอ",
    });
  }
  if (hardPushSamples > 0) {
    actions.push({
      id: "drop-hard-push",
      title: "เลิกมุมขายแข็ง / ลดแรง",
      detail: `พบ ${hardPushSamples} โพสต์แนวขายแข็ง — regenerate เป็นเสนอคุ้มแบบช่วยเลือกของก่อน Approve`,
    });
  }
  if (noneSamples > 0) {
    actions.push({
      id: "clarify-none",
      title: "ทำให้มุมเสนอชัดขึ้น",
      detail: `พบ ${noneSamples} โพสต์ไม่มีสัญญาณเสนอคุ้มค่า — ใส่ป้าย (คุ้มเทียบ/ประหยัดเบา/แก้ปัญหาก่อน/ราคาพอดี) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "none" && best.band !== "hard_push") {
    actions.push({
      id: "lean-offer",
      title: `เอียงไปมุม ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์มุมเสนอ",
      detail:
        "มุมเสนอเด่นกินสัดส่วนสูง — เพิ่ม draft คนละมุม 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "none" && b.band !== "hard_push").length > 0) {
    const coldSoft = cold.filter(
      (b) => b.band !== "none" && b.band !== "hard_push",
    );
    actions.push({
      id: "review-cold",
      title: `ทบทวนมุมเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับกรอบคุ้มค่า / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = OFFER_STYLE_ORDER.filter(
    (b) =>
      b !== "none" &&
      b !== "hard_push" &&
      (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองมุมเสนอที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อมุมแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่หลอกลวง",
    detail:
      "ห้ามเคลมถูกที่สุด/ลดแรงหลอก — ทุกแคปชันต้องมี disclosure และผ่าน Approve ก่อนโพสต์มือ",
  });

  const summary =
    posted.length === 0
      ? "Offer Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมุมเสนอ"
      : `Offer Fit Lab: ${posted.length} โพสต์มีเมตริก · มุมที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          hardPushSamples > 0 ? ` · ขายแข็ง ${hardPushSamples}` : ""
        }${noneSamples > 0 ? ` · none ${noneSamples}` : ""}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับมุมเสนอมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับมุมเสนอเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "ห้ามใช้คำลดแรงหลอก / ถูกที่สุด / รีบซื้อแบบหลอกลวง",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Offer Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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
      hardPushSamples,
      noneSamples,
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

export function offerFitLabLines(lab: OfferFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function offerFitLabToMarkdown(lab: OfferFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel}\n` +
      `   preview: ${s.captionPreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Offer Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- มุมที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- ขายแข็ง: ${lab.counts.hardPushSamples}`,
    `- none: ${lab.counts.noneSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับมุมเสนอคุ้มค่า (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับมุมเสนอวันนี้)_"]),
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
