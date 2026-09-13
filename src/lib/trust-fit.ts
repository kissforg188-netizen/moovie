/**
 * Trust Fit Lab — soft ranking of trust / sincerity cues from logged metrics.
 * Suggests honest help-choose trust styles (honest_limit / soft_choose /
 * disclose_first / try_check); flags hard_hype; never auto-rewrites captions
 * or claims guaranteed income. Complements Benefit Fit + Offer Fit Labs with
 * “ควรสร้างความเชื่อถือแบบไหน” (เปิดเผย · ช่วยเลือก · ไม่ขายแข็ง).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type TrustFitGrade = "A" | "B" | "C" | "D";
export type TrustStyleKind =
  | "honest_limit"
  | "soft_choose"
  | "disclose_first"
  | "try_check"
  | "hard_hype"
  | "none";
export type TrustFitStatus = "hot" | "steady" | "cold" | "no_data";
export type TrustFitConfidence = "thin" | "ok" | "solid";

export const TRUST_STYLE_ORDER: TrustStyleKind[] = [
  "honest_limit",
  "soft_choose",
  "disclose_first",
  "try_check",
  "hard_hype",
  "none",
];

const BAND_STATUS_LABEL: Record<TrustFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<TrustFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<TrustStyleKind, string> = {
  honest_limit: "ความเชื่อถือจำกัด",
  soft_choose: "ความเชื่อถือช่วยเลือก",
  disclose_first: "ความเชื่อถือเปิดเผย",
  try_check: "ความเชื่อถือตรวจก่อน",
  hard_hype: "ความเชื่อถือขายแข็ง",
  none: "ไม่มีสัญญาณความเชื่อถือ",
};

const BAND_RANGE: Record<TrustStyleKind, string> = {
  honest_limit: "เปิดข้อจำกัด / ไม่การันตีผลทุกคน / ไม่โอเวอร์เคลม",
  soft_choose: "แชร์ตัวเลือก ช่วยเลือกของ ไม่เร่งกดซื้อ",
  disclose_first: "disclosure / ลิงก์ affiliate ชัดตั้งแต่ต้น",
  try_check: "ชวนตรวจราคา รีวิว สเปกก่อนตัดสินใจ",
  hard_hype: "เร่งซื้อ / ของหมด / เคลมเกิน — ไม่แนะนำ",
  none: "ไม่มีสัญญาณความเชื่อถือหรือความจริงใจในแคปชัน",
};

const STYLE_HINT: Record<TrustStyleKind, string> = {
  honest_limit: "บอกข้อจำกัด 1 ข้อ + ไม่การันตีผล + disclosure",
  soft_choose: "แชร์ตัวเลือกเบา ๆ ให้เทียบเอง ก่อนปิดด้วยลิงก์",
  disclose_first: "ใส่ disclosure ใกล้ต้นแคปชัน + บอกเป็นลิงก์ affiliate",
  try_check: "ชวนดูรีวิว/ราคา/สเปกก่อน แล้วค่อยตัดสินใจ",
  hard_hype: "หลีกเลี่ยง — regenerate เป็นมุมความเชื่อถือแบบช่วยเลือกของ",
  none: "ใส่ป้ายความเชื่อถือ (จำกัด / ช่วยเลือก / เปิดเผย / ตรวจก่อน) ให้ชัดก่อน Approve",
};

const HONEST_LIMIT_RE =
  /ความเชื่อถือจำกัด|ไม่การันตี|ไม่โอเวอร์เคลม|ไม่รับประกัน|ข้อจำกัด|honest.?limit|ไม่เหมาะทุกคน/i;

const SOFT_CHOOSE_RE =
  /ความเชื่อถือช่วยเลือก|ช่วยเลือกของ|แชร์ตัวเลือก|soft.?choose|ไม่เร่งซื้อ|ช่วยกันเลือก/i;

const DISCLOSE_FIRST_RE =
  /ความเชื่อถือเปิดเผย|disclose.?first|ลิงก์นี้เป็นลิงก์ affiliate|ผู้เขียนอาจได้รับค่าคอม|affiliate disclosure|disclosure/i;

const TRY_CHECK_RE =
  /ความเชื่อถือตรวจก่อน|try.?check|ตรวจราคาก่อน|ดูรีวิวก่อน|ดูสเปก|เทียบรีวิว|ตรวจสเปก/i;

const HARD_HYPE_RE =
  /ความเชื่อถือขายแข็ง|hard.?hype|กดเลยตอนนี้|ของหมดแล้ว|รีบกด|ต้องซื้อ|รับประกันรายได้|รวยแน่|ไม่ซื้อคือพลาด|สุดยอดแน่นอน|100\s*%/i;

export interface TrustFitRow {
  band: TrustStyleKind;
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
  status: TrustFitStatus;
  confidence: TrustFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface TrustFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: TrustStyleKind;
  currentLabel: string;
  suggestedBand: TrustStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface TrustFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface TrustFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: TrustFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    hardHypeSamples: number;
    noneSamples: number;
  };
  bands: TrustFitRow[];
  mixTip: string;
  suggestions: TrustFitSuggestion[];
  actions: TrustFitAction[];
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

function resolveTrustText(
  pack: ContentPack | undefined,
  captionPreview?: string,
): string {
  const parts: string[] = [];
  if (captionPreview?.trim()) parts.push(captionPreview.trim());
  if (pack?.facebookCaption) parts.push(pack.facebookCaption);
  if (pack?.facebookGroupCaption) parts.push(pack.facebookGroupCaption);
  if (pack?.reelsCaption) parts.push(pack.reelsCaption);
  if (pack?.disclosure) parts.push(pack.disclosure);
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
 * Classify trust framing into a soft band.
 * Prefer explicit “ความเชื่อถือ…” labels; hard_hype wins when detected; else soft cues.
 */
