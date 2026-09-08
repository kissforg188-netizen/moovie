/**
 * Angle Fit Lab — soft ranking of selling-angle styles from logged metrics.
 * Suggests sincere help-choose angles (pain / compare / usage / time_save / friend);
 * never auto-rewrites captions or claims guaranteed income.
 * Complements Tone/Hook/CTA Fit Labs with content-angle learning
 * (มุมขายช่วยเลือกของ ไม่ขายแข็ง).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type AngleFitGrade = "A" | "B" | "C" | "D";
export type AngleStyleKind =
  | "pain"
  | "compare"
  | "usage"
  | "time_save"
  | "friend"
  | "flat";
export type AngleFitStatus = "hot" | "steady" | "cold" | "no_data";
export type AngleFitConfidence = "thin" | "ok" | "solid";

export const ANGLE_STYLE_ORDER: AngleStyleKind[] = [
  "pain",
  "compare",
  "usage",
  "time_save",
  "friend",
  "flat",
];

const BAND_STATUS_LABEL: Record<AngleFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<AngleFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<AngleStyleKind, string> = {
  pain: "มุมปัญหา",
  compare: "มุมเทียบเลือก",
  usage: "มุมใช้งานจริง",
  time_save: "มุมประหยัดเวลา",
  friend: "มุมเพื่อนแนะนำ",
  flat: "มุมไม่ชัด / กลาง ๆ",
};

const BAND_RANGE: Record<AngleStyleKind, string> = {
  pain: "เล่า pain สั้น ๆ แล้วค่อยโชว์ตัวเลือก",
  compare: "เทียบสเปก/ราคา/ของเดิมก่อนตัดสินใจ",
  usage: "โชว์ 1 สถานการณ์ใช้งานจริง + จุดที่ชอบ",
  time_save: "ลดขั้นตอน / ประหยัดเวลา โดยไม่โอเวอร์เคลม",
  friend: "น้ำเสียงคุยกัน แชร์ตัวเลือก ไม่เร่งกดซื้อ",
  flat: "ไม่มีสัญญาณมุมขายช่วยเลือกที่ชัด",
};

const STYLE_HINT: Record<AngleStyleKind, string> = {
  pain: "เปิดด้วยปัญหาที่คนดูเจอบ่อย 1 ข้อ แล้วชวนดูรายละเอียด — ไม่การันตีผล",
  compare: "ให้เทียบกับของเดิม 1 จุด (สเปก/ราคา) แล้วเปิดดูต่อเอง",
  usage: "โชว์สถานการณ์ประจำวันสั้น ๆ + จุดที่ชอบ 1 ข้อ ปิดด้วยลิงก์+disclosure",
  time_save: "บอกขั้นตอนที่ลดได้จริงโดยไม่โอเวอร์เคลม แล้วให้ดูรีวิวเพิ่ม",
  friend: "คุยแบบเพื่อนแนะนำตัวเลือก — ไม่เร่งซื้อ และใส่ disclosure",
  flat: "ใส่มุมปัญหา / เทียบเลือก / ใช้งานจริง ให้ชัดขึ้นก่อน Approve",
};

const PAIN_RE =
  /มุมปัญหา|เคยเจอไหม|ปัญหาคือ|เหนื่อย|ปวด|รำคาญ|ช่วยเรื่อง|ถ้ากำลังหา|pain/i;

const COMPARE_RE =
  /มุมเทียบ|เทียบเลือก|เทียบกับ|ของเดิม|ตัวเลือก|ราคาประมาณ|เปิดดูสเปก|อ่านรีวิว/i;

const USAGE_RE =
  /มุมใช้งาน|ใช้งานจริง|สถานการณ์|โชว์ของจริง|จุดที่ชอบ|คนใช้จริง|สาธิต|before.?after/i;

const TIME_SAVE_RE =
  /มุมประหยัดเวลา|ประหยัดเวลา|ลดขั้นตอน|ไม่ต้องซื้อแพง|ทำไมของชิ้นนี้ลด/i;

const FRIEND_RE =
  /มุมเพื่อน|เพื่อนแนะนำ|น้ำเสียงคุย|แชร์ตัวเลือก|ไม่เร่งกดซื้อ|คุยกัน|แนะนำเพื่อน/i;

export interface AngleFitRow {
  band: AngleStyleKind;
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
  status: AngleFitStatus;
  confidence: AngleFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface AngleFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: AngleStyleKind;
  currentLabel: string;
  suggestedBand: AngleStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface AngleFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface AngleFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: AngleFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    flatSamples: number;
  };
  bands: AngleFitRow[];
  mixTip: string;
  suggestions: AngleFitSuggestion[];
  actions: AngleFitAction[];
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

function resolveAngleText(
  pack: ContentPack | undefined,
  captionPreview?: string,
): string {
  const parts: string[] = [];
  if (pack?.sellingAngles?.length) {
    parts.push(pack.sellingAngles.join(" "));
  }
  if (captionPreview?.trim()) parts.push(captionPreview.trim());
  if (pack) {
    if (pack.facebookCaption) parts.push(pack.facebookCaption);
    if (pack.facebookGroupCaption) parts.push(pack.facebookGroupCaption);
    if (pack.reelsCaption) parts.push(pack.reelsCaption);
    const scriptLines = pack.tiktokScript?.scenes?.map((s) => s.line) ?? [];
    if (scriptLines.length) parts.push(scriptLines.join(" "));
    if (pack.hooks?.length) parts.push(pack.hooks.slice(0, 2).join(" "));
  }
  return parts.join("\n");
}

/**
 * Classify selling angle into a soft band.
 * Prefer pack sellingAngles cues; fall back to caption/script signals.
 */
