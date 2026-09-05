/**
 * CTA Fit Lab — soft ranking of closing-CTA style bands from logged metrics.
 * Suggests style mix for drafts (detail / soft_gate / compare / soft_pass / generic);
 * never auto-swaps CTAs or claims guaranteed income.
 * Complements Hook Fit Lab (opening) with closing CTA mix learning.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type CtaFitGrade = "A" | "B" | "C" | "D";
export type CtaStyleKind =
  | "detail"
  | "soft_gate"
  | "compare"
  | "soft_pass"
  | "generic";
export type CtaFitStatus = "hot" | "steady" | "cold" | "no_data";
export type CtaFitConfidence = "thin" | "ok" | "solid";

export const CTA_STYLE_ORDER: CtaStyleKind[] = [
  "detail",
  "soft_gate",
  "compare",
  "soft_pass",
  "generic",
];

const BAND_STATUS_LABEL: Record<CtaFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<CtaFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<CtaStyleKind, string> = {
  detail: "ชวนดูรายละเอียด/ลิงก์",
  soft_gate: "ถ้าเข้าเงื่อนไขค่อยดู",
  compare: "ชวนเทียบของเดิม",
  soft_pass: "ไม่เร่งซื้อ · ตัดสินใจเอง",
  generic: "CTA ทั่วไป/ไม่ชัด",
};

const BAND_RANGE: Record<CtaStyleKind, string> = {
  detail: "ดูรายละเอียด · ลิงก์ในไบโอ/คอมเมนต์ · อ่านสเปก",
  soft_gate: "ถ้าเข้าเงื่อนไข · ค่อยกดดู",
  compare: "เทียบกับของเดิม · เปิดดูสเปก/รีวิว",
  soft_pass: "ไม่เร่งซื้อ · ค่อยตัดสินใจเอง",
  generic: "กดลิงก์ / สั่งเลย / ไม่เข้าแพทเทิร์นอ่อน",
};

const STYLE_HINT: Record<CtaStyleKind, string> = {
  detail: "ปิดด้วยชวนเปิดดูสเปก/รีวิวที่ลิงก์ — ไม่เร่งกดซื้อ",
  soft_gate: "ใส่เงื่อนไขสั้น ๆ ก่อนชวนดูลิงก์ (เหมาะของเฉพาะทาง)",
  compare: "ชวนเทียบของเดิม 1 จุด แล้วเปิดดูรายละเอียด",
  soft_pass: "ย้ำว่าไม่เร่งซื้อ — ให้ผู้ชมตัดสินใจเองหลังดูข้อมูล",
  generic: "เขียน CTA อ่อนใหม่ให้ชัดกว่า “กดลิงก์” เปล่า ๆ",
};

export interface CtaFitRow {
  band: CtaStyleKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgCtaIndex: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: CtaFitStatus;
  confidence: CtaFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface CtaFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: CtaStyleKind;
  currentLabel: string;
  suggestedBand: CtaStyleKind;
  suggestedLabel: string;
  ctaIndex: number;
  ctaPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface CtaFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface CtaFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: CtaFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: CtaFitRow[];
  mixTip: string;
  suggestions: CtaFitSuggestion[];
  actions: CtaFitAction[];
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

function normalizeCta(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Classify closing CTA text into a style band.
 * Order matters: more specific soft patterns first.
 */
export function classifyCtaStyle(raw: string): CtaStyleKind {
  const text = normalizeCta(raw);
  if (!text) return "generic";

  if (
    /ถ้าเข้าเงื่อนไข|ค่อยกดดู|ค่อยดูรายละเอียด|ถ้าเหมาะกับคุณ|ถ้าเข้าเงื่อนไขใช้งาน/u.test(
      text,
    )
  ) {
    return "soft_gate";
  }
  if (
    /เทียบกับของเดิม|อยากลองเทียบ|เปิดลิงก์ไปดูสเปก|เทียบสเปก|เทียบก่อน/u.test(
      text,
    )
  ) {
    return "compare";
  }
  if (
    /ไม่เร่งซื้อ|ค่อยตัดสินใจเอง|ตัดสินใจเองได้|ไม่ต้องรีบ|ไม่เร่งกด/u.test(
      text,
    )
  ) {
    return "soft_pass";
  }
  if (
    /ดูรายละเอียด|อ่านรีวิว|ลิงก์ในคอมเมนต์|ลิงก์ในไบโอ|ลิงก์ด้านล่าง|เปิดดูรายละเอียด|ดูสเปก/u.test(
      text,
    )
  ) {
    return "detail";
  }
  if (/สั่งเลย|กดซื้อเลย|รีบก่อนหมด|รับประกัน|การันตี|รวยแน่/u.test(text)) {
    return "generic";
  }
  return "generic";
}

/** Weak fallback when pack CTA text is missing — map common generator indices. */
export function ctaStyleFromIndex(index: number): CtaStyleKind {
  const map: CtaStyleKind[] = [
    "detail",
    "soft_gate",
    "compare",
    "soft_pass",
    "detail",
    "soft_pass",
  ];
  if (!Number.isFinite(index) || index < 0) return "generic";
  return map[index % map.length] ?? "generic";
}