export function classifyTrustStyle(text: string): TrustStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "none";

  // Compliance-first: hard hype overrides soft labels.
  if (HARD_HYPE_RE.test(raw)) return "hard_hype";

  const firstLabel = raw.match(
    /ความเชื่อถือจำกัด|ความเชื่อถือช่วยเลือก|ความเชื่อถือเปิดเผย|ความเชื่อถือตรวจก่อน|ความเชื่อถือขายแข็ง/i,
  )?.[0];
  if (firstLabel) {
    const label = firstLabel.toLowerCase();
    if (label.includes("จำกัด")) return "honest_limit";
    if (label.includes("ช่วยเลือก")) return "soft_choose";
    if (label.includes("เปิดเผย")) return "disclose_first";
    if (label.includes("ตรวจก่อน")) return "try_check";
    if (label.includes("ขายแข็ง")) return "hard_hype";
  }

  const honest = HONEST_LIMIT_RE.test(raw);
  const soft = SOFT_CHOOSE_RE.test(raw);
  const disclose = DISCLOSE_FIRST_RE.test(raw);
  const tryCheck = TRY_CHECK_RE.test(raw);

  // Soft priority when mixed: honest_limit → soft_choose → disclose_first → try_check.
  if (honest) return "honest_limit";
  if (soft) return "soft_choose";
  if (disclose) return "disclose_first";
  if (tryCheck) return "try_check";
  return "none";
}

export function trustStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): TrustStyleKind {
  return classifyTrustStyle(resolveTrustText(pack, post.captionPreview));
}

export function trustStyleLabel(band: TrustStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): TrustFitConfidence {
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
  band: TrustStyleKind;
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

  // Soft nudge toward sincere trust framing.
  if (params.band === "honest_limit") score += 5;
  else if (params.band === "soft_choose") score += 5;
  else if (params.band === "disclose_first") score += 4;
  else if (params.band === "try_check") score += 4;
  else if (params.band === "hard_hype") score -= 18;
  else if (params.band === "none") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): TrustFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<TrustFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลมุมความเชื่อถือนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "hard_hype") {
    return `มุมขายแข็ง — หลีกเลี่ยง regenerate เป็นความเชื่อถือแบบช่วยเลือกของก่อน Approve`;
  }
  if (row.band === "none") {
    return `ไม่มีสัญญาณความเชื่อถือ — ใส่ป้ายความเชื่อถือให้ชัด แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `มุมความเชื่อถือนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในมุมความเชื่อถือนี้ — ลองปรับกรอบความจริงใจหรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้มุมความเชื่อถือนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายจำกัด/ช่วยเลือก/เปิดเผย/ตรวจก่อน เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในมุมความเชื่อถือนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): TrustFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Trust Fit Lab from manually logged post metrics + captions/scripts.
 */
