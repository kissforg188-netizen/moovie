/**
 * Benefit Fit Lab — soft ranking of benefit framing from logged metrics.
 * Suggests sincere help-choose benefit styles (result_first / ease_daily /
 * save_time / feel_relief); flags hype_claim; never auto-rewrites captions
 * or claims guaranteed income. Complements Offer Fit + Proof Fit Labs with
 * “ควรพูดประโยชน์แบบไหน” (ช่วยเลือกของ เน้นประโยชน์จริง ไม่เคลมเกิน).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type BenefitFitGrade = "A" | "B" | "C" | "D";
export type BenefitStyleKind =
  | "result_first"
  | "ease_daily"
  | "save_time"
  | "feel_relief"
  | "hype_claim"
  | "none";
export type BenefitFitStatus = "hot" | "steady" | "cold" | "no_data";
export type BenefitFitConfidence = "thin" | "ok" | "solid";

export const BENEFIT_STYLE_ORDER: BenefitStyleKind[] = [
  "result_first",
  "ease_daily",
  "save_time",
  "feel_relief",
  "hype_claim",
  "none",
];

const BAND_STATUS_LABEL: Record<BenefitFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<BenefitFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<BenefitStyleKind, string> = {
  result_first: "ประโยชน์ผลลัพธ์",
  ease_daily: "ประโยชน์ใช้ง่าย",
  save_time: "ประโยชน์ประหยัดเวลา",
  feel_relief: "ประโยชน์โล่งใจ",
  hype_claim: "ประโยชน์เคลมเกิน",
  none: "ไม่มีสัญญาณประโยชน์",
};

const BAND_RANGE: Record<BenefitStyleKind, string> = {
  result_first: "พูดผลที่ได้แบบช่วยตัดสินใจ ไม่การันตีผลทุกคน",
  ease_daily: "เน้นใช้ง่ายในชีวิตประจำวัน ไม่เทสเปกยาว",
  save_time: "พูดประหยัดเวลา/ขั้นตอนเบา ๆ ไม่โอเวอร์",
  feel_relief: "เปิดด้วยกังวล/pain แล้วแชร์ตัวเลือกที่ช่วยโล่งใจ",
  hype_claim: "เคลมวิเศษ/หายขาด/100% — ไม่แนะนำ",
  none: "ไม่มีสัญญาณประโยชน์หรือผลที่ได้ในแคปชัน",
};

const STYLE_HINT: Record<BenefitStyleKind, string> = {
  result_first: "บอกผลที่หวังได้ 1 ข้อ + ให้ดูสเปกต่อเอง + disclosure",
  ease_daily: "โชว์ขั้นตอนใช้สั้น ๆ ในชีวิตประจำวัน",
  save_time: "พูดช่วยเซฟเวลาเบา ๆ ไม่การันตีนาที",
  feel_relief: "เปิดด้วยกังวล → แชร์ตัวเลือก → ไม่เร่งซื้อ",
  hype_claim: "หลีกเลี่ยง — regenerate เป็นประโยชน์แบบช่วยเลือกของ",
  none: "ใส่ป้ายประโยชน์ (ผลลัพธ์ / ใช้ง่าย / ประหยัดเวลา / โล่งใจ) ให้ชัดก่อน Approve",
};

const RESULT_FIRST_RE =
  /ประโยชน์ผลลัพธ์|ผลลัพธ์ก่อน|result.?first|ได้ผลแบบ|ผลที่ได้|ช่วยให้ได้/i;

const EASE_DAILY_RE =
  /ประโยชน์ใช้ง่าย|ใช้ง่ายประจำวัน|ease.?daily|ใช้ง่าย|ตั้งง่าย|พกง่าย|ไม่ยุ่งยาก/i;

const SAVE_TIME_RE =
  /ประโยชน์ประหยัดเวลา|ประหยัดเวลา|save.?time|เซฟเวลา|ลดขั้นตอน|รวดเร็วขึ้น/i;

const FEEL_RELIEF_RE =
  /ประโยชน์โล่งใจ|โล่งใจ|feel.?relief|ลดกังวล|หายห่วง|เคยเครียด|ช่วยเรื่อง/i;

const HYPE_CLAIM_RE =
  /ประโยชน์เคลมเกิน|วิเศษ|หายขาด|100%|การันตีผล|สุดยอดแน่นอน|ต้องได้ผล|hype.?claim|เปลี่ยนชีวิตทันที|มหัศจรรย์/i;

export interface BenefitFitRow {
  band: BenefitStyleKind;
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
  status: BenefitFitStatus;
  confidence: BenefitFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface BenefitFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: BenefitStyleKind;
  currentLabel: string;
  suggestedBand: BenefitStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface BenefitFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface BenefitFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: BenefitFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    hypeClaimSamples: number;
    noneSamples: number;
  };
  bands: BenefitFitRow[];
  mixTip: string;
  suggestions: BenefitFitSuggestion[];
  actions: BenefitFitAction[];
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

function resolveBenefitText(
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
 * Classify benefit framing into a soft band.
 * Prefer explicit “ประโยชน์…” labels; hype_claim wins when detected; else soft cues.
 */
