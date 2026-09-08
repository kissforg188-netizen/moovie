/**
 * Soft ROI Lab — experimental commission / efficiency ranges from logged metrics.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import { expectedCommissionBaht } from "./scoring";
import type {
  ContentChannel,
  Database,
  Product,
  ScheduledPost,
} from "./types";

export type RoiLabGrade = "A" | "B" | "C" | "D";
export type RoiConfidence = "thin" | "ok" | "solid";
export type RoiBand = "promising" | "watch" | "cold" | "no_data";

export interface RoiLabProductRow {
  productId: string;
  productName: string;
  platform: Product["platform"];
  samples: number;
  avgViews: number;
  avgClicks: number;
  avgOrders: number;
  avgCommission: number;
  /** Soft low / mid / high commission-per-post range (฿) — experimental. */
  rangeLow: number;
  rangeMid: number;
  rangeHigh: number;
  avgCtr: number;
  avgOrdersPerClick: number;
  /** True ROI average when promoSpend was logged; null if no cost basis. */
  avgRoi: number | null;
  spendSamples: number;
  catalogBaht: number;
  confidence: RoiConfidence;
  band: RoiBand;
  tip: string;
}

export interface RoiLabProjection {
  scheduleId: string;
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabel: string;
  status: ScheduledPost["status"];
  date: string;
  /** Soft projected commission mid (฿) for this slot — experimental. */
  projectedMid: number;
  projectedLow: number;
  projectedHigh: number;
  confidence: RoiConfidence;
  basis: string;
  tip: string;
}

export interface RoiLabAction {
  id: string;
  title: string;
  detail: string;
}