export function buildTrustFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): TrustFitLab {
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

  const byBand = new Map<TrustStyleKind, ScheduledPost[]>();
  for (const band of TRUST_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = trustStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: TrustFitRow[] = TRUST_STYLE_ORDER.map((band) => {
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
    const row: Omit<TrustFitRow, "tip"> = {
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
  const hardHypeSamples = byBand.get("hard_hype")?.length ?? 0;
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
  if (hardHypeSamples > 0) labScore = Math.max(0, labScore - 10);
  if (noneSamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hard_hype",
    ) ??
    withData.find((b) => b.band !== "none" && b.band !== "hard_hype") ??
    withData[0];
  const cold = withData.filter(
    (b) =>
      b.status === "cold" || b.band === "none" || b.band === "hard_hype",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายมุมความเชื่อถือ — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์ความเชื่อถือ"
      : hardHypeSamples > 0
        ? `พบความเชื่อถือขายแข็ง ${hardHypeSamples} ชิ้น — regenerate เป็นมุมช่วยเลือกของก่อน Approve (ทดลอง)`
        : noneSamples > 0 && noneSamples >= Math.ceil(posted.length / 2)
          ? `พบความเชื่อถือ none ${noneSamples} ชิ้น — ใส่ป้ายความเชื่อถือให้ชัดก่อน Approve (ทดลอง)`
          : unbalanced && best
            ? `มิกซ์เอนไปมุม ${best.bandLabel} มาก — วันถัดไปลองสลับมุมความเชื่อถือ 1 ชิ้น (ทดลอง)`
            : best
              ? `มุมความเชื่อถือเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
              : "เก็บผลต่ออีก 2–3 โพสต์ข้ามมุมความเชื่อถือก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: TrustFitSuggestion[] = [];
  const preferred =
    bands.find(
      (b) =>
        b.status === "hot" && b.band !== "none" && b.band !== "hard_hype",
    ) ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "none" &&
        b.band !== "hard_hype",
    ) ??
    bands.find((b) => b.band === "honest_limit");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = trustStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "none" ||
      currentKey === "hard_hype" ||
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
            b.band !== "hard_hype" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find(
          (b) => b.band === "soft_choose" || b.band === "try_check",
        ) ??
        cold.find((b) => b.band !== "none" && b.band !== "hard_hype");
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

  const actions: TrustFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายมุมความเชื่อถือ",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมุมความเชื่อถือ",
    });
  }
  if (hardHypeSamples > 0) {
    actions.push({
      id: "drop-hard-hype",
      title: "เลิกมุมขายแข็ง / เร่งซื้อ",
      detail: `พบ ${hardHypeSamples} โพสต์แนวขายแข็ง — regenerate เป็นความเชื่อถือแบบช่วยเลือกของก่อน Approve`,
    });
  }
  if (noneSamples > 0) {
    actions.push({
      id: "clarify-none",
      title: "ทำให้มุมความเชื่อถือชัดขึ้น",
      detail: `พบ ${noneSamples} โพสต์ไม่มีสัญญาณความเชื่อถือ — ใส่ป้าย (จำกัด/ช่วยเลือก/เปิดเผย/ตรวจก่อน) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (
    best &&
    best.status === "hot" &&
    best.band !== "none" &&
    best.band !== "hard_hype"
  ) {
    actions.push({
      id: "lean-trust",
      title: `เอียงไปมุม ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์มุมความเชื่อถือ",
      detail:
        "มุมความเชื่อถือเด่นกินสัดส่วนสูง — เพิ่ม draft คนละมุม 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "none" && b.band !== "hard_hype").length > 0) {
    const coldSoft = cold.filter(
      (b) => b.band !== "none" && b.band !== "hard_hype",
    );
    actions.push({
      id: "review-cold",
      title: `ทบทวนมุมเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับกรอบความจริงใจ / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = TRUST_STYLE_ORDER.filter(
    (b) =>
      b !== "none" &&
      b !== "hard_hype" &&
      (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองมุมความเชื่อถือที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อมุมแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่หลอกลวง",
    detail:
      "ห้ามเร่งซื้อ/ของหมด/รับประกันรายได้ — ทุกแคปชันต้องมี disclosure และผ่าน Approve ก่อนโพสต์มือ",
  });

  const summary =
    posted.length === 0
      ? "Trust Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมุมความเชื่อถือ"
      : `Trust Fit Lab: ${posted.length} โพสต์มีเมตริก · มุมที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          hardHypeSamples > 0 ? ` · ขายแข็ง ${hardHypeSamples}` : ""
        }${noneSamples > 0 ? ` · none ${noneSamples}` : ""}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับมุมความเชื่อถือมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับมุมความเชื่อถือเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "ห้ามใช้คำเร่งซื้อ / ของหมด / รับประกันรายได้แบบหลอกลวง",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Trust Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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
      hardHypeSamples,
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

export function trustFitLabLines(lab: TrustFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function trustFitLabToMarkdown(lab: TrustFitLab): string {
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
    `# Trust Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- มุมที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- ขายแข็ง: ${lab.counts.hardHypeSamples}`,
    `- none: ${lab.counts.noneSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับมุมความเชื่อถือ (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับมุมความเชื่อถือวันนี้)_"]),
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
