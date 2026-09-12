/**
 * Script Fit Lab — soft ranking of short-video script structures from logged metrics.
 * Suggests sincere 15–30s structures (problem_demo / howto / before_after / unbox / pov);
 * never auto-rewrites scripts or claims guaranteed income.
 * Complements Video Ease + Angle Fit Labs with “ควรทำวิดีโอแบบไหนก่อน”
 * (โครงคลิปช่วยเลือกของ ไม่ขายแข็ง).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type ScriptFitGrade = "A" | "B" | "C" | "D";
export type ScriptStyleKind =
  | "problem_demo"
  | "howto"
  | "before_after"
  | "unbox"
  | "pov"
  | "flat";
export type ScriptFitStatus = "hot" | "steady" | "cold" | "no_data";
export type ScriptFitConfidence = "thin" | "ok" | "solid";

export const SCRIPT_STYLE_ORDER: ScriptStyleKind[] = [
  "problem_demo",
  "howto",
  "before_after",
  "unbox",
  "pov",
  "flat",
];

const BAND_STATUS_LABEL: Record<ScriptFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<ScriptFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<ScriptStyleKind, string> = {
  problem_demo: "โครงปัญหา→สาธิต",
  howto: "โครงวิธีใช้ทีละขั้น",
  before_after: "โครงก่อน–หลัง",
  unbox: "โครงแกะกล่อง",
  pov: "โครง POV / วันหนึ่ง",
  flat: "โครงไม่ชัด / กลาง ๆ",
};

const BAND_RANGE: Record<ScriptStyleKind, string> = {
  problem_demo: "เปิด pain สั้น → โชว์ของ → สาธิต 1 จุด → CTA+disclosure",
  howto: "บอกขั้นตอน 2–3 ก้าวแบบช่วยใช้ ไม่เร่งซื้อ",
  before_after: "โชว์ก่อน/หลังแบบเบา ๆ ไม่โอเวอร์เคลมผลลัพธ์",
  unbox: "เปิดกล่อง + จุดที่ชอบ 1 ข้อ + ลิงก์ดูรายละเอียด",
  pov: "ตามไปดูสถานการณ์จริงสั้น ๆ แล้วแชร์ตัวเลือก",
  flat: "ไม่มีสัญญาณโครงสคริปต์วิดีโอสั้นที่ชัด",
};

const STYLE_HINT: Record<ScriptStyleKind, string> = {
  problem_demo:
    "0–3วิ pain → 3–15วิ โชว์+สาธิต → ปิดด้วยลิงก์+disclosure (ไม่การันตีผล)",
  howto: "บอก 2–3 ขั้นตอนใช้งานจริง แล้วให้ดูสเปกต่อเอง",
  before_after: "ก่อน–หลังเบา ๆ 1 จุด — ไม่เคลมหายขาด/ปังแน่นอน",
  unbox: "แกะกล่องสั้น + จุดที่ชอบ 1 ข้อ + CTA อ่อน",
  pov: "ตามไปดู 1 สถานการณ์ในวัน → แชร์ตัวเลือก ไม่เร่งกดซื้อ",
  flat: "ใส่ป้ายโครงสคริปต์ (ปัญหา→สาธิต / วิธีใช้ / ก่อน–หลัง) ให้ชัดก่อน Approve",
};

const PROBLEM_DEMO_RE =
  /โครงปัญหา|ปัญหา→สาธิต|ปัญหาคือ|โชว์ปัญหา|เคยเจอไหม|pain.?demo|problem.?demo/i;

const HOWTO_RE =
  /โครงวิธีใช้|วิธีใช้ทีละขั้น|ทีละขั้น|ขั้นตอน|how.?to|สอนใช้|ทำตามนี้|ก้าวที่/i;

const BEFORE_AFTER_RE =
  /โครงก่อน.?หลัง|before.?after|ก่อนใช้|หลังใช้|ก่อน–หลัง|ก่อนหลัง/i;

const UNBOX_RE =
  /โครงแกะกล่อง|แกะกล่อง|unbox|เปิดกล่อง|ของมาถึง|first look|unboxing/i;

const POV_RE =
  /โครง\s*POV|POV|วันหนึ่งของ|ตามไปดู|ในชีวิตประจำวัน|day in the life/i;

export interface ScriptFitRow {
  band: ScriptStyleKind;
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
  status: ScriptFitStatus;
  confidence: ScriptFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface ScriptFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: ScriptStyleKind;
  currentLabel: string;
  suggestedBand: ScriptStyleKind;
  suggestedLabel: string;
  captionPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface ScriptFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface ScriptFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: ScriptFitGrade;
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
  bands: ScriptFitRow[];
  mixTip: string;
  suggestions: ScriptFitSuggestion[];
  actions: ScriptFitAction[];
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

function resolveScriptText(
  pack: ContentPack | undefined,
  captionPreview?: string,
): string {
  const parts: string[] = [];
  if (pack?.tiktokScript) {
    const scenes = pack.tiktokScript.scenes ?? [];
    for (const s of scenes) {
      if (s.line) parts.push(s.line);
      if (s.visual) parts.push(s.visual);
      if (s.time) parts.push(s.time);
    }
    if (pack.tiktokScript.voiceover) parts.push(pack.tiktokScript.voiceover);
  }
  if (pack?.videoPriorityNote) parts.push(pack.videoPriorityNote);
  if (pack?.filmingChecklist?.length) {
    parts.push(pack.filmingChecklist.join(" "));
  }
  if (captionPreview?.trim()) parts.push(captionPreview.trim());
  if (pack?.reelsCaption) parts.push(pack.reelsCaption);
  if (pack?.hooks?.length) parts.push(pack.hooks.slice(0, 2).join(" "));
  return parts.join("\n");
}

/**
 * Classify short-video script structure into a soft band.
 * Prefer explicit “โครง…” labels; fall back to scene/voiceover cues.
 */
