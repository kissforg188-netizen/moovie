/**
 * Hashtag Fit Lab — soft ranking of hashtag mix styles from logged metrics.
 * Suggests style mix for drafts (bilingual / thai_niche / en_discovery / sparse / generic);
 * never auto-swaps hashtags or claims guaranteed income.
 * Complements Hook/CTA Fit Labs with discovery-tag mix learning.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentPack,
  Database,
  ScheduledPost,
} from "./types";

export type HashtagFitGrade = "A" | "B" | "C" | "D";
export type HashtagStyleKind =
  | "bilingual"
  | "thai_niche"
  | "en_discovery"
  | "sparse"
  | "generic";
export type HashtagFitStatus = "hot" | "steady" | "cold" | "no_data";
export type HashtagFitConfidence = "thin" | "ok" | "solid";

export const HASHTAG_STYLE_ORDER: HashtagStyleKind[] = [
  "bilingual",
  "thai_niche",
  "en_discovery",
  "sparse",
  "generic",
];

const BAND_STATUS_LABEL: Record<HashtagFitStatus, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<HashtagFitConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<HashtagStyleKind, string> = {
  bilingual: "ไทย+อังกฤษ + disclosure",
  thai_niche: "ไทยเน้นหมวด/แพลตฟอร์ม",
  en_discovery: "อังกฤษเน้นค้นพบ",
  sparse: "แฮชแท็กน้อยเกินไป",
  generic: "ทั่วไป/ไม่ชัด",
};

const BAND_RANGE: Record<HashtagStyleKind, string> = {
  bilingual: "TH+EN สมดุล · มี #AffiliateDisclosure",
  thai_niche: "แท็กไทย + หมวด/#ShopeeAffiliate/#TikTokShop",
  en_discovery: "#ProductPick · #HonestReview · #ShortVideo",
  sparse: "น้อยกว่า 3 แท็ก",
  generic: "แท็กกว้าง ๆ ไม่มี niche / ไม่เข้าแพทเทิร์น",
};

const STYLE_HINT: Record<HashtagStyleKind, string> = {
  bilingual:
    "ผสมแท็กไทย 3–4 + อังกฤษ 2–3 และใส่ #AffiliateDisclosure เสมอ",
  thai_niche:
    "เน้นแท็กไทย + หมวดสินค้า/แพลตฟอร์ม — อย่าถล่มแท็กซ้ำวันเดิม",
  en_discovery:
    "ใช้แท็กอังกฤษค้นพบเบา ๆ คู่กับ disclosure — ไม่สแปมยาว",
  sparse: "เพิ่มแท็กให้ครบอย่างน้อย 4–6 ตัว รวม disclosure",
  generic: "ใส่หมวด/แพลตฟอร์มให้ชัด แทนแท็กกว้าง ๆ อย่างเดียว",
};

const DISCLOSURE_TAGS = [
  "#affiliatedisclosure",
  "#affiliatelink",
  "#ad",
  "#advertisement",
  "#สปอนเซอร์",
  "#โฆษณา",
];

const NICHE_PLATFORM_TAGS = [
  "#shopeeaffiliate",
  "#tiktokshop",
  "#shopee",
  "#tiktok",
  "#เลือกดี",
];

const GENERIC_TH_TAGS = [
  "#รีวิวของใช้",
  "#แนะนำของดี",
  "#ช้อปอย่างมีเหตุผล",
  "#รีวิว",
  "#ของดีบอกต่อ",
];

const DISCOVERY_EN_TAGS = [
  "#productpick",
  "#honestreview",
  "#shortvideo",
  "#thailand",
  "#fyp",
  "#foryou",
];

export interface HashtagFitRow {
  band: HashtagStyleKind;
  bandLabel: string;
  rangeLabel: string;
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgTagCount: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  status: HashtagFitStatus;
  confidence: HashtagFitConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface HashtagFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentBand: HashtagStyleKind;
  currentLabel: string;
  suggestedBand: HashtagStyleKind;
  suggestedLabel: string;
  tagPreview: string;
  tagCount: number;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface HashtagFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface HashtagFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: HashtagFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    bandsWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  bands: HashtagFitRow[];
  mixTip: string;
  suggestions: HashtagFitSuggestion[];
  actions: HashtagFitAction[];
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

function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
}

function tagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase();
}

/** Extract #tags from free text (caption preview). */
export function extractHashtagsFromText(raw: string): string[] {
  if (!raw?.trim()) return [];
  const matches = raw.match(/#[\w\u0E00-\u0E7F]+/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const n = normalizeTag(m);
    const key = tagKey(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function isThaiHeavyTag(tag: string): boolean {
  return /[\u0E00-\u0E7F]/u.test(tag);
}

function hasAny(tags: string[], needles: string[]): boolean {
  const set = new Set(tags.map(tagKey));
  return needles.some((n) => set.has(tagKey(n)));
}

export function resolveHashtagLists(
  pack: ContentPack | undefined,
  captionPreview?: string,
): { th: string[]; en: string[]; all: string[] } {
  const fromPackTh = (pack?.hashtagsTh ?? []).map(normalizeTag).filter(Boolean);
  const fromPackEn = (pack?.hashtagsEn ?? []).map(normalizeTag).filter(Boolean);
  const fromCaption = extractHashtagsFromText(captionPreview ?? "");

  const seen = new Set<string>();
  const all: string[] = [];
  for (const t of [...fromPackTh, ...fromPackEn, ...fromCaption]) {
    const key = tagKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(t);
  }

  const th = all.filter(isThaiHeavyTag);
  const en = all.filter((t) => !isThaiHeavyTag(t));
  return { th, en, all };
}

/**
 * Classify hashtag mix into a style band.
 * Order matters: sparse first, then bilingual / niche / discovery, else generic.
 */
export function classifyHashtagStyle(
  th: string[],
  en: string[],
  captionPreview?: string,
): HashtagStyleKind {
  const resolved = resolveHashtagLists(
    { hashtagsTh: th, hashtagsEn: en } as ContentPack,
    captionPreview,
  );
  const tags = resolved.all;
  if (tags.length < 3) return "sparse";

  const thN = resolved.th.length;
  const enN = resolved.en.length;
  const total = tags.length;
  const hasDisclosure = hasAny(tags, DISCLOSURE_TAGS);
  const hasPlatformNiche = hasAny(tags, NICHE_PLATFORM_TAGS);
  const hasDiscovery = hasAny(tags, DISCOVERY_EN_TAGS);
  const genericKeys = new Set(GENERIC_TH_TAGS.map(tagKey));
  const onlyGenericTh =
    thN > 0 &&
    resolved.th.every((t) => genericKeys.has(tagKey(t))) &&
    !hasPlatformNiche &&
    enN === 0;
  const hasNiche = hasPlatformNiche || (thN >= 2 && !onlyGenericTh);

  // Thai-led niche (disclosure EN alone is OK) before bilingual.
  if (thN >= 3 && enN <= 2 && hasNiche && !hasDiscovery) return "thai_niche";
  if (thN >= 2 && enN >= 2 && hasDisclosure && (hasDiscovery || enN >= 3))
    return "bilingual";
  if (enN >= 3 && thN <= 1 && (hasDiscovery || hasDisclosure))
    return "en_discovery";
  if (thN >= 2 && enN >= 2 && hasDisclosure) return "bilingual";
  if (onlyGenericTh || (!hasNiche && !hasDisclosure && !hasDiscovery))
    return "generic";
  if (thN / Math.max(1, total) >= 0.7 && hasNiche) return "thai_niche";
  if (enN / Math.max(1, total) >= 0.7) return "en_discovery";
  return "generic";
}

export function hashtagStyleOf(
  post: Pick<ScheduledPost, "captionPreview" | "contentPackId">,
  pack?: ContentPack,
): HashtagStyleKind {
  const { th, en } = resolveHashtagLists(pack, post.captionPreview);
  return classifyHashtagStyle(th, en, post.captionPreview);
}

export function hashtagStyleLabel(band: HashtagStyleKind): string {
  return BAND_LABEL[band];
}

function confidenceOf(samples: number): HashtagFitConfidence {
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
  band: HashtagStyleKind;
  avgTagCount: number;
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

  // Soft nudge: bilingual / thai_niche fit help-choose + disclosure tone.
  if (params.band === "bilingual") score += 4;
  else if (params.band === "thai_niche") score += 3;
  else if (params.band === "en_discovery") score += 2;
  else if (params.band === "sparse") score -= 6;
  else if (params.band === "generic") score -= 4;

  // Mild penalty for extreme tag spam in the band average.
  if (params.avgTagCount >= 18) score -= 8;
  else if (params.avgTagCount >= 14) score -= 4;

  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function statusOf(score: number, samples: number): HashtagFitStatus {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<HashtagFitRow, "tip">): string {
  if (row.samples === 0) {
    return `ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “${STYLE_HINT[row.band]}” แล้วกรอกเมตริก`;
  }
  if (row.status === "hot") {
    return `มิกซ์แฮชแท็กนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ`;
  }
  if (row.status === "cold") {
    return `ผลเย็นในสไตล์นี้ — ลองปรับชุดแท็กหรือ regenerate แคปชันก่อนโพสต์ซ้ำ`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้สไตล์นี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายมิกซ์แท็กเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, bandsWithData: number): HashtagFitGrade {
  if (bandsWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Hashtag Fit Lab from manually logged post metrics + content-pack tags.
 */
export function buildHashtagFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): HashtagFitLab {
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

  const byBand = new Map<HashtagStyleKind, ScheduledPost[]>();
  for (const band of HASHTAG_STYLE_ORDER) {
    byBand.set(band, []);
  }

  for (const post of posted) {
    const pack = packById.get(post.contentPackId);
    const key = hashtagStyleOf(post, pack);
    const list = byBand.get(key) ?? [];
    list.push(post);
    byBand.set(key, list);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const bands: HashtagFitRow[] = HASHTAG_STYLE_ORDER.map((band) => {
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
    const tagCounts = list.map((p) => {
      const pack = packById.get(p.contentPackId);
      return resolveHashtagLists(pack, p.captionPreview).all.length;
    });
    const avgTagCount = samples > 0 ? avg(tagCounts) : 0;
    const score = scoreBand({
      samples,
      avgCommission,
      avgCtr,
      avgOrdersPerClick,
      avgOrders,
      shareOfPosts,
      globalAvgCommission,
      band,
      avgTagCount,
    });
    const confidence = confidenceOf(samples);
    const status = statusOf(score, samples);
    const row: Omit<HashtagFitRow, "tip"> = {
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
      avgTagCount: round1(avgTagCount),
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
      ? "ยังไม่มีเมตริกรายสไตล์แฮชแท็ก — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์"
      : unbalanced && best
        ? `มิกซ์เอนไปสไตล์ ${best.bandLabel} มาก — วันถัดไปลองสลับชุดแท็ก 1 ชิ้น (ทดลอง)`
        : best
          ? `สไตล์แฮชแท็กเด่น: ${best.bandLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์แฮชแท็กก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: HashtagFitSuggestion[] = [];
  const preferred =
    bands.find((b) => b.status === "hot") ??
    bands.find((b) => b.status === "steady" && b.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    const pack = packById.get(slot.contentPackId);
    if (!product || !preferred) continue;
    const lists = resolveHashtagLists(pack, slot.captionPreview);
    const currentKey = hashtagStyleOf(slot, pack);
    const currentRow = bands.find((b) => b.band === currentKey);
    const sameAsPreferred = currentKey === preferred.band;
    const preview = lists.all.slice(0, 5).join(" ");

    const currentCold =
      currentRow != null &&
      (currentRow.status === "cold" ||
        (currentRow.status === "no_data" && preferred.status === "hot") ||
        currentKey === "sparse" ||
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
        tagPreview: preview || "(ไม่มีแท็ก)",
        tagCount: lists.all.length,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${BAND_LABEL[currentKey]} เย็น · ${preferred.bandLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับแฮชแท็กอัตโนมัติ — regenerate แคปชันหรือแก้แท็กมือ แล้ว Approve ก่อนโพสต์",
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
            b.band !== "sparse" &&
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
        tagPreview: preview || "(ไม่มีแท็ก)",
        tagCount: lists.all.length,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนสไตล์ ${BAND_LABEL[currentKey]} — ลองกระจายไป ${alt.bandLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนแท็กเอง — regenerate draft แล้ว Approve ใหม่",
      });
    }
  }

  const actions: HashtagFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายสไตล์แฮชแท็ก",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมิกซ์แท็ก",
    });
  }
  if (best && best.status === "hot") {
    actions.push({
      id: "lean-tags",
      title: `เอียงทดลองไปสไตล์ ${best.bandLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต · ${STYLE_HINT[best.band]}`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์สไตล์แฮชแท็ก",
      detail:
        "สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละมิกซ์แท็ก 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนสไตล์เย็น: ${cold.map((b) => b.bandLabel).join(", ")}`,
      detail:
        "ปรับชุดแท็ก / regenerate หรือพักมิกซ์นั้นชั่วคราว — อย่าโพสต์ซ้ำชุดแท็กเดิมยาว ๆ",
    });
  }
  const missingStyles = HASHTAG_STYLE_ORDER.filter(
    (b) =>
      b !== "generic" &&
      b !== "sparse" &&
      (byBand.get(b) ?? []).length === 0,
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
      "ทุกมิกซ์แฮชแท็กควรมี #AffiliateDisclosure หรือข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Hashtag Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมิกซ์แท็ก"
      : `Hashtag Fit Lab: ${posted.length} โพสต์มีเมตริก · สไตล์ที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับสไตล์แฮชแท็กมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับมิกซ์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve",
    "อย่าถล่มแท็กชุดเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Hashtag Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
    mixTip,
  ];
  for (const b of withData.slice(0, 3)) {
    lines.push(
      `${BAND_STATUS_LABEL[b.status]} · ${b.bandLabel}: คะแนน ${b.score} (${CONF_LABEL[b.confidence]}, n=${b.samples}, CTR ~${round1(b.avgCtr * 100)}%, แท็ก avg ~${b.avgTagCount})`,
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

export function hashtagFitLabLines(lab: HashtagFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function hashtagFitLabToMarkdown(lab: HashtagFitLab): string {
  const bandRows = lab.bands
    .filter((b) => b.samples > 0)
    .map(
      (b, idx) =>
        `${idx + 1}. **[${BAND_STATUS_LABEL[b.status]}]** ${b.bandLabel} (${b.rangeLabel}) · คะแนน ${b.score}/100 · n=${b.samples} · ${CONF_LABEL[b.confidence]}\n` +
        `   แท็ก avg ~${b.avgTagCount} · CTR ~${round1(b.avgCtr * 100)}% · ออเดอร์/คลิก ~${b.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${b.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(b.shareOfPosts * 100)}%\n` +
        `   ${b.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel} · ${s.tagCount} แท็ก\n` +
      `   preview: ${s.tagPreview}\n` +
      `   ${s.currentLabel} → **${s.suggestedLabel}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Hashtag Fit Lab · ${lab.date}`,
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
    "## อันดับสไตล์แฮชแท็ก (ทดลอง)",
    ...(bandRows.length ? bandRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับสไตล์แฮชแท็กวันนี้)_"]),
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