export interface SoftRoiLab {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: RoiLabGrade;
  score: number;
  summary: string;
  counts: {
    postsWithMetrics: number;
    productsWithData: number;
    spendTracked: number;
    promising: number;
    thin: number;
    projections: number;
  };
  baseline: {
    avgCtr: number;
    avgOrdersPerClick: number;
    avgCommissionPerPost: number;
    avgRoi: number | null;
  };
  products: RoiLabProductRow[];
  projections: RoiLabProjection[];
  actions: RoiLabAction[];
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

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function confidenceFor(n: number): RoiConfidence {
  if (n >= 5) return "solid";
  if (n >= 2) return "ok";
  return "thin";
}

function bandFor(row: {
  samples: number;
  rangeMid: number;
  avgRoi: number | null;
  avgCtr: number;
}): RoiBand {
  if (row.samples === 0) return "no_data";
  if (row.samples < 2) return "watch";
  const roiOk = row.avgRoi == null || row.avgRoi >= 0;
  if (row.rangeMid >= 30 && row.avgCtr >= 0.02 && roiOk) return "promising";
  if (row.rangeMid < 5 && row.avgCtr < 0.01) return "cold";
  return "watch";
}

function tipFor(row: RoiLabProductRow): string {
  if (row.band === "no_data") {
    return "ยังไม่มีเมตริก — Approve → โพสต์มือ 1–2 ชิ้น แล้วกรอกผลก่อนอ่านช่วงนี้";
  }
  if (row.confidence === "thin") {
    return `n=${row.samples} ยังบาง — ใช้ช่วง ฿${row.rangeLow}–${row.rangeHigh} เป็นสมมติฐานทดลองเท่านั้น`;
  }
  if (row.band === "promising") {
    return `ช่วงกลาง ~฿${row.rangeMid}/โพสต์ (ทดลอง) — ลองมุมเดิม + hook ใหม่ 1 แบบ`;
  }
  if (row.band === "cold") {
    return "สัญญาณอ่อน — พักหรือเปลี่ยนมุมขาย/ช่องทางก่อนลงแรงถ่าย";
  }
  if (row.avgRoi != null && row.avgRoi < 0) {
    return `ROI จากต้นทุนที่กรอกติดลบ (~${round1(row.avgRoi * 100)}%) — ลดสเปนหรือปรับคอนเทนต์`;
  }
  return `ติดตามต่อ — ช่วงทดลอง ฿${row.rangeLow}–${row.rangeHigh} · CTR ~${round1(row.avgCtr * 100)}%`;
}

function gradeFromScore(score: number): RoiLabGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

const CONF_LABEL: Record<RoiConfidence, string> = {
  thin: "ข้อมูลบาง",
  ok: "พอใช้",
  solid: "หนาขึ้น",
};

const BAND_LABEL: Record<RoiBand, string> = {
  promising: "น่าลอง",
  watch: "เฝ้าดู",
  cold: "อ่อน",
  no_data: "ยังไม่มีข้อมูล",
};

/**
 * Build Soft ROI Lab from manually logged post metrics.
 */
export function buildSoftRoiLab(
  db: Database,
  date: string,
  windowDays = 14,
): SoftRoiLab {
  const fromDate = ymdOffset(date, -(windowDays - 1));
  const productById = new Map(db.products.map((p) => [p.id, p]));

  const posted = db.schedule.filter((s) => {
    if (s.date < fromDate || s.date > date) return false;
    if (!s.metrics) return false;
    return s.status === "posted" || Boolean(s.metrics);
  });

  const commissions = posted.map((s) =>
    Math.max(0, s.metrics?.commissionEarned ?? 0),
  );
  const views = posted.map((s) => Math.max(0, s.metrics?.views ?? 0));
  const clicks = posted.map((s) => Math.max(0, s.metrics?.clicks ?? 0));
  const orders = posted.map((s) => Math.max(0, s.metrics?.orders ?? 0));

  const totalViews = views.reduce((a, b) => a + b, 0);
  const totalClicks = clicks.reduce((a, b) => a + b, 0);
  const totalOrders = orders.reduce((a, b) => a + b, 0);

  const baseline = {
    avgCtr: totalViews > 0 ? totalClicks / totalViews : 0,
    avgOrdersPerClick: totalClicks > 0 ? totalOrders / totalClicks : 0,
    avgCommissionPerPost: mean(commissions),
    avgRoi: null as number | null,
  };

  const roiSamples: number[] = [];
  for (const s of posted) {
    const m = s.metrics!;
    const spend = Math.max(0, m.promoSpend ?? 0);
    if (spend > 0) {
      roiSamples.push((Math.max(0, m.commissionEarned) - spend) / spend);
    }
  }
  if (roiSamples.length) {
    baseline.avgRoi = mean(roiSamples);
  }

  // Per-product aggregation
  const byProduct = new Map<
    string,
    {
      commissions: number[];
      views: number[];
      clicks: number[];
      orders: number[];
      rois: number[];
    }
  >();

  for (const s of posted) {
    const m = s.metrics!;
    const cur = byProduct.get(s.productId) ?? {
      commissions: [],
      views: [],
      clicks: [],
      orders: [],
      rois: [],
    };
    cur.commissions.push(Math.max(0, m.commissionEarned));
    cur.views.push(Math.max(0, m.views));
    cur.clicks.push(Math.max(0, m.clicks));
    cur.orders.push(Math.max(0, m.orders));
    const spend = Math.max(0, m.promoSpend ?? 0);
    if (spend > 0) {
      cur.rois.push((Math.max(0, m.commissionEarned) - spend) / spend);
    }
    byProduct.set(s.productId, cur);
  }

  const products: RoiLabProductRow[] = [];

  // Include active catalog products (even without data) for pipeline visibility
  const catalogIds = new Set([
    ...db.products.filter((p) => p.active !== false).map((p) => p.id),
    ...byProduct.keys(),
  ]);

  for (const productId of catalogIds) {
    const product = productById.get(productId);
    if (!product) continue;
    const agg = byProduct.get(productId);
    const samples = agg?.commissions.length ?? 0;
    const sorted = [...(agg?.commissions ?? [])].sort((a, b) => a - b);
    const avgCommission = mean(agg?.commissions ?? []);
    const rangeLow = samples
      ? round1(percentile(sorted, 0.25))
      : 0;
    const rangeMid = samples ? round1(percentile(sorted, 0.5)) : 0;
    const rangeHigh = samples
      ? round1(percentile(sorted, 0.75))
      : 0;
    const avgViews = mean(agg?.views ?? []);
    const avgClicks = mean(agg?.clicks ?? []);
    const avgOrders = mean(agg?.orders ?? []);
    const sumViews = (agg?.views ?? []).reduce((a, b) => a + b, 0);
    const sumClicks = (agg?.clicks ?? []).reduce((a, b) => a + b, 0);
    const sumOrders = (agg?.orders ?? []).reduce((a, b) => a + b, 0);
    const avgCtr = sumViews > 0 ? sumClicks / sumViews : 0;
    const avgOrdersPerClick = sumClicks > 0 ? sumOrders / sumClicks : 0;
    const avgRoi = agg?.rois.length ? mean(agg.rois) : null;
    const confidence = confidenceFor(samples);
    const catalogBaht = round1(
      expectedCommissionBaht(product.price, product.commissionRate),
    );
    const row: RoiLabProductRow = {
      productId,
      productName: product.name,
      platform: product.platform,
      samples,
      avgViews: round1(avgViews),
      avgClicks: round1(avgClicks),
      avgOrders: round1(avgOrders),
      avgCommission: round1(avgCommission),
      rangeLow,
      rangeMid,
      rangeHigh,
      avgCtr: round2(avgCtr),
      avgOrdersPerClick: round2(avgOrdersPerClick),
      avgRoi: avgRoi != null ? round2(avgRoi) : null,
      spendSamples: agg?.rois.length ?? 0,
      catalogBaht,
      confidence,
      band: "no_data",
      tip: "",
    };
    row.band = bandFor(row);
    row.tip = tipFor(row);
    products.push(row);
  }

  products.sort((a, b) => {
    const bandRank: Record<RoiBand, number> = {
      promising: 0,
      watch: 1,
      cold: 2,
      no_data: 3,
    };
    if (bandRank[a.band] !== bandRank[b.band]) {
      return bandRank[a.band] - bandRank[b.band];
    }
    // Prefer higher mid with confidence weight
    const aw =
      a.rangeMid *
      (a.confidence === "solid" ? 1.2 : a.confidence === "ok" ? 1 : 0.6);
    const bw =
      b.rangeMid *
      (b.confidence === "solid" ? 1.2 : b.confidence === "ok" ? 1 : 0.6);
    if (bw !== aw) return bw - aw;
    return b.catalogBaht - a.catalogBaht;
  });

  // Soft projections for today's draft/approved (not posted) using product history or baseline
  const todaySlots = db.schedule.filter(
    (s) =>
      s.date === date &&
      (s.status === "draft" || s.status === "approved"),
  );

  const projections: RoiLabProjection[] = todaySlots.map((s) => {
    const product = productById.get(s.productId);
    const hist = products.find((p) => p.productId === s.productId);
    const ch = channelLabel(s.channel);
    let projectedMid: number;
    let projectedLow: number;
    let projectedHigh: number;
    let confidence: RoiConfidence;
    let basis: string;

    if (hist && hist.samples >= 2) {
      projectedLow = hist.rangeLow;
      projectedMid = hist.rangeMid;
      projectedHigh = hist.rangeHigh;
      confidence = hist.confidence;
      basis = `จากประวัติ ${hist.samples} โพสต์ของสินค้านี้`;
    } else if (hist && hist.samples === 1) {
      projectedMid = hist.rangeMid;
      projectedLow = round1(hist.rangeMid * 0.5);
      projectedHigh = round1(hist.rangeMid * 1.5);
      confidence = "thin";
      basis = "จาก 1 โพสต์ก่อนหน้า (ช่วงกว้าง — ทดลอง)";
    } else if (baseline.avgCommissionPerPost > 0) {
      projectedMid = round1(baseline.avgCommissionPerPost);
      projectedLow = round1(baseline.avgCommissionPerPost * 0.4);
      projectedHigh = round1(baseline.avgCommissionPerPost * 1.6);
      confidence = confidenceFor(posted.length);
      basis = `จากค่าเฉลี่ยทั้งแล็บ (${posted.length} โพสต์ในหน้าต่าง)`;
    } else {
      const catalog = product
        ? expectedCommissionBaht(product.price, product.commissionRate)
        : 0;
      // Catalog baht is per-sale, not per-post — soft dampen as experiment prior
      projectedMid = round1(catalog * 0.3);
      projectedLow = 0;
      projectedHigh = round1(catalog * 0.8);
      confidence = "thin";
      basis = "ยังไม่มีเมตริก — ใช้ค่าคอมแคตตาล็อกแบบลดน้ำหนัก (prior ทดลอง)";
    }

    const tip =
      s.status === "draft"
        ? "ยังเป็น draft — ตรวจ disclosure แล้ว Approve ก่อนโพสต์มือ"
        : "Approve แล้ว — คัดลอก Posting Pack ไปโพสต์ด้วยมือ แล้ว Mark posted + กรอกผล";

    return {
      scheduleId: s.id,
      productId: s.productId,
      productName: product?.name ?? s.productId,
      channel: s.channel,
      channelLabel: ch,
      status: s.status,
      date: s.date,
      projectedMid,
      projectedLow,
      projectedHigh,
      confidence,
      basis,
      tip,
    };
  });

  projections.sort((a, b) => b.projectedMid - a.projectedMid);

  const promising = products.filter((p) => p.band === "promising").length;
  const thin = products.filter(
    (p) => p.samples > 0 && p.confidence === "thin",
  ).length;
  const withData = products.filter((p) => p.samples > 0).length;

  // Lab health score — data quality, not income
  let score = 35;
  score += Math.min(25, posted.length * 4);
  score += Math.min(15, withData * 3);
  score += Math.min(10, promising * 5);
  score += Math.min(10, roiSamples.length * 3);
  if (posted.length === 0) score = Math.min(score, 40);
  if (baseline.avgRoi != null && baseline.avgRoi < 0) score -= 8;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const grade = gradeFromScore(score);

  const summary =
    posted.length === 0
      ? "Soft ROI Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อน ช่วงคาดการณ์ยังเป็น prior ทดลอง"
      : `Soft ROI Lab: ${posted.length} โพสต์มีเมตริก · สินค้าที่มีข้อมูล ${withData} · ช่วงค่าคอมเฉลี่ย/โพสต์ ~฿${round1(baseline.avgCommissionPerPost)} (ทดลอง ไม่การันตี)`;

  const actions: RoiLabAction[] = [];
  if (posted.length === 0) {
    actions.push({
      id: "fill-first",
      title: "กรอกผลโพสต์แรก",
      detail:
        "Approve → โพสต์มือ → Mark posted → กรอก views/clicks/orders/ค่าคอม ที่ /results",
    });
  } else {
    actions.push({
      id: "log-spend",
      title: "บันทึกต้นทุนโปรโมทเมื่อมี",
      detail:
        "ใส่ promoSpend ในเมตริกเพื่อคำนวณ ROI% จริง — ถ้าไม่กรอก ระบบจะไม่เคลม ROI",
    });
  }
  if (promising > 0) {
    actions.push({
      id: "test-promising",
      title: "ทดลองสินค้ากลุ่มน่าลอง",
      detail: `มี ${promising} ชิ้นสัญญาณดี — ใช้ hook ใหม่ 1 แบบต่อชิ้น ไม่สแปมข้อความเดิม`,
    });
  }
  if (thin > 0) {
    actions.push({
      id: "thicken-data",
      title: "เพิ่มตัวอย่างก่อนสรุป",
      detail: `${thin} สินค้าข้อมูลยังบาง — อ่านช่วงค่าคอมแบบสมมติฐาน ไม่ใช่เป้าขาย`,
    });
  }
  actions.push({
    id: "no-guarantee",
    title: "ไม่ใช้ตัวเลขนี้การันตีรายได้",
    detail: INCOME_DISCLAIMER,
  });

  const checklist = [
    "ทุกตัวเลขในแล็บมาจากเมตริกที่คุณกรอกเอง — ไม่ดึงจาก API แพลตฟอร์ม",
    "ช่วง low/mid/high เป็นค่าทดลอง (percentile) ไม่ใช่คำสัญญา",
    "ROI% คำนวณเฉพาะโพสต์ที่มี promoSpend > 0",
    "โพสต์จริงต้องมี disclosure และต้อง Approve ก่อน — ระบบไม่โพสต์อัตโนมัติ",
    "ถ้าข้อมูลบาง (n<2) ให้ทดลองต่อ ไม่ล็อคมุมขาย",
  ];

  const lines: string[] = [
    `Soft ROI Lab ${date}: เกรด ${grade} (${score}/100) · ${summary}`,
  ];
  if (baseline.avgRoi != null) {
    lines.push(
      `ROI เฉลี่ยจากต้นทุนที่กรอก ~${round1(baseline.avgRoi * 100)}% (n=${roiSamples.length}) — ทดลอง`,
    );
  } else if (posted.length > 0) {
    lines.push(
      "ยังไม่มี promoSpend — ยังคำนวณ ROI% ไม่ได้ (แสดงแค่ช่วงค่าคอม/โพสต์)",
    );
  }
  for (const p of products.filter((x) => x.samples > 0).slice(0, 3)) {
    lines.push(
      `${BAND_LABEL[p.band]} · ${p.productName}: ฿${p.rangeLow}–${p.rangeHigh}/โพสต์ (${CONF_LABEL[p.confidence]}, n=${p.samples})`,
    );
  }
  for (const pr of projections.slice(0, 2)) {
    lines.push(
      `คาดการณ์ทดลองวันนี้ · ${pr.productName} (${pr.channelLabel}): ~฿${pr.projectedMid} [${pr.projectedLow}–${pr.projectedHigh}]`,
    );
  }
  lines.push(INCOME_DISCLAIMER);

  return {
    date,
    fromDate,
    windowDays,
    grade,
    score,
    summary,
    counts: {
      postsWithMetrics: posted.length,
      productsWithData: withData,
      spendTracked: roiSamples.length,
      promising,
      thin,
      projections: projections.length,
    },
    baseline: {
      avgCtr: round2(baseline.avgCtr),
      avgOrdersPerClick: round2(baseline.avgOrdersPerClick),
      avgCommissionPerPost: round1(baseline.avgCommissionPerPost),
      avgRoi: baseline.avgRoi != null ? round2(baseline.avgRoi) : null,
    },
    products,
    projections,
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function softRoiLabLines(lab: SoftRoiLab, limit = 6): string[] {
  return lab.lines.slice(0, Math.max(1, limit));
}

export function softRoiLabToMarkdown(lab: SoftRoiLab): string {
  const productRows = lab.products
    .filter((p) => p.samples > 0)
    .map(
      (p, idx) =>
        `${idx + 1}. **[${BAND_LABEL[p.band]}]** ${p.productName} · n=${p.samples} · ${CONF_LABEL[p.confidence]}\n` +
        `   ช่วงค่าคอม/โพสต์ (ทดลอง): ฿${p.rangeLow} – ฿${p.rangeMid} – ฿${p.rangeHigh}\n` +
        `   CTR ~${round1(p.avgCtr * 100)}% · ออเดอร์/คลิก ~${round2(p.avgOrdersPerClick)}` +
        (p.avgRoi != null
          ? ` · ROI ~${round1(p.avgRoi * 100)}% (มีต้นทุน)`
          : " · ยังไม่มี ROI% (ไม่กรอกต้นทุน)") +
        `\n   ${p.tip}`,
    );

  const projectionRows = lab.projections.map(
    (p, idx) =>
      `${idx + 1}. ${p.productName} · ${p.channelLabel} · ${p.status}\n` +
      `   คาดการณ์ทดลอง: ~฿${p.projectedMid} [${p.projectedLow}–${p.projectedHigh}] (${CONF_LABEL[p.confidence]})\n` +
      `   ฐาน: ${p.basis}\n` +
      `   ${p.tip}`,
  );

  const actionLines = lab.actions.map((a) => `- **${a.title}**: ${a.detail}`);

  return [
    `# Soft ROI Lab · ${lab.date}`,
    "",
    lab.summary,
    "",
    `- เกรดแล็บ: ${lab.grade} (${lab.score}/100)`,
    `- หน้าต่าง: ${lab.fromDate} → ${lab.date} (${lab.windowDays} วัน)`,
    `- โพสต์มีเมตริก: ${lab.counts.postsWithMetrics}`,
    `- สินค้าที่มีข้อมูล: ${lab.counts.productsWithData}`,
    `- มีต้นทุนโปรโมท: ${lab.counts.spendTracked}`,
    `- CTR เฉลี่ย: ~${round1(lab.baseline.avgCtr * 100)}%`,
    `- ค่าคอมเฉลี่ย/โพสต์: ~฿${lab.baseline.avgCommissionPerPost}`,
    lab.baseline.avgRoi != null
      ? `- ROI เฉลี่ย (มีต้นทุน): ~${round1(lab.baseline.avgRoi * 100)}%`
      : `- ROI%: ยังคำนวณไม่ได้ (ยังไม่กรอก promoSpend)`,
    "",
    "## สินค้าในช่วงทดลอง",
    ...(productRows.length
      ? productRows
      : ["_(ยังไม่มีเมตริก — กรอกผลหลังโพสต์มือ)_"]),
    "",
    "## คาดการณ์คิววันนี้ (ทดลอง)",
    ...(projectionRows.length
      ? projectionRows
      : ["_(ไม่มี draft/approved วันนี้)_"]),
    "",
    "## Actions",
    ...actionLines,
    "",
    "## Checklist",
    ...lab.checklist.map((c) => `- ${c}`),
    "",
    "> ตัวเลขทั้งหมดเป็นการทดลองจากข้อมูลที่กรอก — ไม่รับประกันรายได้ และระบบไม่โพสต์อัตโนมัติ",
    "",
    lab.disclaimer,
    "",
  ].join("\n");
}