export function classifyAngleStyle(text: string): AngleStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "flat";

  // Prefer the first matching pack angle label in order of appearance.
  const firstLabel = raw.match(
    /มุมปัญหา|มุมเทียบเลือก|มุมเทียบ|มุมใช้งานจริง|มุมใช้งาน|มุมประหยัดเวลา|มุมเพื่อนแนะนำ|มุมเพื่อน/,
  )?.[0];
  if (firstLabel) {
    if (firstLabel.includes("ปัญหา")) return "pain";
    if (firstLabel.includes("เทียบ")) return "compare";
    if (firstLabel.includes("ใช้งาน")) return "usage";
    if (firstLabel.includes("ประหยัด")) return "time_save";
    if (firstLabel.includes("เพื่อน")) return "friend";
  }

  const pain = PAIN_RE.test(raw);
  const compare = COMPARE_RE.test(raw);
  const usage = USAGE_RE.test(raw);
  const timeSave = TIME_SAVE_RE.test(raw);
  const friend = FRIEND_RE.test(raw);

  // Soft priority when mixed: pain → friend → usage → compare → time_save.
  if (pain && (friend || usage || compare || timeSave || raw.length >= 40))
    return "pain";
  if (pain) return "pain";
  if (friend && !compare) return "friend";
  if (usage && !compare) return "usage";
  if (compare) return "compare";
  if (timeSave) return "time_save";
  if (friend) return "friend";
  if (usage) return "usage";
  return "flat";
}

export function angleStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): AngleStyleKind {
  return classifyAngleStyle(resolveAngleText(pack, post.captionPreview));
}

export function angleStyleLabel(band: AngleStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): AngleFitConfidence {
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
  band: AngleStyleKind;
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

  // Soft nudge toward help-choose angles.
  if (params.band === "pain") score += 5;
  else if (params.band === "friend") score += 4;
  else if (params.band === "usage") score += 4;
  else if (params.band === "compare") score += 3;
  else if (params.band === "time_save") score += 3;
  else if (params.band === "flat") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): AngleFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<AngleFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลมุมนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "flat") {
    return `มุมไม่ชัด — ใส่ selling angle ให้ชัด (ปัญหา/เทียบ/ใช้งาน) แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `มุมนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในมุมนี้ — ลองปรับมุมขายหรือ regenerate แคปชันก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้มุมนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจาย pain/compare/usage เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในมุมนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): AngleFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Angle Fit Lab from manually logged post metrics + selling angles.
 */