export function classifyBenefitStyle(text: string): BenefitStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "none";

  // Compliance-first: hype claim overrides soft labels.
  if (HYPE_CLAIM_RE.test(raw)) return "hype_claim";

  const firstLabel = raw.match(
    /ประโยชน์ผลลัพธ์|ประโยชน์ใช้ง่าย|ประโยชน์ประหยัดเวลา|ประโยชน์โล่งใจ|ประโยชน์เคลมเกิน/i,
  )?.[0];
  if (firstLabel) {
    const label = firstLabel.toLowerCase();
    if (label.includes("ผลลัพธ์")) return "result_first";
    if (label.includes("ใช้ง่าย")) return "ease_daily";
    if (label.includes("ประหยัดเวลา")) return "save_time";
    if (label.includes("โล่งใจ")) return "feel_relief";
    if (label.includes("เคลมเกิน")) return "hype_claim";
  }

  const result = RESULT_FIRST_RE.test(raw);
  const ease = EASE_DAILY_RE.test(raw);
  const save = SAVE_TIME_RE.test(raw);
  const relief = FEEL_RELIEF_RE.test(raw);

  // Soft priority when mixed: feel_relief → result_first → ease_daily → save_time.
  if (relief) return "feel_relief";
  if (result) return "result_first";
  if (ease) return "ease_daily";
  if (save) return "save_time";
  return "none";
}

export function benefitStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): BenefitStyleKind {
  return classifyBenefitStyle(resolveBenefitText(pack, post.captionPreview));
}

export function benefitStyleLabel(band: BenefitStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): BenefitFitConfidence {
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
  band: BenefitStyleKind;
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

  // Soft nudge toward sincere help-choose benefit framing.
  if (params.band === "feel_relief") score += 5;
  else if (params.band === "result_first") score += 4;
  else if (params.band === "ease_daily") score += 4;
  else if (params.band === "save_time") score += 3;
  else if (params.band === "hype_claim") score -= 18;
  else if (params.band === "none") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): BenefitFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<BenefitFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลมุมประโยชน์นี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "hype_claim") {
    return `มุมเคลมเกิน — หลีกเลี่ยง regenerate เป็นประโยชน์แบบช่วยเลือกของก่อน Approve`;
  }
  if (row.band === "none") {
    return `ไม่มีสัญญาณประโยชน์ — ใส่ป้ายประโยชน์ให้ชัด แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `มุมประโยชน์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในมุมประโยชน์นี้ — ลองปรับกรอบประโยชน์หรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้มุมประโยชน์นี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายผลลัพธ์/ใช้ง่าย/โล่งใจ เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในมุมประโยชน์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): BenefitFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Benefit Fit Lab from manually logged post metrics + captions/scripts.
 */