export function resolveCtaText(
  pack: ContentPack | undefined,
  ctaIndex: number,
  captionPreview?: string,
): string {
  const fromPack = pack?.ctas?.[ctaIndex]?.trim();
  if (fromPack) return fromPack;
  const preview = captionPreview?.trim();
  if (preview) {
    // Last non-empty line of caption is often the CTA.
    const lines = preview
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    if (last) return last.slice(0, 180);
  }
  return "";
}

export function ctaStyleOf(
  post: Pick<ScheduledPost, "ctaIndex" | "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): CtaStyleKind {
  const text = resolveCtaText(pack, post.ctaIndex, post.captionPreview);
  if (text) return classifyCtaStyle(text);
  return ctaStyleFromIndex(post.ctaIndex);
}

export function ctaStyleLabel(band: CtaStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): CtaFitConfidence {
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
  band: CtaStyleKind;
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

  // Soft nudge: soft_pass / detail / soft_gate fit help-choose tone.
  if (params.band === "soft_pass") score += 4;
  else if (params.band === "detail") score += 3;
  else if (params.band === "soft_gate") score += 2;
  else if (params.band === "compare") score += 2;
  else if (params.band === "generic") score -= 4;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): CtaFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<CtaFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.status === "hot") {
    return `CTA สไตล์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในสไตล์นี้ — ลองสลับ ctaIndex หรือสร้างแคปชันใหม่ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้สไตล์นี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจาย CTA เพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): CtaFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build CTA Fit Lab from manually logged post metrics + content-pack CTAs.
 */
export function buildCtaFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): CtaFitLab {
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

  const byBand = new Map<CtaStyleKind, ScheduledPost[]>();
  for (const band of CTA_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = ctaStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: CtaFitRow[] = CTA_STYLE_ORDER.map((band) => {
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
    const avgCtaIndex =
      samples > 0 ? avg(list.map((p) => p.ctaIndex ?? 0)) : 0;
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
    const row: Omit<CtaFitRow, "tip"> = {
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
      avgCtaIndex: round1(avgCtaIndex),
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
      ? "ยังไม่มีเมตริกรายสไตล์ CTA — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์"
      : unbalanced && best
        ? `มิกซ์เอนไปสไตล์ ${best.bandLabel} มาก — วันถัดไปลองสลับ CTA 1 ชิ้น (ทดลอง)`
        : best
          ? `สไตล์ CTA เด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์ CTA ก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: CtaFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = ctaStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = normalizeCta(
      resolveCtaText(pack, slot.ctaIndex, slot.captionPreview),
    ).slice(0, 48);

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot") ||
        currentKey === "generic");

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        ctaIndex: slot.ctaIndex,
        ctaPreview: preview || `(cta #${slot.ctaIndex + 1})`,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับ CTA อัตโนมัติ — กดสร้างแคปชันใหม่หรือเลือก ctaIndex อื่น แล้ว Approve ก่อนโพสต์มือ",
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
            b.band !== "generic" &&
            (b.status === "steady" || b.status === "no_data"),
        ) ?? cold[0];
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: alt.band,
        suggestedLabel: alt.bandLabel,
        ctaIndex: slot.ctaIndex,
        ctaPreview: preview || `(cta #${slot.ctaIndex + 1})`,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนสไตล์ ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยน CTA เอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: CtaFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายสไตล์ CTA",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อสไตล์ปิดคลิป",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-cta",
      title: `เอียงทดลองไปสไตล์ ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์สไตล์ CTA",
      detail:
        "สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละสไตล์ปิดคลิป 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนสไตล์เย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "สลับ ctaIndex / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  const missingStyles = CTA_STYLE_ORDER.filter(
    (b) => b !== "generic" && (byBand.get(b) ?? []).length === 0,
  );
  if (missingStyles.length > 0 && posted.length > 0) {
    actions.push({
      id: "fill-styles",
      title: `ทดลองสไตล์ที่ยังไม่มีข้อมูล (${missingStyles.length})`,
      detail: `ยังไม่มี: ${missingStyles.map((b) => BAND_LABEL[b]).join(" · ")} — draft 1 ชิ้นต่อสไตล์แล้ววัดผล`,
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail:
      "ทุกสไตล์ CTA ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "CTA Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับสไตล์ปิดคลิป"
      : `CTA Fit Lab: ${posted.length} โพสต์มีเมตริก · สไตล์ที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับสไตล์ CTA มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับสไตล์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่ม CTA แบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `CTA Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function ctaFitLabLines(lab: CtaFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function ctaFitLabToMarkdown(lab: CtaFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   ctaIndex avg ~${b.avgCtaIndex} · CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · cta #${s.ctaIndex + 1}\n` +
      `   preview: ${s.ctaPreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# CTA Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- สไตล์ที่มีข้อมูล: ${lab.counts.bandsWithData}`,
    `- ช่วงร้อน: ${lab.counts.hot}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับสไตล์ CTA (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับสไตล์ CTA วันนี้)_"]),
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