export function buildAngleFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): AngleFitLab {
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

  const byBand = new Map<AngleStyleKind, ScheduledPost[]>();
  for (const band of ANGLE_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = angleStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: AngleFitRow[] = ANGLE_STYLE_ORDER.map((band) => {
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
    const row: Omit<AngleFitRow, "tip"> = {
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
  const flatSamples = byBand.get("flat")?.length ?? 0;
  const topShare = Math.max(0, ...bands.map((b) => b.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((b) => b.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  if (flatSamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find((b) => b.status === "hot" && b.band !== "flat") ??
    withData.find((b) => b.band !== "flat") ??
    withData[0];
  const cold = withData.filter(
    (b) => b.status === "cold" || b.band === "flat",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายมุมขาย — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์มุม"
      : flatSamples > 0 && flatSamples >= Math.ceil(posted.length / 2)
        ? `พบมุม flat ${flatSamples} ชิ้น — ใส่ sellingAngles ให้ชัด (ปัญหา/เทียบ/ใช้งาน) ก่อน Approve (ทดลอง)`
        : unbalanced && best
          ? `มิกซ์เอนไปมุม ${best.bandLabel} มาก — วันถัดไปลองสลับมุมขาย 1 ชิ้น (ทดลอง)`
          : best
            ? `มุมเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
            : "เก็บผลต่ออีก 2–3 โพสต์ข้ามุมก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: AngleFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot" && b.band !== "flat") ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "flat",
    ) ??
    bands.find((b) => b.band === "pain");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = angleStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
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
            b.band !== "flat" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find((b) => b.band === "usage" || b.band === "compare") ??
        cold.find((b) => b.band !== "flat");
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

  const actions: AngleFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายมุมขาย",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมุม",
    });
  }
  if (flatSamples > 0) {
    actions.push({
      id: "clarify-flat",
      title: "ทำให้มุมขายชัดขึ้น",
      detail: `พบ ${flatSamples} โพสต์มุมไม่ชัด — ใส่ sellingAngles (ปัญหา/เทียบ/ใช้งาน) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "flat") {
    actions.push({
      id: "lean-angle",
      title: `เอียงทดลองไปมุม ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์มุมขาย",
      detail:
        "มุมเด่นกินสัดส่วนสูง — เพิ่ม draft คนละมุม 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "flat").length > 0) {
    const coldSoft = cold.filter((b) => b.band !== "flat");
    actions.push({
      id: "review-cold",
      title: `ทบทวนมุมเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับมุมขาย / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = ANGLE_STYLE_ORDER.filter(
    (b) => b !== "flat" && (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองมุมที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อมุมแล้ววัดผล`,
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
      ? "Angle Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมุมขาย"
      : `Angle Fit Lab: ${posted.length} โพสต์มีเมตริก · มุมที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          flatSamples > 0 ? ` · flat ${flatSamples}` : ""
        }${unbalanced ? " · มิกซ์เอนข้างเดียว" : ""}`;

  const checklist = [
    "อันดับมุมขายมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับมุมเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "หลีกเลี่ยงมุมไม่ชัดและคำโฆษณาเกินจริง",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Angle Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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
      flatSamples,
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

export function angleFitLabLines(lab: AngleFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function angleFitLabToMarkdown(lab: AngleFitLab): string {
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
    `# Angle Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- มุมที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- flat: ${lab.counts.flatSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับมุมขาย (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับมุมวันนี้)_"]),
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
