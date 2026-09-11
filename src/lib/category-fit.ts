/**
 * Category Fit Lab — soft ranking of product categories from logged metrics.
 * Suggests category mix for drafts; never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type { Database, Product, ScheduledPost } from "./types";

export type CategoryFitGrade = "A" | "B" | "C" | "D";
export type CategoryBand = "hot" | "steady" | "cold" | "no_data";
export type CategoryConfidence = "thin" | "ok" | "solid";

const BAND_LABEL: Record<CategoryBand, string> = {
  hot: "ร้อน",
  steady: "นิ่ง",
  cold: "เย็น",
  no_data: "ยังไม่มีข้อมูล",
};

const CONF_LABEL: Record<CategoryConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

export interface CategoryFitRow {
  category: string;
  categoryLabel: string;
  samples: number;
  productCount: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgPrice: number;
  avgCommissionRate: number;
  /** Soft 0–100 fitness from logged metrics (experimental). */
  score: number;
  band: CategoryBand;
  confidence: CategoryConfidence;
  shareOfPosts: number;
  tip: string;
}

export interface CategoryFitSuggestion {
  scheduleId: string;
  productId: string;
  productName: string;
  currentCategory: string;
  suggestedCategory: string;
  status: ScheduledPost["status"];
  channelLabel: string;
  reason: string;
  tip: string;
}

export interface CategoryFitAction {
  id: string;
  title: string;
  detail: string;
}

export interface CategoryFitLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: CategoryFitGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    categoriesWithData: number;
    unbalanced: boolean;
    suggestions: number;
    hot: number;
  };
  categories: CategoryFitRow[];
  mixTip: string;
  suggestions: CategoryFitSuggestion[];
  actions: CategoryFitAction[];
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

/** Normalize category keys so near-duplicates group together. */
export function normalizeCategory(raw: string | undefined | null): string {
  const t = (raw ?? "")
    .toLowerCase()
    .replace(/[\/_-]+/g, " ")
    // Keep letters, numbers, marks (Thai tone/vowel marks), and spaces.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || "uncategorized";
}

