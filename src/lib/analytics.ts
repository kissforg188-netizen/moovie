import { INCOME_DISCLAIMER } from "./disclosure";
import type { Product, ScheduledPost } from "./types";

export interface PostPerformance {
  post: ScheduledPost;
  productName: string;
  ctr: number;
  ordersPerClick: number;
  commission: number;
  /** Commission ÷ clicks — efficiency proxy, not ROI. */
  commissionPerClick: number;
  /**
   * @deprecated Alias of commissionPerClick (kept for older UI/tests).
   * Not true ROI — use `roi` when promoSpend is recorded.
   */
  roiPerClick: number;
  promoSpend: number;
  /**
   * True ROI when promoSpend > 0: (commission - spend) / spend.
   * null when no cost basis was recorded.
   */
  roi: number | null;
  score: number;
}

/** Soft signal: which hook/CTA index tended to score higher (experimental, small-n). */
function bestAngleInsight(
  performances: PostPerformance[],
  kind: "hook" | "cta",
): string | null {
  if (performances.length < 2) return null;
  const buckets = new Map<number, { n: number; score: number }>();
  for (const p of performances) {
    const idx = kind === "hook" ? p.post.hookIndex : p.post.ctaIndex;
    const cur = buckets.get(idx) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    buckets.set(idx, cur);
  }
  if (buckets.size < 2) return null;
  const ranked = [...buckets.entries()].sort(
    (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
  );
  const [bestIdx, best] = ranked[0];
  const label = kind === "hook" ? "hook" : "CTA";
  return `มุม${label} #${bestIdx + 1} ให้คะแนนเฉลี่ยดีกว่าในชุดข้อมูลวันนี้ (n=${best.n}) — ใช้เป็นสมมติฐานทดสอบ ไม่ใช่การันตี`;
}

export function analyzePosted(
  posts: ScheduledPost[],
  products: Product[],
): {
  performances: PostPerformance[];
  winners: PostPerformance[];
  recommendations: string[];
  summary: string;
  disclaimer: string;
  channelInsight: string;
} {
  const byId = new Map(products.map((p) => [p.id, p]));
  const withMetrics = posts.filter(
    (p) => (p.status === "posted" || p.metrics) && p.metrics,
  );

  const performances: PostPerformance[] = withMetrics.map((post) => {
    const m = post.metrics!;
    const views = Math.max(m.views, 0);
    const clicks = Math.max(m.clicks, 0);
    const orders = Math.max(m.orders, 0);
    const ctr = views > 0 ? clicks / views : 0;
    const ordersPerClick = clicks > 0 ? orders / clicks : 0;
    const commission = Math.max(m.commissionEarned, 0);
    const promoSpend = Math.max(m.promoSpend ?? 0, 0);
    const commissionPerClick = commission / Math.max(clicks, 1);
    const roi = promoSpend > 0 ? (commission - promoSpend) / promoSpend : null;
    const score =
      ctr * 40 +
      ordersPerClick * 30 +
      Math.min(commission / 100, 1) * 20 +
      (roi != null ? Math.max(-10, Math.min(10, roi * 10)) : Math.min(commissionPerClick, 10));
    return {
      post,
      productName: byId.get(post.productId)?.name ?? post.productId,
      ctr,
      ordersPerClick,
      commission,
      commissionPerClick,
      roiPerClick: commissionPerClick,
      promoSpend,
      roi,
      score,
    };
  });

  performances.sort((a, b) => b.score - a.score);
  const winners = performances.slice(0, 3);

  const byChannel = new Map<string, { n: number; score: number }>();
  for (const p of performances) {
    const cur = byChannel.get(p.post.channel) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    byChannel.set(p.post.channel, cur);
  }
  let channelInsight = "ยังไม่พอข้อมูลเปรียบเทียบช่องทาง";
  if (byChannel.size > 0) {
    const best = [...byChannel.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0];
    channelInsight = `ช่องทางที่คะแนนเฉลี่ยดีกว่าในชุดข้อมูลนี้: ${best[0]} (ทดลองจากข้อมูลที่กรอก ไม่การันตี)`;
  }

  /** Experimental: which hook/CTA indexes correlated with higher scores today. */
  const hookInsight = bestAngleInsight(performances, "hook");
  const ctaInsight = bestAngleInsight(performances, "cta");

  const recommendations: string[] = [];
  if (winners.length === 0) {
    recommendations.push(
      "ยังไม่มีข้อมูลโพสต์ที่บันทึกผล — วันนี้ลองโพสต์ draft ที่อนุมัติแล้ว 1–2 ชิ้น แล้วกรอกผลเย็นนี้",
    );
    recommendations.push(
      "โฟกัส hook ที่พูด pain point ชัด และปิดด้วย CTA อ่อนโยน + disclosure",
    );
  } else {
    const top = winners[0];
    const roiLabel =
      top.roi != null
        ? `ROI ~${(top.roi * 100).toFixed(0)}%`
        : `ค่าคอม/คลิก ~฿${top.commissionPerClick.toFixed(1)} (ยังไม่กรอกต้นทุนโปรโมท)`;
    recommendations.push(
      `โพสต์ที่เวิร์กสุดวันนี้: ${top.productName} (${top.post.channel}) — CTR ~${(top.ctr * 100).toFixed(1)}% · ${roiLabel}`,
    );
    const topProduct = byId.get(top.post.productId);
    if (topProduct) {
      recommendations.push(
        `วันพรุ่งนี้ลองมุมขายเดิมของ “${topProduct.name}” แต่เปลี่ยน hook ใหม่ 1 แบบ เพื่อทดสอบ`,
      );
    }
    if (hookInsight) recommendations.push(hookInsight);
    if (ctaInsight) recommendations.push(ctaInsight);
    const weak = [...performances].reverse()[0];
    if (weak && weak.post.id !== top.post.id) {
      recommendations.push(
        `โพสต์ที่อ่อนกว่า: ${weak.productName} — ลดการขายแข็ง เพิ่มตัวอย่างใช้งานจริง`,
      );
    }
    recommendations.push(channelInsight);
    const missingSpend = performances.filter((p) => p.promoSpend <= 0).length;
    if (missingSpend > 0) {
      recommendations.push(
        `${missingSpend} โพสต์ยังไม่มีต้นทุนโปรโมท (ads/ตัวอย่าง) — กรอกเพื่อคำนวณ ROI จริงได้`,
      );
    }
  }

  recommendations.push(
    "อย่าโพสต์ซ้ำข้อความเดิมหลายรอบในวันเดียว — คุณภาพสำคัญกว่ารอบโพสต์",
  );

  // Data gaps: posted without metrics — remind user to close the learning loop
  const postedBare = posts.filter(
    (p) => p.status === "posted" && !p.metrics,
  );
  if (postedBare.length > 0) {
    recommendations.push(
      `มี ${postedBare.length} โพสต์ที่ทำเครื่องหมายว่าโพสต์แล้วแต่ยังไม่กรอกเมตริก — กรอกคืนนี้เพื่อให้ Learning วันถัดไปแม่นขึ้น`,
    );
  }

  const totalCommission = performances.reduce((s, p) => s + p.commission, 0);
  const totalSpend = performances.reduce((s, p) => s + p.promoSpend, 0);
  const summary =
    withMetrics.length === 0
      ? "สรุปเย็น: ยังไม่มีเมตริกที่บันทึก ระบบยังอยู่ในโหมดทดลอง"
      : totalSpend > 0
        ? `สรุปเย็น: บันทึก ${withMetrics.length} โพสต์ ค่าคอม ฿${totalCommission.toLocaleString("th-TH")} · ต้นทุน ฿${totalSpend.toLocaleString("th-TH")} · ROI รวม ~${(((totalCommission - totalSpend) / totalSpend) * 100).toFixed(0)}% (ตัวเลขทดลองจากผู้ใช้ ไม่ใช่การันตีรายได้)`
        : `สรุปเย็น: บันทึก ${withMetrics.length} โพสต์ ค่าคอมรวมที่กรอก ฿${totalCommission.toLocaleString("th-TH")} (ยังไม่มีต้นทุนโปรโมท — ROI% คำนวณไม่ได้ · ไม่ใช่การันตีรายได้)`;

  return {
    performances,
    winners,
    recommendations,
    summary,
    disclaimer: INCOME_DISCLAIMER,
    channelInsight,
  };
}
