/**
 * Tone Fit Lab — soft ranking of caption tone styles from logged metrics.
 * Suggests sincere helper-tone mix (helper / story / compare / flat / hard_push);
 * never auto-rewrites captions or claims guaranteed income.
 * Complements Hook/CTA Fit Labs with overall voice learning
 * (ช่วยเลือกของ ไม่ขายแข็ง).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type ToneFitGrade = "A" | "B" | "C" | "D";
export type ToneStyleKind =
  | "helper"
  | "story"
  | "compare"
  | "flat"
  | "hard_push";
export type ToneFitStatus = "hot" | "steady" | "cold" | "no_data";
export type ToneFitConfidence = "thin" | "ok" | "solid";

export const TONE_STYLE_ORDER: ToneStyleKind[] = [
  "helper",
  "story",
  "compare",
  "flat",
  "hard_push",
];

const BAND_STATUS_LABEL: Record<ToneFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<ToneFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<ToneStyleKind, string> = {
  helper: "ช่วยเลือกของ · อ่อนโยน",
  story: "เล่าประสบการณ์จริง",
  compare: "เทียบเลือกเงียบ ๆ",
  flat: "กลาง ๆ / ไม่ชัด",
  hard_push: "เร่งซื้อ / แข็งเกินไป",
};

const BAND_RANGE: Record<ToneStyleKind, string> = {
  helper: "เคยเจอไหม · ลองดู · ค่อยตัดสินใจ · ช่วยเรื่อง",
  story: "เล่าจากมุมคนใช้ · จุดที่ชอบ · สั้น ๆ ตรง ๆ",
  compare: "เทียบของเดิม · ตัวเลือก · ราคาประมาณ",
  flat: "ไม่มีสัญญาณ helper/story/compare ที่ชัด",
  hard_push: "กดเลย · สั่งด่วน · การันตี · !!!",
};

const STYLE_HINT: Record<ToneStyleKind, string> = {
  helper:
    "น้ำเสียงเพื่อนช่วยเลือก — เปิดด้วยปัญหาสั้น ๆ แล้วชวนดูรายละเอียด ไม่เร่งซื้อ",
  story: "เล่า 1 สถานการณ์ใช้งานจริง + จุดที่ชอบ 1 ข้อ แล้วปิดด้วยลิงก์+disclosure",
  compare: "ให้เทียบกับของเดิม 1 จุด (สเปก/ราคา) แล้วเปิดดูต่อเอง",
  flat: "ใส่ hook ช่วยเลือกหรือมุมเล่าประสบการณ์ให้ชัดขึ้นก่อน Approve",
  hard_push:
    "ตัดคำเร่งซื้อ/เกินจริง — ใช้โทนช่วยเลือก + disclosure แล้ว regenerate",
};

const HARD_PUSH_RE =
  /(?<!ไม่)การันตี|(?<!ไม่)รับประกัน|กดเลย|สั่งด่วน|(?<!ไม่)ต้องซื้อ|รีบซื้อ|หมดแล้วหมดเลย|โอกาสสุดท้าย|รวยแน่|รวยแน่นอน|ขายดีที่สุด|(?<!ไม่)ที่ดีที่สุด|!!!+|ฟรี!!!|ถูกที่สุดในโลก/i;

const HELPER_RE =
  /เคยเจอไหม|ลองดู|ลองฟัง|ช่วยเรื่อง|ถ้ากำลังหา|ค่อยตัดสินใจ|สนใจดูรายละเอียด|เปิดดูรายละเอียด|ไม่เร่งซื้อ|ช้อปอย่างมีเหตุผล|ช่วยเลือก/i;

const STORY_RE =
  /เล่าจากมุม|คนใช้จริง|จุดที่ชอบ|สั้น ๆ ตรง ๆ|สถานการณ์|ใช้งานจริง|มุมเพื่อน|โชว์ของจริง|จากประสบการณ์/i;

const COMPARE_RE =
  /เทียบ|ของเดิม|ตัวเลือก|ราคาประมาณ|เปิดดูสเปก|อ่านรีวิว|เทียบกับ|หมวด/i;

export interface ToneFitRow {
  band: ToneStyleKind;
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
  status: ToneFitStatus;
  confidence: ToneFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface ToneFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: ToneStyleKind;
  currentLabel: string;
  suggestedBand: ToneStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface ToneFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface ToneFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: ToneFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    hardPushSamples: number;
  };
  bands: ToneFitRow[];
  mixTip: string;
  suggestions: ToneFitSuggestion[];
  actions: ToneFitAction[];
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

function resolveToneText(
  pack: ContentPack | undefined,
  captionPreview?: string,
  hookIndex?: number,
): string {
  const parts: string[] = [];
  if (captionPreview?.trim()) parts.push(captionPreview.trim());
  if (pack) {
    const hi = Math.max(0, hookIndex ?? 0);
    const hook = pack.hooks?.[hi] ?? pack.hooks?.[0];
    if (hook) parts.push(hook);
    if (pack.facebookCaption) parts.push(pack.facebookCaption);
    if (pack.facebookGroupCaption) parts.push(pack.facebookGroupCaption);
    if (pack.reelsCaption) parts.push(pack.reelsCaption);
    if (pack.sellingAngles?.length) {
      parts.push(pack.sellingAngles.slice(0, 2).join(" "));
    }
    const scriptLines = pack.tiktokScript?.scenes?.map((s) => s.line) ?? [];
    if (scriptLines.length) parts.push(scriptLines.join(" "));
  }
  return parts.join("\n");
}

/**
 * Classify overall caption voice into a tone band.
 * hard_push first (compliance), then helper / story / compare, else flat.
 */