export function categoryLabel(key: string): string {
  if (key === "uncategorized") return "ยังไม่ระบุหมวด";
  // Prefer original casing for Thai (toUpperCase on Thai is a no-op / noisy).
  if (/[\u0E00-\u0E7F]/.test(key)) {
    return key
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
  }
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function confidenceOf(samples: number): CategoryConfidence {
  if (samples >= 4) return "solid";
  if (samples >= 2) return "ok";
  return "thin";
}

function scoreCategory(params: {
  samples: number;
  avgCommission: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  avgOrders: number;
  shareOfPosts: number;
  globalAvgCommission: number;
  avgPrice: number;
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

  // Soft impulse-buy nudge: mid prices often convert better in short-form.
  if (params.avgPrice > 0 && params.avgPrice <= 499) score += 4;
  else if (params.avgPrice > 1500) score -= 3;

  // Soft diversity: over-concentration risks spam feel / audience fatigue.
  if (params.shareOfPosts >= 0.7 && params.samples >= 3) {
    score -= 12;
  } else if (params.shareOfPosts >= 0.55 && params.samples >= 2) {
    score -= 6;
  }

  if (params.samples === 1) score *= 0.75;

  return Math.round(clamp(score, 0, 100));
}

function bandOf(score: number, samples: number): CategoryBand {
  if (samples === 0) return "no_data";
  if (score >= 65 && samples >= 2) return "hot";
  if (score >= 45) return "steady";
  return "cold";
}

function tipFor(row: Omit<CategoryFitRow, "tip">): string {
  if (row.samples === 0) {
    return "ยังไม่มีผลในหมวดนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)";
  }
  if (row.band === "hot") {
    return `หมวดนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมขายเพื่อไม่ให้ซ้ำ`;
  }
  if (row.band === "cold") {
    return `ผลเย็นในหมวดนี้ — ลองเปลี่ยน hook/มุม หรือพักหมวดชั่วคราวในรอบถัดไป`;
  }
  if (row.shareOfPosts >= 0.55) {
    return `ใช้หมวดนี้บ่อย (${Math.round(row.shareOfPosts * 100)}%) — กระจายไปหมวดอื่นเพื่อลดความซ้ำ`;
  }
  return `เก็บข้อมูลต่ออีก 1–2 โพสต์ในหมวดนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน`;
}

function labGrade(score: number, categoriesWithData: number): CategoryFitGrade {
  if (categoriesWithData === 0) return "D";
  if (score >= 75) return "A";
  if (score >= 58) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Build Category Fit Lab from manually logged post metrics.
 */
export function buildCategoryFitLab(
  db: Database,
  date: string,
  windowDays = 14,
): CategoryFitLab {
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

  const catalogCats = new Set(
    db.products.map((p) => normalizeCategory(p.category)),
  );
  for (const post of posted) {
    const product = productById.get(post.productId);
    catalogCats.add(normalizeCategory(product?.category));
  }

  const byCategory = new Map<string, ScheduledPost[]>();
  const productsByCategory = new Map<string, Set<string>>();
  for (const key of catalogCats) {
    byCategory.set(key, []);
    productsByCategory.set(key, new Set());
  }
  for (const p of db.products) {
    const key = normalizeCategory(p.category);
    productsByCategory.get(key)?.add(p.id);
  }

  for (const post of posted) {
    const product = productById.get(post.productId);
    const key = normalizeCategory(product?.category);
    const list = byCategory.get(key) ?? [];
    list.push(post);
    byCategory.set(key, list);
    const set = productsByCategory.get(key) ?? new Set();
    set.add(post.productId);
    productsByCategory.set(key, set);
  }

  const allCommissions = posted.map((p) => p.metrics!.commissionEarned);
  const globalAvgCommission = avg(allCommissions);

  const categories: CategoryFitRow[] = [...catalogCats]
    .map((category) => {
      const list = byCategory.get(category) ?? [];
      const samples = list.length;
      const productIds = productsByCategory.get(category) ?? new Set();
      const productsInCat = [...productIds]
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
        productsInCat.length > 0
          ? avg(productsInCat.map((p) => p.price))
          : 0;
      const avgCommissionRate =
        productsInCat.length > 0
          ? avg(productsInCat.map((p) => p.commissionRate))
          : 0;
      const score = scoreCategory({
        samples,
        avgCommission,
        avgCtr,
        avgOrdersPerClick,
        avgOrders,
        shareOfPosts,
        globalAvgCommission,
        avgPrice,
      });
      const confidence = confidenceOf(samples);
      const band = bandOf(score, samples);
      const row: Omit<CategoryFitRow, "tip"> = {
        category,
        categoryLabel: categoryLabel(category),
        samples,
        productCount: productIds.size,
        avgViews: round1(avgViews),
        avgClicks: round1(avgClicks),
        avgOrders: round2(avgOrders),
        avgCommission: round1(avgCommission),
        avgCtr: round2(avgCtr),
        avgOrdersPerClick: round2(avgOrdersPerClick),
        avgPrice: round1(avgPrice),
        avgCommissionRate: round1(avgCommissionRate),
        score,
        band,
        confidence,
        shareOfPosts: round2(shareOfPosts),
      };
      return { ...row, tip: tipFor(row) };
    })
    .sort((a, b) => b.score - a.score || b.samples - a.samples);

  const withData = categories.filter((c) => c.samples > 0);
  const hot = categories.filter((c) => c.band === "hot").length;
  const topShare = Math.max(0, ...categories.map((c) => c.shareOfPosts));
  const unbalanced = topShare >= 0.55 && posted.length >= 3;

  const scoredAvg =
    withData.length > 0 ? avg(withData.map((c) => c.score)) : 0;
  let labScore = Math.round(scoredAvg);
  if (withData.length >= 3) labScore = Math.min(100, labScore + 8);
  else if (withData.length === 1 && posted.length >= 3)
    labScore = Math.max(0, labScore - 10);
  if (unbalanced) labScore = Math.max(0, labScore - 8);
  labScore = clamp(labScore, 0, 100);
  const grade = labGrade(labScore, withData.length);

  const best = withData.find((c) => c.band === "hot") ?? withData[0];
  const cold = withData.filter((c) => c.band === "cold");

  const mixTip =
    posted.length === 0
      ? "ยังไม่มีเมตริกหมวดหมู่ — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์หมวด"
      : unbalanced && best
        ? `มิกซ์เอนไปหมวด ${best.categoryLabel} มาก — วันถัดไปลองสลับหมวดอื่น 1 ชิ้น (ทดลอง)`
        : best
          ? `หมวดเด่นช่วงนี้: ${best.categoryLabel} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้หมวดเดียว`
          : "เก็บผลต่ออีก 2–3 โพสต์ข้ามหมวดก่อนจัดอันดับมิกซ์";

  const todaySlots = db.schedule
    .filter(
      (s) =>
        s.date === date &&
        (s.status === "draft" || s.status === "approved"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const suggestions: CategoryFitSuggestion[] = [];
  const preferred =
    categories.find((c) => c.band === "hot") ??
    categories.find((c) => c.band === "steady" && c.samples > 0);

  for (const slot of todaySlots.slice(0, 6)) {
    const product = productById.get(slot.productId);
    if (!product || !preferred) continue;
    const currentKey = normalizeCategory(product.category);
    const currentRow = categories.find((c) => c.category === currentKey);
    const sameAsPreferred = currentKey === preferred.category;

    const currentCold =
      currentRow != null &&
      (currentRow.band === "cold" ||
        (currentRow.band === "no_data" && preferred.band === "hot"));

    if (currentCold && !sameAsPreferred) {
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentCategory: categoryLabel(currentKey),
        suggestedCategory: preferred.categoryLabel,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `${categoryLabel(currentKey)} เย็น/ข้อมูลน้อยกว่า · ${preferred.categoryLabel} ดูดีกว่าในหน้าต่างนี้ (ทดลอง)`,
        tip: "ไม่สลับสินค้าอัตโนมัติ — ถ้าจะเปลี่ยนหมวด ให้เลือกสินค้าใหม่ + สร้างแคปชัน + Approve ก่อนโพสต์มือ",
      });
    } else if (
      unbalanced &&
      sameAsPreferred &&
      cold[0] &&
      suggestions.length < 2
    ) {
      const alt =
        categories.find(
          (c) =>
            c.category !== currentKey &&
            (c.band === "steady" || c.band === "no_data"),
        ) ?? cold[0];
      suggestions.push({
        scheduleId: slot.id,
        productId: product.id,
        productName: product.name,
        currentCategory: categoryLabel(currentKey),
        suggestedCategory: alt.categoryLabel,
        status: slot.status,
        channelLabel: channelLabel(slot.channel),
        reason: `วันนี้ซ้อนหมวด ${categoryLabel(currentKey)} — ลองกระจายไป ${alt.categoryLabel} เพื่อลดความซ้ำ (ทดลอง)`,
        tip: "ระบบไม่เปลี่ยนสินค้าเอง — แก้ที่คิว/สินค้าแล้ว Approve ใหม่",
      });
    }
  }

  const actions: CategoryFitAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "need-metrics",
      title: "เริ่มเก็บผลรายหมวด",
      detail:
        "Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อหมวด",
    });
  }
  if (best && best.band === "hot") {
    actions.push({
      id: "lean-best",
      title: `เอียงทดลองไปหมวด ${best.categoryLabel}`,
      detail: `n=${best.samples} · คะแนนฟิต ~${best.score} — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์`,
    });
  }
  if (unbalanced) {
    actions.push({
      id: "diversify",
      title: "กระจายมิกซ์หมวดหมู่",
      detail:
        "หมวดเด่นกินสัดส่วนสูง — เพิ่ม draft คนละหมวด 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)",
    });
  }
  if (cold.length > 0) {
    actions.push({
      id: "review-cold",
      title: `ทบทวนหมวดเย็น: ${cold.map((c) => c.categoryLabel).join(", ")}`,
      detail: "เปลี่ยน hook/มุมขาย หรือพักหมวดนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม",
    });
  }
  actions.push({
    id: "compliance",
    title: "คงกฎ Approve + disclosure",
    detail:
      "ทุกหมวดต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ",
  });

  const summary =
    posted.length === 0
      ? "Category Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับหมวด"
      : `Category Fit Lab: ${posted.length} โพสต์มีเมตริก · หมวดที่มีข้อมูล ${withData.length} · ร้อน ${hot}${
          unbalanced ? " · มิกซ์เอนข้างเดียว" : ""
        }`;

  const checklist = [
    "อันดับหมวดมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม",
    "คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม",
    "คำแนะนำสลับหมวดเป็นคำแนะนำเท่านั้น — ต้องเลือกสินค้า + Approve เอง",
    "อย่าถล่มหมวดเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)",
    "ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง",
  ];

  const lines: string[] = [
    `Category Fit Lab ${date}: เกรด ${grade} (${labScore}/100) · ${summary}`,
    mixTip,
  ];
  for (const c of withData.slice(0, 3)) {
    lines.push(
      `${BAND_LABEL[c.band]} · ${c.categoryLabel}: คะแนน ${c.score} (${CONF_LABEL[c.confidence]}, n=${c.samples}, CTR ~${round1(c.avgCtr * 100)}%)`,
    );
  }
  for (const s of suggestions.slice(0, 2)) {
    lines.push(
      `แนะนำทดลอง · ${s.productName}: ${s.currentCategory} → ${s.suggestedCategory}`,
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
      categoriesWithData: withData.length,
      unbalanced,
      suggestions: suggestions.length,
      hot,
    },
    categories,
    mixTip,
    suggestions: suggestions.slice(0, 5),
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function categoryFitLabLines(lab: CategoryFitLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function categoryFitLabToMarkdown(lab: CategoryFitLab): string {
  const categoryRows = lab.categories
    .filter((c) => c.samples > 0 || c.productCount > 0)
    .map(
      (c, idx) =>
        `${idx + 1}. **[${BAND_LABEL[c.band]}]** ${c.categoryLabel} · คะแนน ${c.score}/100 · n=${c.samples} · ${CONF_LABEL[c.confidence]}\n` +
        `   สินค้าในแคตตาล็อก ${c.productCount} · ราคาเฉลี่ย ฿${c.avgPrice} · คอมฯ ~${c.avgCommissionRate}%\n` +
        `   CTR ~${round1(c.avgCtr * 100)}% · ออเดอร์/คลิก ~${c.avgOrdersPerClick} · ค่าคอมเฉลี่ย ฿${c.avgCommission}\n` +
        `   สัดส่วนในหน้าต่าง ~${Math.round(c.shareOfPosts * 100)}%\n` +
        `   ${c.tip}`,
    );

  const suggestionRows = lab.suggestions.map(
    (s, idx) =>
      `${idx + 1}. ${s.productName} · ${s.status} · ${s.channelLabel}\n` +
      `   ${s.currentCategory} → **${s.suggestedCategory}**\n` +
      `   ${s.reason}\n` +
      `   ${s.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Category Fit Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- หมวดที่มีข้อมูล: ${lab.counts.categoriesWithData}`,
    `- หมวดร้อน: ${lab.counts.hot}`,
    `- มิกซ์เอนข้างเดียว: ${lab.counts.unbalanced ? "ใช่" : "ไม่"}`,
    "",
    "## มิกซ์ทิป",
    lab.mixTip,
    "",
    "## อันดับหมวดหมู่ (ทดลอง)",
    ...(categoryRows.length ? categoryRows : ["_(ยังไม่มีข้อมูล)_"]),
    "",
    "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)",
    ...(suggestionRows.length
      ? suggestionRows
      : ["_(ไม่มีคำแนะนำสลับหมวดวันนี้)_"]),
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