export function classifyScriptStyle(text: string): ScriptStyleKind {
  const raw = text?.trim() ?? "";
  if (!raw) return "flat";

  const firstLabel = raw.match(
    /โครงปัญหา→สาธิต|โครงปัญหา.?สาธิต|โครงปัญหา|โครงวิธีใช้ทีละขั้น|โครงวิธีใช้|โครงก่อน–หลัง|โครงก่อน.?หลัง|โครงแกะกล่อง|โครง\s*POV|โครงPOV/i,
  )?.[0];
  if (firstLabel) {
    const label = firstLabel.toLowerCase();
    if (label.includes("ปัญหา")) return "problem_demo";
    if (label.includes("วิธีใช้")) return "howto";
    if (label.includes("ก่อน")) return "before_after";
    if (label.includes("แกะ")) return "unbox";
    if (label.includes("pov")) return "pov";
  }

  const problem = PROBLEM_DEMO_RE.test(raw);
  const howto = HOWTO_RE.test(raw);
  const beforeAfter = BEFORE_AFTER_RE.test(raw);
  const unbox = UNBOX_RE.test(raw);
  const pov = POV_RE.test(raw);

  // Soft priority when mixed: problem_demo → howto → before_after → unbox → pov.
  if (problem && (howto || beforeAfter || unbox || pov || raw.length >= 40)) {
    return "problem_demo";
  }
  if (problem) return "problem_demo";
  if (howto && !beforeAfter) return "howto";
  if (beforeAfter) return "before_after";
  if (unbox) return "unbox";
  if (pov) return "pov";
  if (howto) return "howto";
  return "flat";
}

export function scriptStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): ScriptStyleKind {
  return classifyScriptStyle(resolveScriptText(pack, post.captionPreview));
}