export function classifyToneStyle(text: string): ToneStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "flat";
  if (HARD_PUSH_RE.test(raw)) return "hard_push";
  const helper = HELPER_RE.test(raw);
  const story = STORY_RE.test(raw);
  const compare = COMPARE_RE.test(raw);
  // Prefer helper when mixed with soft cues — brand voice.
  if (helper && (story || compare || raw.length >= 40)) return "helper";
  if (helper) return "helper";
  if (story && !compare) return "story";
  if (compare) return "compare";
  if (story) return "story";
  return "flat";
}

export function toneStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId" | "hookIndex">,
  pack?: ContentPack,
): ToneStyleKind {
  return classifyToneStyle(
    resolveToneText(pack, post.captionPreview, post.hookIndex),
  );
}

export function toneStyleLabel(band: ToneStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): ToneFitConfidence {
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
  band: ToneStyleKind;
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

  // Soft nudge toward sincere help-choose voice.
  if (params.band === "helper") score += 5;
  else if (params.band === "story") score += 4;
  else if (params.band === "compare") score += 3;
  else if (params.band === "flat") score -= 4;
  else if (params.band === "hard_push") score -= 10;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): ToneFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<ToneFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลโทนนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "hard_push") {
    return `โทนแข็ง/เร่งซื้อ — ลดการใช้ และ regenerate เป็นช่วยเลือกก่อน Approve`;
  }
  if (row.status === "hot") {
    return `โทนนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุม/สินค้าเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในโทนนี้ — ลองปรับน้ำเสียงหรือ regenerate แคปชันก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้โทนนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจาย helper/story/compare เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในโทนนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): ToneFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Tone Fit Lab from manually logged post metrics + caption voice.
 */
export function buildToneFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): ToneFitLab {
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

  const byBand = new Map<ToneStyleKind, ScheduledPost[]>();
  for (const band of TONE_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = toneStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: ToneFitRow[] = TONE_STYLE_ORDER.map((band) => {
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
    const row: Omit<ToneFitRow, "tip"> = {
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
  const topShare = Math.max(0, ...bands.map((b) => b.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((b) => b.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  if (hardPushSamples > 0) labScore = Math.max(0, labScore - 6);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find((b) => b.status === "hot" && b.band !== "hard_push") ??
    withData.find((b) => b.band !== "hard_push") ??
    withData[0];
  const cold = withData.filter(
    (b) => b.status === "cold" || b.band === "hard_push",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายโทน — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์น้ำเสียง"
      : hardPushSamples > 0
        ? `พบโทน hard_push ${hardPushSamples} ชิ้น — ลดคำเร่งซื้อ แล้วเอียงไป helper/story (ทดลอง)`
        : unbalanced && best
          ? `มิกซ์เอนไปโทน ${best.bandLabel} มาก — วันถัดไปลองสลับน้ำเสียง 1 ชิ้น (ทดลอง)`
          : best
            ? `โทนเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
            : "เก็บผลต่ออีก 2–3 โพสต์ข้ามโทนก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: ToneFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot" && b.band !== "hard_push") ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "hard_push" &&
        b.band !== "flat",
    ) ??
    bands.find((b) => b.band === "helper");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = toneStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "hard_push" ||
      currentKey === "flat" ||
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
            b.band !== "hard_push" &&
            b.band !== "flat" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find((b) => b.band === "story" || b.band === "compare") ??
        cold.find((b) => b.band !== "hard_push");
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
        reason: `วันนี้ซ้อนโทน ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: ToneFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายโทนน้ำเสียง",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อโทน",
    });
  }
  if (hardPushSamples > 0) {
    actions.push({
      id: "drop-hard",
      title: "ลดโทน hard_push",
      detail: `พบ ${hardPushSamples} โพสต์โทนเร่งซื้อ — regenerate เป็นช่วยเลือก + ตรวจ compliance ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "hard_push") {
    actions.push({
      id: "lean-tone",
      title: `เอียงทดลองไปโทน ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์โทนน้ำเสียง",
      detail:
        "โทนเด่นกินสัดส่วนสูง — เพิ่ม draft คนละโทน 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "hard_push").length > 0) {
    const coldSoft = cold.filter((b) => b.band !== "hard_push");
    actions.push({
      id: "review-cold",
      title: `ทบทวนโทนเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับน้ำเสียง / regenerate หรือพักโทนนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = TONE_STYLE_ORDER.filter(
    (b) =>
      b !== "flat" &&
      b !== "hard_push" &&
      (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองโทนที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อโทนแล้ววัดผล`,
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
      ? "Tone Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับโทนน้ำเสียง"
      : `Tone Fit Lab: ${posted.length} โพสต์มีเมตริก · โทนที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          hardPushSamples > 0 ? ` · hard_push ${hardPushSamples}` : ""
        }${unbalanced ? " · มิกซ์เอนข้างเดียว" : ""}`;

  const checklist = [
    "อันดับโทนมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับโทนเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "หลีกเลี่ยงโทน hard_push และคำโฆษณาเกินจริง",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Tone Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function toneFitLabLines(lab: ToneFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function toneFitLabToMarkdown(lab: ToneFitLab): string {
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
    `# Tone Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- โทนที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- hard_push: ${lab.counts.hardPushSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับโทนน้ำเสียง (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับโทนวันนี้)_"]),
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
