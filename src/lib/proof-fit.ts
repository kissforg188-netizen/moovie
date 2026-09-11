/**
 * Proof Fit Lab — soft ranking of social-proof / credibility framing from logged metrics.
 * Suggests sincere help-choose proof styles (used_real / compare_help / spec_point /
 * situation / soft_popular); never auto-rewrites captions or claims guaranteed income.
 * Complements Tone + Angle + Script Fit Labs with “ควรใช้หลักฐานแบบไหน”
 * (ช่วยเลือกของ ไม่ขายแข็ง ไม่หลอก).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type ProofFitGrade = "A" | "B" | "C" | "D";
export type ProofStyleKind =
  | "used_real"
  | "compare_help"
  | "spec_point"
  | "situation"
  | "soft_popular"
  | "none";
export type ProofFitStatus = "hot" | "steady" | "cold" | "no_data";
export type ProofFitConfidence = "thin" | "ok" | "solid";

export const PROOF_STYLE_ORDER: ProofStyleKind[] = [
  "used_real",
  "compare_help",
  "spec_point",
  "situation",
  "soft_popular",
  "none",
];

const BAND_STATUS_LABEL: Record<ProofFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<ProofFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<ProofStyleKind, string> = {
  used_real: "หลักฐานใช้จริง / ลองเอง",
  compare_help: "หลักฐานเทียบตัวเลือก",
  spec_point: "หลักฐานชี้สเปก 1 ข้อ",
  situation: "หลักฐานสถานการณ์ปัญหา",
  soft_popular: "หลักฐานคนถามบ่อย (เบา)",
  none: "ไม่มีสัญญาณหลักฐาน",
};

const BAND_RANGE: Record<ProofStyleKind, string> = {
  used_real: "บอกว่าลองใช้ / ใช้จริงสั้น ๆ ไม่โอเวอร์เคลมผล",
  compare_help: "เทียบตัวเลือก 1–2 ข้อแบบช่วยตัดสินใจ",
  spec_point: "ชี้จุดสเปกหรือจุดที่ชอบ 1 ข้อชัด",
  situation: "เล่าสถานการณ์ pain จริงสั้น ๆ แล้วแชร์ตัวเลือก",
  soft_popular: "คนถามบ่อย / น่าลองดู — ไม่เคลมยอดขายมหาศาล",
  none: "ไม่มีสัญญาณหลักฐานหรือ credibility ในแคปชัน/สคริปต์",
};

const STYLE_HINT: Record<ProofStyleKind, string> = {
  used_real: "บอกสั้น ๆ ว่าลองใช้แล้วชอบจุดไหน 1 ข้อ + disclosure",
  compare_help: "เทียบของเดิม/ตัวเลือกอื่นเบา ๆ แล้วให้ดูสเปกต่อเอง",
  spec_point: "ชี้สเปกหรือจุดขาย 1 ข้อ ไม่ยัดยาว",
  situation: "เปิดด้วยสถานการณ์ปัญหา → แชร์ตัวเลือก ไม่เร่งซื้อ",
  soft_popular: "คนถามบ่อย / น่าลอง — ห้ามเคลมปังแน่นอนหรือยอดขายเท็จ",
  none: "ใส่ป้ายหลักฐาน (ใช้จริง / เทียบเลือก / สเปก / สถานการณ์) ให้ชัดก่อน Approve",
};

const USED_REAL_RE =
  /หลักฐานใช้จริง|ใช้จริง|ลองใช้|ลองเอง|ของที่ได้ลอง|used.?real|tried it|i tried|ลองมาแล้ว/i;

const COMPARE_HELP_RE =
  /หลักฐานเทียบ|เทียบตัวเลือก|เทียบของ|เทียบสเปก|compare|ช่วยเลือก|ช่วยตัดสินใจ|ของเดิม/i;

const SPEC_POINT_RE =
  /หลักฐานสเปก|ชี้สเปก|จุดที่ชอบ|จุดขาย|สเปกชัด|spec.?point|รายละเอียดสำคัญ/i;

const SITUATION_RE =
  /หลักฐานสถานการณ์|สถานการณ์|เคยเจอไหม|ปัญหาคือ|วันหนึ่ง|situation|pain.?scene/i;

const SOFT_POPULAR_RE =
  /หลักฐานยอดนิยม|คนถามบ่อย|น่าลองดู|หลายคนสนใจ|soft.?popular|popular.?soft|ยอดนิยมเบา/i;

export interface ProofFitRow {
  band: ProofStyleKind;
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
  status: ProofFitStatus;
  confidence: ProofFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface ProofFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: ProofStyleKind;
  currentLabel: string;
  suggestedBand: ProofStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface ProofFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface ProofFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: ProofFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
    noneSamples: number;
  };
  bands: ProofFitRow[];
  mixTip: string;
  suggestions: ProofFitSuggestion[];
  actions: ProofFitAction[];
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

function resolveProofText(
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
 * Classify social-proof / credibility framing into a soft band.
 * Prefer explicit “หลักฐาน…” labels; fall back to caption cues.
 */
