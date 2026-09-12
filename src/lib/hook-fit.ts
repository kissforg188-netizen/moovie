/**
 * Hook Fit Lab — soft ranking of opening-hook style bands from logged metrics.
 * Suggests style mix for drafts (pain / browse / value / social / soft);
 * never auto-swaps hooks or claims guaranteed income.
 * Complements Creative Performance (specific hook text) with style-level mix.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type HookFitGrade = "A" | "B" | "C" | "D";
export type HookStyleKind =
  | "pain"
  | "browse"
  | "value"
  | "social"
  | "soft";
export type HookFitStatus = "hot" | "steady" | "cold" | "no_data";
export type HookFitConfidence = "thin" | "ok" | "solid";

export const HOOK_STYLE_ORDER: HookStyleKind[] = [
  "pain",
  "browse",
  "value",
  "social",
  "soft",
];

const BAND_STATUS_LABEL: Record<HookFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<HookFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<HookStyleKind, string> = {
  pain: "เปิดด้วยปัญหา/เคยเจอไหม",
  browse: "เปิดดูสเปก/แพลตฟอร์ม",
  value: "จุดขาย+ราคา",
  social: "กลุ่มเป้าหมายพูดถึง",
  soft: "ลองก่อน/สั้นตรง ๆ",
};

const BAND_RANGE: Record<HookStyleKind, string> = {
  pain: "เคยเจอ / ปัญหา / อยากลดเรื่อง",
  browse: "Shopee · TikTok Shop · กำลังหาของ",
  value: "จุดที่ชอบ · ราคาประมาณ",
  social: "คน…พูดถึง · กลุ่มเป้าหมาย",
  soft: "ไม่ต้องซื้อแพง · สั้น ๆ ตรง ๆ",
};

const STYLE_HINT: Record<HookStyleKind, string> = {
  pain: "เปิดด้วย pain สั้น ๆ ภายใน 3 วิ แล้วค่อยโชว์ของ",
  browse: "ชวนเปิดดูสเปก/รีวิวบนแพลตฟอร์มก่อนตัดสินใจ",
  value: "บอกจุดขาย 1 ข้อ + ราคาประมาณ แบบไม่เร่งซื้อ",
  social: "พูดถึงกลุ่มเป้าหมายชัด ๆ โดยไม่เคลมยอดขาย",
  soft: "น้ำเสียงเพื่อนแนะนำ — ลองดูตัวเลือก ไม่ขายแข็ง",
};

export interface HookFitRow {
  band: HookStyleKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgHookIndex: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: HookFitStatus;
  confidence: HookFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface HookFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: HookStyleKind;
  currentLabel: string;
  suggestedBand: HookStyleKind;
  suggestedLabel: string;
  hookIndex: number;
  hookPreview: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface HookFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface HookFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: HookFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: HookFitRow[];
  mixTip: string;
  suggestions: HookFitSuggestion[];
  actions: HookFitAction[];
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

function normalizeHook(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Classify opening hook text into a style band.
 * Order matters: more specific patterns first.
 */
export function classifyHookStyle(raw: string): HookStyleKind {
  const text = normalizeHook(raw);
  if (!text) return "soft";

  if (
    /เคยเจอ|ปัญหาคือ|ปัญหา[จจ]|อยากลดเรื่อง|เล่าจากมุมคนใช้จริง|เจอไหม/u.test(
      text,
    )
  ) {
    return "pain";
  }
  if (
    /shopee|tiktok\s*shop|เปิดดูสเปก|กำลังหาของช่วย|โชว์ของจริงในคลิป|ดูรายละเอียดใน/iu.test(
      text,
    )
  ) {
    return "browse";
  }
  if (/ราคาประมาณ|จุดที่ชอบคือ|จุดขาย/u.test(text)) {
    return "value";
  }
  if (/พูดถึงบ่อย|คนที่กำลัง|สำหรับคน|กลุ่มเป้าหมาย|เหมาะกับ/u.test(text)) {
    return "social";
  }
  if (
    /ไม่ต้องซื้อแพง|ลองดูตัวเลือก|สั้น\s*ๆ\s*ตรง\s*ๆ|ไม่เร่งซื้อ|แชร์ตัวเลือก/u.test(
      text,
    )
  ) {
    return "soft";
  }
  return "soft";
}

/** Weak fallback when pack hook text is missing — map common generator indices. */
export function hookStyleFromIndex(index: number): HookStyleKind {
  const map: HookStyleKind[] = [
    "pain",
    "browse",
    "browse",
    "value",
    "social",
    "soft",
    "pain",
    "value",
  ];
  if (!Number.isFinite(index) || index < 0) return "soft";
  return map[index % map.length] ?? "soft";
}

