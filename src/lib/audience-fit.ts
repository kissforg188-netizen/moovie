/**
 * Audience Fit Lab — soft ranking of target-audience clarity bands from logged metrics.
 * Suggests sharper audience briefs for drafts; never auto-publishes or claims guaranteed income.
 * Aligns with scoring.painClarityScore audience bonus (targetAudience.trim().length > 8 → +14).
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type { Database, Product, ScheduledPost } from "./types";

export type AudienceFitGrade = "A" | "B" | "C" | "D";
export type AudienceBandKind =
  | "empty"
  | "vague"
  | "named"
  | "specific"
  | "sharp";
export type AudienceFitStatus = "hot" | "steady" | "cold" | "no_data";
export type AudienceFitConfidence = "thin" | "ok" | "solid";

export const AUDIENCE_BAND_ORDER: AudienceBandKind[] = [
  "empty",
  "vague",
  "named",
  "specific",
  "sharp",
];

const BAND_STATUS_LABEL: Record<AudienceFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<AudienceFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<AudienceBandKind, string> = {
  empty: "ว่าง/ไม่ระบุ",
  vague: "กว้าง/ทั่วไป",
  named: "ระบุกลุ่ม",
  specific: "เฉพาะเจาะจง",
  sharp: "คมมาก",
};

const BAND_RANGE: Record<AudienceBandKind, string> = {
  empty: "คะแนน <15",
  vague: "15–34",
  named: "35–54",
  specific: "55–74",
  sharp: "≥75",
};

/** Generic audience phrases that should not earn the scoring +14 feel. */
const GENERIC_AUDIENCE =
  /^(ทุกคน|คนทั่วไป|ทั่วไป|ใครก็ได้|ทุกวัย|everyone|anyone|all|general|คนดู|follower|followers)$/iu;

const ROLE_MARKERS =
  /แม่|พ่อ|คุณแม่|คุณพ่อ|นักเรียน|นักศึกษา|มนุษย์เงินเดือน|ออฟฟิศ|ฟรีแลนซ์|แม่บ้าน|วัยรุ่น|สาว|หนุ่ม|ผู้หญิง|ผู้ชาย|คู่รัก|คนทำงาน|เจ้าของร้าน|พ่อค้า|แม่ค้า|ครีเอเตอร์|ครู|พยาบาล|โปรแกรมเมอร์|คนรักแมว|คนรักหมา|คนออกกำลัง|คนชอบท่องเที่ยว|มือใหม่|มือโปร|มือใหม่หัด|แม่ลูกอ่อน|คนงบน้อย|คนงบจำกัด|office|student|freelancer|mom|dad|creator/iu;

const NEED_MARKERS =
  /อยาก|ต้องการ|กำลังหา|เบื่อ|ปัญหา|ช่วย|ประหยัด|เร็ว|ง่าย|ไม่ทัน|แก้|เลือก|เปรียบเทียบ|รีวิว|แนะนำ|looking|need|want|busy|tired/iu;