export function classifyProofStyle(text: string): ProofStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "none";

  const firstLabel = raw.match(
    /หลักฐานใช้จริง|หลักฐานเทียบ(?:ตัวเลือก|เลือก)?|หลักฐานสเปก|หลักฐานสถานการณ์|หลักฐานยอดนิยม(?:เบา)?/i,
  )?.[0];
  if (firstLabel) {
    const label = firstLabel.toLowerCase();
    if (label.includes("ใช้จริง")) return "used_real";
    if (label.includes("เทียบ")) return "compare_help";
    if (label.includes("สเปก")) return "spec_point";
    if (label.includes("สถานการณ์")) return "situation";
    if (label.includes("ยอดนิยม")) return "soft_popular";
  }

  const used = USED_REAL_RE.test(raw);
  const compare = COMPARE_HELP_RE.test(raw);
  const spec = SPEC_POINT_RE.test(raw);
  const situation = SITUATION_RE.test(raw);
  const popular = SOFT_POPULAR_RE.test(raw);

  // Soft priority when mixed: used_real → compare_help → situation → spec → soft_popular.
  if (used) return "used_real";
  if (compare) return "compare_help";
  if (situation) return "situation";
  if (spec) return "spec_point";
  if (popular) return "soft_popular";
  return "none";
}

export function proofStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): ProofStyleKind {
  return classifyProofStyle(resolveProofText(pack, post.captionPreview));
}

export function proofStyleLabel(band: ProofStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): ProofFitConfidence {
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
  band: ProofStyleKind;
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

  // Soft nudge toward sincere help-choose proof.
  if (params.band === "used_real") score += 5;
  else if (params.band === "compare_help") score += 4;
  else if (params.band === "situation") score += 4;
  else if (params.band === "spec_point") score += 3;
  else if (params.band === "soft_popular") score += 2;
  else if (params.band === "none") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): ProofFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<ProofFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลหลักฐานนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "none") {
    return `ไม่มีสัญญาณหลักฐาน — ใส่ป้ายหลักฐานให้ชัด แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `หลักฐานนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในหลักฐานนี้ — ลองปรับมุมหลักฐานหรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้หลักฐานนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายใช้จริง/เทียบเลือก/สถานการณ์ เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในหลักฐานนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): ProofFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Proof Fit Lab from manually logged post metrics + captions/scripts.
 */
export function buildProofFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): ProofFitLab {
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

  const byBand = new Map<ProofStyleKind, ScheduledPost[]>();
  for (const band of PROOF_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = proofStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: ProofFitRow[] = PROOF_STYLE_ORDER.map((band) => {
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
    const row: Omit<ProofFitRow, "tip"> = {
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
  if (noneSamples > 0) labScore = Math.max(0, labScore - 4);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best =
    withData.find((b) => b.status === "hot" && b.band !== "none") ??
    withData.find((b) => b.band !== "none") ??
    withData[0];
  const cold = withData.filter(
    (b) => b.status === "cold" || b.band === "none",
  );

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกรายหลักฐาน — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์หลักฐาน"
      : noneSamples > 0 && noneSamples >= Math.ceil(posted.length / 2)
        ? `พบหลักฐาน none ${noneSamples} ชิ้น — ใส่ป้ายหลักฐานให้ชัดก่อน Approve (ทดลอง)`
        : unbalanced && best
          ? `มิกซ์เอนไปหลักฐาน ${best.bandLabel} มาก — วันถัดไปลองสลับหลักฐาน 1 ชิ้น (ทดลอง)`
          : best
            ? `หลักฐานเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
            : "เก็บผลต่ออีก 2–3 โพสต์ข้ามหลักฐานก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: ProofFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot" && b.band !== "none") ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "none",
    ) ??
    bands.find((b) => b.band === "used_real");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = proofStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = (slot.captionPreview ?? "").slice(0, 80);

    const currentCold =
      currentKey === "none" ||
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
            (b.status === "steady" || b.status === "no_data"),
        ) ??
        bands.find((b) => b.band === "compare_help" || b.band === "situation") ??
        cold.find((b) => b.band !== "none");
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
        reason: `วันนี้ซ้อนหลักฐาน ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: ProofFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายหลักฐาน",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อหลักฐาน",
    });
  }
  if (noneSamples > 0) {
    actions.push({
      id: "clarify-none",
      title: "ทำให้หลักฐานชัดขึ้น",
      detail: `พบ ${noneSamples} โพสต์ไม่มีสัญญาณหลักฐาน — ใส่ป้าย (ใช้จริง/เทียบเลือก/สเปก/สถานการณ์) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "none") {
    actions.push({
      id: "lean-proof",
      title: `เอียงไปหลักฐาน ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์หลักฐาน",
      detail:
        "หลักฐานเด่นกินสัดส่วนสูง — เพิ่ม draft คนละหลักฐาน 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "none").length > 0) {
    const coldSoft = cold.filter((b) => b.band !== "none");
    actions.push({
      id: "review-cold",
      title: `ทบทวนหลักฐานเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับมุมหลักฐาน / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = PROOF_STYLE_ORDER.filter(
    (b) => b !== "none" && (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองหลักฐานที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อหลักฐานแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่หลอกลวง",
    detail:
      "ห้ามเคลมรีวิวปลอม/ยอดขายเท็จ — ทุกแคปชันต้องมี disclosure และผ่าน Approve ก่อนโพสต์มือ",
  });

  const summary =
    posted.length === 0
      ? "Proof Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับหลักฐาน"
      : `Proof Fit Lab: ${posted.length} โพสต์มีเมตริก · หลักฐานที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          noneSamples > 0 ? ` · none ${noneSamples}` : ""
        }${unbalanced ? " · มิกซ์เอนข้างเดียว" : ""}`;

  const checklist = [
    "อันดับหลักฐานมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับหลักฐานเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "ห้ามใช้รีวิวปลอม คำโฆษณาเกินจริง หรือยอดขายเท็จ",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Proof Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function proofFitLabLines(lab: ProofFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function proofFitLabToMarkdown(lab: ProofFitLab): string {
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
    `# Proof Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- หลักฐานที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- none: ${lab.counts.noneSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับหลักฐาน / social proof (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับหลักฐานวันนี้)_"]),
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
