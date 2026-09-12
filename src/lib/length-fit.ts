/**
 * Length Fit Lab — soft ranking of caption-length bands from logged metrics.
 * Suggests readable lengths for TikTok / Facebook / Reels (compact–standard);
 * never auto-rewrites captions or claims guaranteed income.
 * Complements Tone/Angle Fit Labs with body-length learning
 * (สั้นพออ่าน · ไม่สแปมยาว · มีเนื้อหาพอช่วยเลือกของ).
 */

import { dateFromYmd } from "./db";
import { AFFILIATE_DISCLOSURE, INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type LengthFitGrade = "A" | "B" | "C" | "D";
export type LengthBandKind =
  | "micro"
  | "compact"
  | "standard"
  | "detailed"
  | "longform"
  | "empty";
export type LengthFitStatus = "hot" | "steady" | "cold" | "no_data";
export type LengthFitConfidence = "thin" | "ok" | "solid";

export const LENGTH_BAND_ORDER: LengthBandKind[] = [
  "micro",
  "compact",
  "standard",
  "detailed",
  "longform",
  "empty",
];

const BAND_STATUS_LABEL: Record<LengthFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<LengthFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<LengthBandKind, string> = {
  micro: "สั้นมาก (micro)",
  compact: "กระชับ (compact)",
  standard: "มาตรฐาน (standard)",
  detailed: "ละเอียด (detailed)",
  longform: "ยาวมาก (longform)",
  empty: "ว่าง / ไม่มีเนื้อหา",
};

const BAND_RANGE: Record<LengthBandKind, string> = {
  micro: "เนื้อหา 1–90 ตัวอักษร (หลังตัด disclosure)",
  compact: "เนื้อหา 91–180 ตัวอักษร — เหมาะคลิปสั้น",
  standard: "เนื้อหา 181–340 ตัวอักษร — อ่านง่ายบน FB/Reels",
  detailed: "เนื้อหา 341–560 ตัวอักษร — รายละเอียดพอ",
  longform: "เนื้อหา >560 ตัวอักษร — เสี่ยงยาวเกิน",
  empty: "ไม่มีเนื้อหาขาย / มีแค่ disclosure",
};

const STYLE_HINT: Record<LengthBandKind, string> = {
  micro: "เติม hook + จุดขาย 1 ข้อ + CTA อ่อน ให้อยู่ช่วง compact–standard",
  compact: "คงความกระชับ: ปัญหาสั้น → จุดชอบ 1 ข้อ → ลิงก์+disclosure",
  standard: "คงความยาวพออ่าน: ช่วยเลือกของ ไม่ยัดยี่ห้อยาว ๆ",
  detailed: "ตัดส่วนซ้ำ เหลือจุดขายหลัก 2 ข้อ ก่อน Approve",
  longform: "ย่อเหลือ compact–standard กันสแปมฟีล — เก็บรายละเอียดไว้ในวิดีโอ",
  empty: "เขียนแคปชันจริง + disclosure ก่อน Approve",
};

export interface LengthFitRow {
  band: LengthBandKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  avgChars: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: LengthFitStatus;
  confidence: LengthFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface LengthFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: LengthBandKind;
  currentLabel: string;
  suggestedBand: LengthBandKind;
  suggestedLabel: string;
  captionPreview: string;
  charCount: number;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface LengthFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface LengthFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: LengthFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    emptySamples: number;
  };
  bands: LengthFitRow[];
  mixTip: string;
  suggestions: LengthFitSuggestion[];
  actions: LengthFitAction[];
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
 * Strip affiliate disclosure so length reflects the selling body only.
 */
export function captionBodyLength(text: string): number {
  const raw = (text ?? "")
    .replaceAll(AFFILIATE_DISCLOSURE, " ")
    .replace(/ลิงก์นี้เป็นลิงก์\s*affiliate[^\n]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length;
}

function resolveLengthText(
  pack: ContentPack | undefined,
  captionPreview?: string,
  channel?: ScheduledPost["channel"],
): string {
  if (captionPreview?.trim()) return captionPreview.trim();
  if (!pack) return "";
  if (channel === "facebook_reels" && pack.reelsCaption) return pack.reelsCaption;
  if (channel === "facebook_group" && pack.facebookGroupCaption) {
    return pack.facebookGroupCaption;
  }
  if (channel === "facebook_post" && pack.facebookCaption) {
    return pack.facebookCaption;
  }
  if (pack.facebookCaption) return pack.facebookCaption;
  if (pack.reelsCaption) return pack.reelsCaption;
  if (pack.facebookGroupCaption) return pack.facebookGroupCaption;
  const scriptLines = pack.tiktokScript?.scenes?.map((s) => s.line) ?? [];
  if (scriptLines.length) return scriptLines.join(" ");
  return "";
}

/**
 * Classify caption body length into a soft band.
 */
export function classifyLengthBand(text: string): LengthBandKind {
  const n = captionBodyLength(text);
  if (n <= 0) return "empty";
  if (n <= 90) return "micro";
  if (n <= 180) return "compact";
  if (n <= 340) return "standard";
  if (n <= 560) return "detailed";
  return "longform";
}

export function lengthBandOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId" | "channel">,
  pack?: ContentPack,
): LengthBandKind {
  return classifyLengthBand(
    resolveLengthText(pack, post.captionPreview, post.channel),
  );
}

export function lengthBandLabel(band: LengthBandKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): LengthFitConfidence {
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
  band: LengthBandKind;
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

  // Soft nudge toward readable short-form lengths.
  if (params.band === "compact") score += 5;
  else if (params.band === "standard") score += 5;
  else if (params.band === "detailed") score += 2;
  else if (params.band === "micro") score += 1;
  else if (params.band === "longform") score -= 3;
  else if (params.band === "empty") score -= 8;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): LengthFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<LengthFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลช่วงนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "empty") {
    return `แคปชันว่าง/มีแค่ disclosure — เขียนเนื้อหาช่วยเลือกของก่อน Approve`;
  }
  if (row.status === "hot") {
    return `ความยาวนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในช่วงความยาวนี้ — ลองย่อ/ขยายแคปชันหรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้ความยาวนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจาย compact/standard เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): LengthFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Length Fit Lab from manually logged post metrics + caption body length.
 */
export function buildLengthFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): LengthFitLab {
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

  const byBand = new Map<LengthBandKind, ScheduledPost[]>();
  for (const band of LENGTH_BAND_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = lengthBandOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: LengthFitRow[] = LENGTH_BAND_ORDER.map((band) => {
    const list = byBand.get(band) ?? [];
    const samples = list.length;
    const views = list.map((p) => p.metrics!.views);
    const clicks = list.map((p) => p.metrics!.clicks);
    const orders = list.map((p) => p.metrics!.orders);
    const commissions = list.map((p) => p.metrics!.commissionEarned);
    const chars = list.map((p) => {
      const pack = packById.get(p.contentPackId);
      return captionBodyLength(
        resolveLengthText(pack, p.captionPreview, p.channel),
      );
    });
    const avgViews = avg(views);
    const avgClicks = avg(clicks);
    const avgOrders = avg(orders);
    const avgCommission = avg(commissions);
    const avgChars = avg(chars);
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
    const row: Omit<LengthFitRow, "tip"> = {
      band,
      bandLabel: BAND_LABEL[band],
      rangeLabel: BAND_RANGE[band],
      samples,
      avgChars: round1(avgChars),
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
  const emptySamples = byBand.get("empty")?.length ?? 0;
  const topShare = Math.max(0, ...bands.map((b) => b.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((b) => b.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  if (emptySamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find((b) => b.status === "hot" && b.band !== "empty") ??
    withData.find((b) => b.band !== "empty") ??
    withData[0];
  const cold = withData.filter(
    (b) => b.status === "cold" || b.band === "empty",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายความยาวแคปชัน — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์ความยาว"
      : emptySamples > 0 && emptySamples >= Math.ceil(posted.length / 2)
        ? `พบแคปชันว่าง ${emptySamples} ชิ้น — เขียนเนื้อหาช่วยเลือกของ + disclosure ก่อน Approve (ทดลอง)`
        : unbalanced && best
          ? `มิกซ์เอนไปช่วง ${best.bandLabel} มาก — วันถัดไปลองสลับความยาว 1 ชิ้น (ทดลอง)`
          : best
            ? `ความยาวเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
            : "เก็บผลต่ออีก 2–3 โพสต์ข้ามช่วงความยาก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: LengthFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot" && b.band !== "empty") ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "empty",
    ) ??
    bands.find((b) => b.band === "compact" || b.band === "standard");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const text = resolveLengthText(pack, slot.captionPreview, slot.channel);
    const charCount = captionBodyLength(text);
    const currentKey = classifyLengthBand(text);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "empty" ||
      currentKey === "longform" ||
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
        charCount,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น/เสี่ยง · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
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
            b.band !== "empty" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find((b) => b.band === "standard" || b.band === "compact") ??
        cold.find((b) => b.band !== "empty");
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
        charCount,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนความยาว ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: LengthFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายความยาวแคปชัน",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อช่วงความยาว",
    });
  }
  if (emptySamples > 0) {
    actions.push({
      id: "fill-empty",
      title: "เติมเนื้อหาแคปชันที่ว่าง",
      detail: `พบ ${emptySamples} โพสต์ว่าง/มีแค่ disclosure — เขียนช่วยเลือกของแล้ว regenerate ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "empty") {
    actions.push({
      id: "lean-length",
      title: `เอียงทดลองไปช่วง ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์ความยาว",
      detail:
        "ช่วงเด่นกินสัดส่วนสูง — เพิ่ม draft คนละความยาว 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "empty").length > 0) {
    const coldSoft = cold.filter((b) => b.band !== "empty");
    actions.push({
      id: "review-cold",
      title: `ทบทวนความยาวเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ย่อ/ขยายแคปชัน / regenerate หรือพักช่วงนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingBands = LENGTH_BAND_ORDER.filter(
    (b) => b !== "empty" && (byBand.get(b) ?? []).length === 0,
  );
  if (missingBands.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-bands",
      title: `ทดลองความยาวที่ยังไม่มีข้อมูล (${missingBands.length})`,
      detail: `ยังไม่มี: ${missingBands.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อช่วงแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่ขายแข็ง",
    detail:
      "ทุกแคปชันต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Length Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความยาวแคปชัน"
      : `Length Fit Lab: ${posted.length} โพสต์มีเมตริก · ช่วงที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          emptySamples > 0 ? ` · ว่าง ${emptySamples}` : ""
        }${unbalanced ? " · มิกซ์เอนข้างเดียว" : ""}`;

  const checklist = [
    "อันดับความยาวมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับความยาวเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "หลีกเลี่ยงแคปชันว่างและยาวเกินจนดูสแปม",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Length Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
    mixTip,
  ];
  for (const b of withData.slice(0, 3)) {
    lines.push(
      `${BAND_STATUS_LABEL[b.status]} · ${b.bandLabel}: คะแนน ${b.score} (${CONF_LABEL[b.confidence]}, n=${b.samples}, ~${b.avgChars} ตัวอักษร, CTR ~${round1(b.avgCtr * 100)}%)`,
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
      emptySamples,
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

export function lengthFitLabLines(lab: LengthFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function lengthFitLabToMarkdown(lab: LengthFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   ~${b.avgChars} ตัวอักษร · CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · ${s.charCount} ตัวอักษร\n` +
      `   preview: ${s.captionPreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Length Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- ช่วงที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- ว่าง: ${lab.counts.emptySamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับความยาวแคปชัน (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับความยาววันนี้)_"]),
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