export function scriptStyleLabel(band: ScriptStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): ScriptFitConfidence {
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
  band: ScriptStyleKind;
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

  // Soft nudge toward help-choose short-video structures.
  if (params.band === "problem_demo") score += 5;
  else if (params.band === "howto") score += 4;
  else if (params.band === "before_after") score += 3;
  else if (params.band === "unbox") score += 3;
  else if (params.band === "pov") score += 3;
  else if (params.band === "flat") score -= 6;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): ScriptFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<ScriptFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลโครงนี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.band === "flat") {
    return `โครงไม่ชัด — ใส่ป้ายโครงสคริปต์ให้ชัด แล้ว regenerate ก่อน Approve`;
  }
  if (row.status === "hot") {
    return `โครงนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ถ่ายก่อนได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในโครงนี้ — ลองปรับโครงสคริปต์หรือ regenerate ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้โครงนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายปัญหา→สาธิต/วิธีใช้/ก่อน–หลัง เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในโครงนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): ScriptFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Script Fit Lab from manually logged post metrics + short-video scripts.
 */
export function buildScriptFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): ScriptFitLab {
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

  const byBand = new Map<ScriptStyleKind, ScheduledPost[]>();
  for (const band of SCRIPT_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = scriptStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: ScriptFitRow[] = SCRIPT_STYLE_ORDER.map((band) => {
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
    const row: Omit<ScriptFitRow, "tip"> = {
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
      ? "ยังไม่มีเมตริกรายโครงสคริปต์ — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์โครงคลิป"
      : flatSamples > 0 && flatSamples >= Math.ceil(posted.length / 2)
        ? `พบโครง flat ${flatSamples} ชิ้น — ใส่ป้ายโครงสคริปต์ให้ชัดก่อน Approve (ทดลอง)`
        : unbalanced && best
          ? `มิกซ์เอนไปโครง ${best.bandLabel} มาก — วันถัดไปลองสลับโครงคลิป 1 ชิ้น (ทดลอง)`
          : best
            ? `โครงเด่น: ${best.bandLabel} — ใช้ถ่ายก่อนเป็นสมมติฐาน ไม่ล็อคทุกคลิป`
            : "เก็บผลต่ออีก 2–3 คลิปข้ามโครงก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: ScriptFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot" && b.band !== "flat") ??
    bands.find(
      (b) =>
        b.status === "steady" &&
        b.samples > 0 &&
        b.band !== "flat",
    ) ??
    bands.find((b) => b.band === "problem_demo");

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = scriptStyleOf(slot, pack);
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
        tip: "ไม่แก้สคริปต์อัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์",
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
        bands.find((b) => b.band === "howto" || b.band === "before_after") ??
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
        reason: `วันนี้ซ้อนโครง ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนสคริปต์เอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: ScriptFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายโครงสคริปต์",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อโครง",
    });
  }
  if (flatSamples > 0) {
    actions.push({
      id: "clarify-flat",
      title: "ทำให้โครงสคริปต์ชัดขึ้น",
      detail: `พบ ${flatSamples} โพสต์โครงไม่ชัด — ใส่ป้ายโครง (ปัญหา→สาธิต/วิธีใช้/ก่อน–หลัง) แล้ว regenerate ก่อน Approve`,
    });
  }
  if (best && best.status === "hot" && best.band !== "flat") {
    actions.push({
      id: "lean-script",
      title: `ถ่ายก่อนด้วยโครง ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์โครงคลิป",
      detail:
        "โครงเด่นกินสัดส่วนสูง — เพิ่ม draft คนละโครง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.filter((b) => b.band !== "flat").length > 0) {
    const coldSoft = cold.filter((b) => b.band !== "flat");
    actions.push({
      id: "review-cold",
      title: `ทบทวนโครงเย็น: ${coldSoft.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับโครงสคริปต์ / regenerate หรือพักโครงนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ",
    });
  }
  const missingStyles = SCRIPT_STYLE_ORDER.filter(
    (b) => b !== "flat" && (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองโครงที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อโครงแล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure + ไม่ขายแข็ง",
    detail:
      "ทุกแคปชัน/คลิปต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Script Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับโครงสคริปต์"
      : `Script Fit Lab: ${posted.length} โพสต์มีเมตริก · โครงที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          flatSamples > 0 ? ` · flat ${flatSamples}` : ""
        }${unbalanced ? " · มิกซ์เอนข้างเดียว" : ""}`;

  const checklist = [
    "อันดับโครงสคริปต์มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับโครงเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "หลีกเลี่ยงโครงไม่ชัดและคำโฆษณาเกินจริงในคลิป",
    "ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ",
  ];

  const lines: string[] = [
    `Script Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function scriptFitLabLines(lab: ScriptFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function scriptFitLabToMarkdown(lab: ScriptFitLab): string {
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
    `# Script Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- โครงที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- flat: ${lab.counts.flatSamples}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับโครงสคริปต์วิดีโอสั้น (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับโครงวันนี้)_"]),
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