export function buildBenefitFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): BenefitFitLab {
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

  const byBand = new Map<BenefitStyleKind, ScheduledPost[]>();
  for (const band of BENEFIT_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = benefitStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: BenefitFitRow[] = BENEFIT_STYLE_ORDER.map((band) => {
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
    const row: Omit<BenefitFitRow, "tip"> = {
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
  const hypeClaimSamples = byBand.get("hype_claim")?.length ?? 0;
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
  if (hypeClaimSamples > 0) labScore = Math.max(0, labScore - 10);
  if (noneSamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hype_claim",
    ) ??
    withData.find((b) => b.band !== "none" && b.band !== "hype_claim") ??
    withData[0];
  const cold = withData.filter(
    (b) =>
      b.status === "cold" || b.band === "none" || b.band === "hype_claim",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายมุมประโยชน์ — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์ประโยชน์"
      : hypeClaimSamples > 0
        ? `พบประโยชน์เคลมเกิน ${hypeClaimSamples} ชิ้น — regenerate เป็นมุมช่วยเลือกของก่อน Approve (ทดลอง)`
        : noneSamples > 0 && noneSamples >= Math.ceil(posted.length / 2)
          ? `พบประโยชน์ none ${noneSamples} ชิ้น — ใส่ป้ายประโยชน์ให้ชัดก่อน Approve (ทดลอง)`
          : unbalanced && best
            ? `มิกซ์เอนไปมุม ${best.bandLabel} มาก — วันถัดไปลองสลับมุมประโยชน์ 1 ชิ้น (ทดลอง)`
            : best
              ? `มุมประโยชน์เด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
              : "เก็บผลต่ออีก 2–3 โพสต์ข้ามมุมประโยชน์ก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: BenefitFitSuggestion[] = [];
  const preferred =
    bands.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hype_claim",
    ) ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "none" &&
        b.band !== "hype_claim",
    ) ??
    bands.find((b) => b.band === "feel_relief");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = benefitStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "none" ||
      currentKey === "hype_claim" ||
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
            b.band !== "hype_claim" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find(
          (b) => b.band === "result_first" || b.band === "ease_daily",
        ) ??
        cold.find((b) => b.band !== "none" && b.band !== "hype_claim");
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

  const actions: BenefitFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายมุมประโยชน์",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมุมประโยชน์",
    });
  }
  if (hypeClaimSamples > 0) {
    actions.push({
      id: "drop-hype-claim",
      title: "เลิกมุมเคลมเกิน / การันตีผล",
      detail: `พบ ${hypeClaimSamples} โพสต์แนวเคลมเกิน — regenerate เป็นประโยชน์แบบช่วยเลือกของก่อน Approve`,
    });
  }
  if (noneSamples > 0) {
    actions.push({
      id: "clarify-none",
      title: "ทำให้มุมประโยชน์ชัดขึ้น",
      detail: `พบ ${noneSamples} โพสต์ไม่มีสัญญาณประโยชน์ — ใส่ป้าย (ผลลัพธ์/ใช้ง่าย/ประหยัดเวลา/โล่งใจ) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (
    best &&
    best.status === "hot" &&
    best.band !== "none" &&
    best.band !== "hype_claim"
  ) {
    actions.push({
      id: "lean-benefit",
      title: `เอียงไปมุม ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์มุมประโยชน์",
      detail:
        "มุมประโยชน์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละมุม 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "none" && b.band !== "hype_claim").length > 0) {
    const coldSoft = cold.filter(
      (b) => b.band !== "none" && b.band !== "hype_claim",
    );
    actions.push({
      id: "review-cold",
      title: `ทบทวนมุมเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับกรอบประโยชน์ / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = BENEFIT_STYLE_ORDER.filter(
    (b) =>
      b !== "none" &&
      b !== "hype_claim" &&
      (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองมุมประโยชน์ที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อมุมแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่หลอกลวง",
    detail:
      "ห้ามเคลมวิเศษ/หายขาด/100% — ทุกแคปชันต้องมี disclosure และผ่าน Approve ก่อนโพสต์มือ",
  });

  const summary =
    posted.length === 0
      ? "Benefit Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมุมประโยชน์"
      : `Benefit Fit Lab: ${posted.length} โพสต์มีเมตริก · มุมที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          hypeClaimSamples > 0 ? ` · เคลมเกิน ${hypeClaimSamples}` : ""
        }${noneSamples > 0 ? ` · none ${noneSamples}` : ""}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับมุมประโยชน์มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับมุมประโยชน์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "ห้ามใช้คำวิเศษ / หายขาด / การันตีผลแบบหลอกลวง",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Benefit Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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
      hypeClaimSamples,
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

export function benefitFitLabLines(lab: BenefitFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function benefitFitLabToMarkdown(lab: BenefitFitLab): string {
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
    `# Benefit Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- มุมที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- เคลมเกิน: ${lab.counts.hypeClaimSamples}`,
    `- none: ${lab.counts.noneSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับมุมประโยชน์ (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับมุมประโยชน์วันนี้)_"]),
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