export interface AudienceFitRow {
  band: AudienceBandKind;
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
  avgAudienceScore: number;
  avgAudienceLen: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: AudienceFitStatus;
  confidence: AudienceFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface AudienceFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: AudienceBandKind;
  currentLabel: string;
  suggestedBand: AudienceBandKind;
  suggestedLabel: string;
  audienceScore: number;
  audiencePreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface AudienceFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface AudienceFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: AudienceFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: AudienceFitRow[];
  mixTip: string;
  suggestions: AudienceFitSuggestion[];
  actions: AudienceFitAction[];
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

function normalizeAudience(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function isGenericAudience(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (GENERIC_AUDIENCE.test(t)) return true;
  // Very short Thai generics often written with filler
  if (t.length <= 8 && /ทั่วไป|ทุกคน|ใครก็ได้/u.test(t)) return true;
  return false;
}

function countSpecificitySignals(text: string): number {
  let n = 0;
  if (ROLE_MARKERS.test(text)) n += 1;
  if (NEED_MARKERS.test(text)) n += 1;
  // Age / life-stage cues
  if (/วัย|ปี|เด็ก|ผู้ใหญ่|สูงวัย|คนท้อง|คนแก่|gen\s*[zy]|genz|millennial/iu.test(text))
    n += 1;
  // Context / situation
  if (/ที่บ้าน|ตอนเช้า|ก่อนนอน|ออฟฟิศ|ทริป|หน้าร้อน|หน้าฝน|ปีใหม่|สงกรานต์/u.test(text))
    n += 1;
  // Multiple clauses / commas suggest a richer brief
  if (/[,/|·•]/.test(text) || text.split(/\s+/).length >= 6) n += 1;
  return n;
}

/**
 * Audience clarity 0–100 — length >8 unlocks scoring's +14 audience bonus;
 * generic phrases are capped so they do not look "named".
 */
export function audienceClarityScoreOf(product: Product): number {
  const text = normalizeAudience(product.targetAudience ?? "");
  if (!text) return 0;

  const len = text.length;
  let score = 0;
  if (len <= 4) score = 8;
  else if (len <= 8) score = 22; // below scoring threshold for +14
  else if (len <= 16) score = 42;
  else if (len <= 28) score = 58;
  else if (len <= 45) score = 72;
  else score = 82;

  if (isGenericAudience(text)) {
    score = Math.min(score, 28);
  }

  score += Math.min(countSpecificitySignals(text) * 8, 24);
  // Soft boost when it clearly qualifies for scoring's length > 8 gate
  if (len > 8 && !isGenericAudience(text)) score += 4;

  return Math.min(100, Math.round(score));
}

export function audienceBandOf(score: number): AudienceBandKind {
  if (!Number.isFinite(score) || score < 15) return "empty";
  if (score < 35) return "vague";
  if (score < 55) return "named";
  if (score < 75) return "specific";
  return "sharp";
}

export function audienceBandLabel(band: AudienceBandKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): AudienceFitConfidence {
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
  band: AudienceBandKind;
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

  // Soft nudge toward clearer audiences (matches scoring length > 8 bonus).
  if (params.band === "sharp") score += 6;
  else if (params.band === "specific") score += 5;
  else if (params.band === "named") score += 3;
  else if (params.band === "vague") score -= 2;
  else if (params.band === "empty") score -= 5;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): AudienceFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<AudienceFitRow, "tip">): string {
  if (row.samples === 0) {
    return "ยังไม่มีผลในระดับกลุ่มนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)";
  }
  if (row.status === "hot") {
    return `กลุ่มเป้าหมายระดับนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในระดับนี้ — เขียน targetAudience ให้ชัดขึ้น (ใคร + สถานการณ์) หรือเปลี่ยนมุมขาย`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้ระดับกลุ่มนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายระดับความชัดของกลุ่มเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในระดับนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): AudienceFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Audience Fit Lab from manually logged post metrics.
 */
export function buildAudienceFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): AudienceFitLab {
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

  const byBand = new Map<AudienceBandKind, ScheduledPost[]>();
  const productsByBand = new Map<AudienceBandKind, Set<string>>();
  for (const band of AUDIENCE_BAND_ORDER) {
    byBand.set(band, []);
    productsByBand.set(band, new Set());
  }
  for (const p of db.products) {
    const key = audienceBandOf(audienceClarityScoreOf(p));
    productsByBand.get(key)?.add(p.id);
  }

  for (const post of posted) {
    const product = productById.get(post.productId);
    const key = audienceBandOf(
      product ? audienceClarityScoreOf(product) : 0,
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

  const bands: AudienceFitRow[] = AUDIENCE_BAND_ORDER.map((band) => {
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
    const avgAudienceScore =
      productsInBand.length > 0
        ? avg(productsInBand.map((p) => audienceClarityScoreOf(p)))
        : 0;
    const avgAudienceLen =
      productsInBand.length > 0
        ? avg(
            productsInBand.map(
              (p) => normalizeAudience(p.targetAudience ?? "").length,
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
    const row: Omit<AudienceFitRow, "tip"> = {
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
      avgAudienceScore: round1(avgAudienceScore),
      avgAudienceLen: round1(avgAudienceLen),
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
      ? "ยังไม่มีเมตริกรายระดับกลุ่มเป้าหมาย — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์"
      : unbalanced && best
        ? `มิกซ์เอนไประดับ ${best.bandLabel} มาก — วันถัดไปลองสลับระดับความชัดของกลุ่ม 1 ชิ้น (ทดลอง)`
        : best
          ? `ระดับกลุ่มเป้าหมายเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับกลุ่มเป้าหมายก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: AudienceFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    if (!product || !preferred) continue;
    const audScore = audienceClarityScoreOf(product);
    const currentKey = audienceBandOf(audScore);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = normalizeAudience(product.targetAudience ?? "").slice(
      0,
      48,
    );

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot") ||
        currentKey === "empty" ||
        currentKey === "vague");

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        audienceScore: audScore,
        audiencePreview: preview || "(ว่าง)",
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น/กว้างเกิน · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับสินค้าอัตโนมัติ — แก้ targetAudience ที่หน้าสินค้าให้ชัด (ใคร + สถานการณ์) แล้ว Approve ก่อนโพสต์มือ",
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
        audienceScore: audScore,
        audiencePreview: preview || "(ว่าง)",
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนระดับ ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนกลุ่มเอง — แก้ targetAudience/คิวแล้ว Approve ใหม่",
      });
    }
  }

  const actions: AudienceFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายระดับกลุ่มเป้าหมาย",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อระดับความชัดของกลุ่ม",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-audience",
      title: `เอียงทดลองไประดับ ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์ระดับกลุ่มเป้าหมาย",
      detail:
        "ระดับกลุ่มเด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนระดับเย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "เขียนกลุ่มให้ชัดขึ้น หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  const emptyCatalog = db.products.filter(
    (p) => audienceBandOf(audienceClarityScoreOf(p)) === "empty",
  ).length;
  if (emptyCatalog > 0) {
    actions.push({
      id: "fill-empty",
      title: `เติมกลุ่มเป้าหมายว่าง ${emptyCatalog} ชิ้น`,
      detail:
        "สินค้าไม่มี targetAudience — กรอกใคร + สถานการณ์ (>8 ตัวอักษร) เพื่อเปิด scoring +14 และช่วยเขียนแคปชัน",
    });
  }
  const vagueCatalog = db.products.filter(
    (p) => audienceBandOf(audienceClarityScoreOf(p)) === "vague",
  ).length;
  if (vagueCatalog > 0) {
    actions.push({
      id: "sharpen-vague",
      title: `ทำให้กลุ่มกว้างชัดขึ้น ${vagueCatalog} ชิ้น`,
      detail:
        'หลีกเลี่ยงคำว่า "ทุกคน/ทั่วไป" — ระบุบทบาทหรือสถานการณ์ เช่น "สาวออฟฟิศที่มือแห้งตอนเช้า"',
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail:
      "ทุกระดับกลุ่มต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Audience Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความชัดของกลุ่มเป้าหมาย"
      : `Audience Fit Lab: ${posted.length} โพสต์มีเมตริก · ระดับที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับระดับกลุ่มมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่มกลุ่มเป้าหมายแบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Audience Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function audienceFitLabLines(
  lab: AudienceFitLab,
  limit = 6,
): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function audienceFitLabToMarkdown(lab: AudienceFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0 || b.productCount > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   สินค้าในแคตตาล็อก ${b.productCount} · audienceScore avg ~${b.avgAudienceScore} · ความยาว avg ~${b.avgAudienceLen}\n` +
        `   CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · audienceScore ${s.audienceScore}\n` +
      `   กลุ่ม: ${s.audiencePreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Audience Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- ระดับกลุ่มที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับระดับกลุ่มเป้าหมาย (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับระดับกลุ่มวันนี้)_"]),
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
