import type { Product, ScheduledPost } from "./types";

export interface WeeklyProductRollup {
  productId: string;
  productName: string;
  posts: number;
  views: number;
  clicks: number;
  orders: number;
  commission: number;
  avgCtr: number;
  /** Experimental composite — not guaranteed income. */
  score: number;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Aggregate manual metrics for the last `windowDays` (inclusive of asOf). */
export function weeklyProductRollup(
  products: Product[],
  schedule: ScheduledPost[],
  asOf: string,
  windowDays = 7,
): WeeklyProductRollup[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const buckets = new Map<
    string,
    {
      posts: number;
      views: number;
      clicks: number;
      orders: number;
      commission: number;
      ctrSum: number;
    }
  >();

  for (const post of schedule) {
    if (!post.metrics) continue;
    const gap = daysBetween(post.date, asOf);
    if (gap < 0 || gap > windowDays - 1) continue;

    const m = post.metrics;
    const views = Math.max(m.views, 0);
    const clicks = Math.max(m.clicks, 0);
    const cur = buckets.get(post.productId) ?? {
      posts: 0,
      views: 0,
      clicks: 0,
      orders: 0,
      commission: 0,
      ctrSum: 0,
    };
    cur.posts += 1;
    cur.views += views;
    cur.clicks += clicks;
    cur.orders += Math.max(m.orders, 0);
    cur.commission += Math.max(m.commissionEarned, 0);
    cur.ctrSum += views > 0 ? clicks / views : 0;
    buckets.set(post.productId, cur);
  }

  const rows: WeeklyProductRollup[] = [];
  for (const [productId, b] of buckets) {
    const avgCtr = b.posts > 0 ? b.ctrSum / b.posts : 0;
    const cvr = b.clicks > 0 ? b.orders / b.clicks : 0;
    const score =
      avgCtr * 40 +
      cvr * 30 +
      Math.min(b.commission / 200, 1) * 30;
    rows.push({
      productId,
      productName: byId.get(productId)?.name ?? productId,
      posts: b.posts,
      views: b.views,
      clicks: b.clicks,
      orders: b.orders,
      commission: b.commission,
      avgCtr,
      score,
    });
  }

  return rows.sort((a, b) => b.score - a.score);
}

export function weeklyInsightLines(
  rollup: WeeklyProductRollup[],
): string[] {
  if (rollup.length === 0) {
    return [
      "สัปดาห์นี้ยังไม่มีเมตริกครบ — กรอกผลหลังโพสต์เพื่อให้จัดอันดับจากข้อมูลจริงได้",
    ];
  }
  const top = rollup[0];
  const lines = [
    `7 วันล่าสุด: “${top.productName}” คะแนนทดลองสูงสุด (CTR เฉลี่ย ~${(top.avgCtr * 100).toFixed(1)}% · ค่าคอมที่กรอก ฿${top.commission.toLocaleString("th-TH")})`,
  ];
  if (rollup.length >= 2) {
    const weak = rollup[rollup.length - 1];
    if (weak.productId !== top.productId) {
      lines.push(
        `สินค้ารองลงมาในชุดข้อมูล: ${weak.productName} — ลองเปลี่ยน hook/มุมใช้งานจริงแทนการโพสต์ซ้ำ`,
      );
    }
  }
  lines.push(
    "ตัวเลขสัปดาห์เป็นโหมดทดลองจากข้อมูลที่คุณกรอก ไม่ใช่การันตีรายได้",
  );
  return lines;
}
