/**
 * Weekly Review Brief — rolling 7-day retrospective from manual metrics.
 * Soft experimental insights only; never auto-publishes or claims guaranteed income.
 */

import { analyzePosted } from "./analytics";
import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type { ContentChannel, Database, ScheduledPost } from "./types";
import { weeklyProductRollup } from "./weekly";

export interface WeeklyReviewTotals {
  scheduled: number;
  posted: number;
  withMetrics: number;
  missingMetrics: number;
  views: number;
  clicks: number;
  orders: number;
  commission: number;
  promoSpend: number;
  avgCtr: number;
  /** True ROI only when promoSpend > 0; otherwise null. */
  roi: number | null;
}

export interface WeeklyReviewPostHighlight {
  scheduleId: string;
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabel: string;
  date: string;
  why: string;
  commission: number;
  orders: number;
  ctr: number;
  score: number;
}

export interface WeeklyReviewChannelRow {
  channel: ContentChannel;
  label: string;
  posts: number;
  commission: number;
  orders: number;
  avgScore: number;
  tip: string;
}

export interface WeeklyReviewAction {
  id: string;
  title: string;
  detail: string;
}

export interface WeeklyReview {
  date: string;
  fromDate: string;
  windowDays: number;
  summary: string;
  totals: WeeklyReviewTotals;
  topPosts: WeeklyReviewPostHighlight[];
  weakPosts: WeeklyReviewPostHighlight[];
  channelMix: WeeklyReviewChannelRow[];
  productLeaders: Array<{
    productId: string;
    productName: string;
    commission: number;
    orders: number;
    posts: number;
  }>;
  dataGaps: string[];
  nextWeekFocus: WeeklyReviewAction[];
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

function postsInWindow(
  schedule: ScheduledPost[],
  date: string,
  windowDays: number,
): ScheduledPost[] {
  const from = ymdOffset(date, -(windowDays - 1));
  return schedule.filter((s) => s.date >= from && s.date <= date);
}

function highlightFromPerf(
  productName: string,
  score: number,
  ctr: number,
  commission: number,
  orders: number,
  post: ScheduledPost,
  why: string,
): WeeklyReviewPostHighlight {
  return {
    scheduleId: post.id,
    productId: post.productId,
    productName,
    channel: post.channel,
    channelLabel: channelLabel(post.channel),
    date: post.date,
    why,
    commission,
    orders,
    ctr,
    score,
  };
}

/**
 * Build a rolling weekly retrospective from scheduled + manual metrics.
 */
export function buildWeeklyReview(
  db: Database,
  date: string,
  windowDays = 7,
): WeeklyReview {
  const window = Math.max(3, Math.min(14, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));
  const inWindow = postsInWindow(db.schedule, date, window);

  const posted = inWindow.filter((s) => s.status === "posted");
  const withMetrics = inWindow.filter((s) => s.metrics != null);
  const missingMetrics = posted.filter((s) => !s.metrics);

  const analysis = analyzePosted(withMetrics, db.products);
  const weekly = weeklyProductRollup(db.products, db.schedule, date, window);

  let views = 0;
  let clicks = 0;
  let orders = 0;
  let commission = 0;
  let promoSpend = 0;
  let ctrSum = 0;
  for (const p of withMetrics) {
    const m = p.metrics!;
    const v = Math.max(m.views, 0);
    const c = Math.max(m.clicks, 0);
    views += v;
    clicks += c;
    orders += Math.max(m.orders, 0);
    commission += Math.max(m.commissionEarned, 0);
    promoSpend += Math.max(m.promoSpend ?? 0, 0);
    ctrSum += v > 0 ? c / v : 0;
  }
  const avgCtr = withMetrics.length > 0 ? ctrSum / withMetrics.length : 0;
  const roi =
    promoSpend > 0 ? (commission - promoSpend) / promoSpend : null;

  const totals: WeeklyReviewTotals = {
    scheduled: inWindow.length,
    posted: posted.length,
    withMetrics: withMetrics.length,
    missingMetrics: missingMetrics.length,
    views,
    clicks,
    orders,
    commission,
    promoSpend,
    avgCtr,
    roi,
  };

  const topPosts: WeeklyReviewPostHighlight[] = analysis.performances
    .slice(0, 3)
    .map((p) =>
      highlightFromPerf(
        p.productName,
        p.score,
        p.ctr,
        p.commission,
        p.post.metrics?.orders ?? 0,
        p.post,
        [
          `${channelLabel(p.post.channel)} · ${p.post.date}`,
          `CTR ~${(p.ctr * 100).toFixed(1)}%`,
          p.commission > 0
            ? `ค่าคอมที่กรอก ฿${p.commission.toLocaleString("th-TH")}`
            : "ยังไม่มีค่าคอม",
          (p.post.metrics?.orders ?? 0) > 0
            ? `ออเดอร์ ${p.post.metrics?.orders}`
            : "ยังไม่มีออเดอร์",
        ].join(" · "),
      ),
    );

  const weakPosts: WeeklyReviewPostHighlight[] = [...analysis.performances]
    .reverse()
    .filter((p) => p.commission <= 0 && (p.post.metrics?.orders ?? 0) === 0)
    .slice(0, 3)
    .map((p) =>
      highlightFromPerf(
        p.productName,
        p.score,
        p.ctr,
        p.commission,
        0,
        p.post,
        `คะแนนอ่อน · CTR ~${(p.ctr * 100).toFixed(1)}% — พิจารณาเปลี่ยน hook/มุมขาย ไม่ต้องเพิ่มความถี่`,
      ),
    );

  const byChannel = new Map<
    ContentChannel,
    { n: number; score: number; commission: number; orders: number }
  >();
  for (const p of analysis.performances) {
    const cur = byChannel.get(p.post.channel) ?? {
      n: 0,
      score: 0,
      commission: 0,
      orders: 0,
    };
    cur.n += 1;
    cur.score += p.score;
    cur.commission += p.commission;
    cur.orders += p.post.metrics?.orders ?? 0;
    byChannel.set(p.post.channel, cur);
  }
  const rankedChannels = [...byChannel.entries()].sort(
    (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
  );
  const channelMix: WeeklyReviewChannelRow[] = rankedChannels.map(
    ([channel, row], idx) => {
      const avgScore = row.score / Math.max(row.n, 1);
      let tip = "รักษาคุณภาพแคปชัน + disclosure ทุกครั้ง";
      if (idx === 0 && rankedChannels.length > 1) {
        tip = "ช่องนี้คะแนนเฉลี่ยดีกว่าในสัปดาห์นี้ — จัดสล็อตคุณภาพก่อน (ทดลอง)";
      } else if (
        idx === rankedChannels.length - 1 &&
        rankedChannels.length > 1
      ) {
        tip = "อ่อนกว่าช่องอื่น — ปรับ hook/CTA ก่อนเพิ่มรอบ (ห้ามสแปม)";
      }
      return {
        channel,
        label: channelLabel(channel),
        posts: row.n,
        commission: row.commission,
        orders: row.orders,
        avgScore,
        tip,
      };
    },
  );

  const productLeaders = weekly.slice(0, 3).map((r) => ({
    productId: r.productId,
    productName: r.productName,
    commission: r.commission,
    orders: r.orders,
    posts: r.posts,
  }));

  const dataGaps: string[] = [];
  if (inWindow.length === 0) {
    dataGaps.push(
      "ยังไม่มีโพสต์ในหน้าต่างนี้ — รัน Morning แล้ว Approve ก่อนโพสต์มือ",
    );
  }
  if (missingMetrics.length > 0) {
    dataGaps.push(
      `โพสต์ที่ mark แล้วแต่ยังไม่กรอกผล ${missingMetrics.length} ชิ้น — กรอก views/clicks/orders/ค่าคอมที่ /results`,
    );
  }
  if (withMetrics.length === 0 && posted.length > 0) {
    dataGaps.push(
      "มีโพสต์แล้วแต่ยังไม่มีเมตริก — Weekly Review จะแม่นขึ้นหลังกรอกผล",
    );
  }
  if (withMetrics.length > 0 && withMetrics.length < 3) {
    dataGaps.push(
      `ตัวอย่างเมตริกยังน้อย (n=${withMetrics.length}) — อ่านแนวโน้มเบา ๆ อย่าสรุปหนัก`,
    );
  }
  const activeProducts = db.products.filter((p) => p.active !== false);
  if (activeProducts.length < 3) {
    dataGaps.push(
      "สินค้าที่ใช้งานน้อยกว่า 3 — เพิ่มรายการ manual เพื่อกระจายการทดลอง",
    );
  }
  if (dataGaps.length === 0) {
    dataGaps.push(
      "ข้อมูลครบพอสำหรับรีวิวสัปดาห์นี้ — ใช้เป็นสมมติฐานทดสอบ ไม่การันตีรายได้",
    );
  }

  const nextWeekFocus: WeeklyReviewAction[] = [];
  if (productLeaders[0]) {
    nextWeekFocus.push({
      id: "double-down",
      title: `ต่อยอด “${productLeaders[0].productName}” ด้วย hook ใหม่`,
      detail:
        "Approve draft คนละ hook จากเดิม 1 ชิ้น แล้วกรอกผล — อย่าโพสต์ซ้ำแคปชันเดิม",
    });
  }
  if (weakPosts[0]) {
    nextWeekFocus.push({
      id: "rescue-or-pause",
      title: `ทบทวน “${weakPosts[0].productName}”`,
      detail:
        "เปลี่ยน pain point/มุมขาย หรือพักเองชั่วคราว — ระบบไม่พักอัตโนมัติ",
    });
  }
  if (channelMix[0] && channelMix.length > 1) {
    nextWeekFocus.push({
      id: "channel-quality",
      title: `โฟกัสคุณภาพที่ ${channelMix[0].label}`,
      detail:
        "จัด 1–2 สล็อตคุณภาพ/วัน ไม่เพิ่มความถี่เกิน maxPostsPerDay",
    });
  }
  if (missingMetrics.length > 0) {
    nextWeekFocus.push({
      id: "close-metrics",
      title: "ปิดช่องว่างเมตริกก่อนขยาย",
      detail: `กรอกผลที่ขาด ${missingMetrics.length} ชิ้นก่อนสรุป keep/stop รอบใหม่`,
    });
  }
  if (nextWeekFocus.length === 0) {
    nextWeekFocus.push({
      id: "baseline",
      title: "เก็บ baseline คุณภาพก่อนขยาย",
      detail:
        "Morning → Approve 1–2 draft → โพสต์มือ + disclosure → กรอกผลเย็น",
    });
  }

  const checklist = [
    "ตรวจ disclosure ทุกแคปชันก่อน Approve",
    "โพสต์ด้วยมือหลัง Approve เท่านั้น — ระบบไม่โพสต์ให้อัตโนมัติ",
    "อย่าโพสต์ซ้ำข้อความเดิมในวันเดียว",
    "กรอก views/clicks/orders/ค่าคอมหลังโพสต์เพื่ออัปเดต Weekly Review",
    "ใช้ตัวเลขเป็นสมมติฐานทดลอง — ไม่การันตีรายได้",
  ];

  const summary =
    withMetrics.length === 0
      ? `Weekly Review ${date}: ยังไม่มีเมตริกใน ${window} วัน (${fromDate}–${date}) — เก็บผลจริงก่อนสรุป`
      : `Weekly Review ${date}: ${withMetrics.length} โพสต์มีเมตริก · ค่าคอมที่กรอก ฿${commission.toLocaleString("th-TH")} · ออเดอร์ ${orders} · CTR เฉลี่ย ~${(avgCtr * 100).toFixed(1)}% (ทดลอง ไม่การันตี)`;

  const lines: string[] = [`Weekly Review ${date}: ${summary}`];
  if (productLeaders[0]) {
    lines.push(
      `สินค้าเด่นสัปดาห์นี้: ${productLeaders[0].productName} · ค่าคอมที่กรอก ฿${productLeaders[0].commission.toLocaleString("th-TH")} · ออเดอร์ ${productLeaders[0].orders}`,
    );
  }
  if (topPosts[0]) {
    lines.push(
      `โพสต์เด่น: ${topPosts[0].productName} @ ${topPosts[0].channelLabel} — ${topPosts[0].why}`,
    );
  }
  if (channelMix[0]) {
    lines.push(
      `ช่องทางเด่น: ${channelMix[0].label} (n=${channelMix[0].posts}) — ${channelMix[0].tip}`,
    );
  }
  if (missingMetrics.length > 0) {
    lines.push(
      `ช่องว่างข้อมูล: รอกรอกผล ${missingMetrics.length} ชิ้นที่ /results`,
    );
  }
  for (const a of nextWeekFocus.slice(0, 2)) {
    lines.push(`โฟกัสสัปดาห์หน้า: ${a.title}`);
  }
  lines.push(
    "Weekly Review อ่านจากเมตริกที่กรอกเอง — ไม่โพสต์อัตโนมัติและไม่การันตีรายได้",
  );

  return {
    date,
    fromDate,
    windowDays: window,
    summary,
    totals,
    topPosts,
    weakPosts,
    channelMix,
    productLeaders,
    dataGaps,
    nextWeekFocus: nextWeekFocus.slice(0, 4),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function weeklyReviewLines(
  review: WeeklyReview,
  limit = 6,
): string[] {
  return review.lines.slice(0, limit);
}

export function weeklyReviewToMarkdown(review: WeeklyReview): string {
  const totals = review.totals;
  const top =
    review.topPosts.length === 0
      ? "- ยังไม่มีโพสต์เด่น"
      : review.topPosts
          .map(
            (p, i) =>
              `${i + 1}. **${p.productName}** (${p.channelLabel} · ${p.date}) — ${p.why}`,
          )
          .join("\n");
  const weak =
    review.weakPosts.length === 0
      ? "- ยังไม่มีโพสต์อ่อนชัดเจน"
      : review.weakPosts
          .map(
            (p, i) =>
              `${i + 1}. **${p.productName}** (${p.channelLabel} · ${p.date}) — ${p.why}`,
          )
          .join("\n");
  const channels =
    review.channelMix.length === 0
      ? "- ยังไม่พอข้อมูลช่องทาง"
      : review.channelMix
          .map(
            (c) =>
              `- **${c.label}** · n=${c.posts} · ค่าคอม ฿${c.commission.toLocaleString("th-TH")} · ออเดอร์ ${c.orders} — ${c.tip}`,
          )
          .join("\n");
  const leaders =
    review.productLeaders.length === 0
      ? "- ยังไม่มีสินค้าเด่น"
      : review.productLeaders
          .map(
            (p, i) =>
              `${i + 1}. **${p.productName}** · โพสต์ ${p.posts} · ออเดอร์ ${p.orders} · ค่าคอม ฿${p.commission.toLocaleString("th-TH")}`,
          )
          .join("\n");
  const focus = review.nextWeekFocus
    .map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`)
    .join("\n");
  const gaps = review.dataGaps.map((g) => `- ${g}`).join("\n");
  const checklist = review.checklist.map((c) => `- [ ] ${c}`).join("\n");
  const roiLine =
    totals.roi != null
      ? `ROI (เมื่อมี promoSpend): ${(totals.roi * 100).toFixed(1)}%`
      : "ROI: ยังไม่คำนวณ (ไม่มี promoSpend)";

  return (
    `# Weekly Review · ${review.date}\n\n` +
    `${review.summary}\n\n` +
    `หน้าต่าง: ${review.fromDate} → ${review.date} (${review.windowDays} วัน)\n\n` +
    `## สรุปตัวเลข (จากที่กรอกเอง)\n` +
    `- ตารางในหน้าต่าง: ${totals.scheduled}\n` +
    `- โพสต์แล้ว: ${totals.posted}\n` +
    `- มีเมตริก: ${totals.withMetrics}\n` +
    `- รอกรอกผล: ${totals.missingMetrics}\n` +
    `- Views: ${totals.views.toLocaleString("th-TH")}\n` +
    `- Clicks: ${totals.clicks.toLocaleString("th-TH")}\n` +
    `- Orders: ${totals.orders}\n` +
    `- ค่าคอมที่กรอก: ฿${totals.commission.toLocaleString("th-TH")}\n` +
    `- CTR เฉลี่ย: ~${(totals.avgCtr * 100).toFixed(1)}%\n` +
    `- ${roiLine}\n\n` +
    `## สินค้าเด่น\n${leaders}\n\n` +
    `## โพสต์เด่น\n${top}\n\n` +
    `## โพสต์ที่ควรทบทวน\n${weak}\n\n` +
    `## ช่องทาง\n${channels}\n\n` +
    `## ช่องว่างข้อมูล\n${gaps}\n\n` +
    `## โฟกัสสัปดาห์หน้า\n${focus}\n\n` +
    `## Checklist\n${checklist}\n\n` +
    `${review.disclaimer}\n` +
    `> ไม่โพสต์อัตโนมัติ — ต้อง Approve แล้วโพสต์ด้วยมือ\n`
  );
}