export function resolveHookText(
  pack: ContentPack | undefined,
  hookIndex: number,
  captionPreview?: string,
): string {
  const fromPack = pack?.hooks?.[hookIndex]?.trim();
  if (fromPack) return fromPack;
  const preview = captionPreview?.trim();
  if (preview) {
    // First non-empty line of caption is usually the hook.
    const first = preview.split(/\n/).map((l) => l.trim()).find(Boolean);
    if (first) return first.slice(0, 160);
  }
  return "";
}

export function hookStyleOf(
  post: Pick<ScheduledPost, "hookIndex" | "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): HookStyleKind {
  const text = resolveHookText(pack, post.hookIndex, post.captionPreview);
  if (text) return classifyHookStyle(text);
  return hookStyleFromIndex(post.hookIndex);
}

export function hookStyleLabel(band: HookStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): HookFitConfidence {
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
  band: HookStyleKind;
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

  // Soft nudge: pain/soft openers often fit short-video honesty tone.
  if (params.band === "pain") score += 4;
  else if (params.band === "soft") score += 3;
  else if (params.band === "browse") score += 2;
  else if (params.band === "value") score += 1;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): HookFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<HookFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.status === "hot") {
    return `สไตล์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในสไตล์นี้ — ลองสลับ hookIndex หรือสร้างแคปชันใหม่ก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้สไตล์นี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายสไตล์เปิดคลิปเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): HookFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Hook Fit Lab from manually logged post metrics + content-pack hooks.
 */
export function buildHookFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): HookFitLab {
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

  const byBand = new Map<HookStyleKind, ScheduledPost[]>();
  for (const band of HOOK_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = hookStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: HookFitRow[] = HOOK_STYLE_ORDER.map((band) => {
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
    const avgHookIndex =
      samples > 0 ? avg(list.map((p) => p.hookIndex ?? 0)) : 0;
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
    const row: Omit<HookFitRow, "tip"> = {
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
      avgHookIndex: round1(avgHookIndex),
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
      ? "ยังไม่มีเมตริกรายสไตล์ hook — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์"
      : unbalanced && best
        ? `มิกซ์เอนไปสไตล์ ${best.bandLabel} มาก — วันถัดไปลองสลับสไตล์เปิดคลิป 1 ชิ้น (ทดลอง)`
        : best
          ? `สไตล์ hook เด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์ hook ก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: HookFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const currentKey = hookStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = normalizeHook(
      resolveHookText(pack, slot.hookIndex, slot.captionPreview),
    ).slice(0, 48);

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot"));

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentBand: currentKey,
        currentLabel: BAND_LABEL[currentKey],
        suggestedBand: preferred.band,
        suggestedLabel: preferred.bandLabel,
        hookIndex: slot.hookIndex,
        hookPreview: preview || `(hook #${slot.hookIndex + 1})`,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับ hook อัตโนมัติ — กดสร้างแคปชันใหม่หรือเลือก hookIndex อื่น แล้ว Approve ก่อนโพสต์มือ",
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
        hookIndex: slot.hookIndex,
        hookPreview: preview || `(hook #${slot.hookIndex + 1})`,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนสไตล์ ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยน hook เอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: HookFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายสไตล์ hook",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อสไตล์เปิดคลิป",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-hook",
      title: `เอียงทดลองไปสไตล์ ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์สไตล์ hook",
      detail:
        "สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละสไตล์เปิดคลิป 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนสไตล์เย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "สลับ hookIndex / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  const missingStyles = HOOK_STYLE_ORDER.filter(
    (b) => (byBand.get(b) ?? []).length === 0,
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
      "ทุกสไตล์ hook ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Hook Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับสไตล์เปิดคลิป"
      : `Hook Fit Lab: ${posted.length} โพสต์มีเมตริก · สไตล์ที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับสไตล์ hook มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับสไตล์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่ม hook แบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Hook Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
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

export function hookFitLabLines(lab: HookFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function hookFitLabToMarkdown(lab: HookFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   hookIndex avg ~${b.avgHookIndex} · CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · hook #${s.hookIndex + 1}\n` +
      `   preview: ${s.hookPreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Hook Fit Lab · ${lab.date}`,
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
    "## อันดับสไตล์ hook (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับสไตล์ hook วันนี้)_"]),
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
