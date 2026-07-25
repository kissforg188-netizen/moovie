import { INCOME_DISCLAIMER } from "./disclosure";
import type { Product, ScheduledPost } from "./types";

export interface PostPerformance {
  post: ScheduledPost;
  productName: string;
  ctr: number;
  ordersPerClick: number;
  commission: number;
  score: number;
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
} {
  const byId = new Map(products.map((p) => [p.id, p]));
  const withMetrics = posts.filter(
    (p) => p.status === "posted" && p.metrics,
  );

  const performances: PostPerformance[] = withMetrics.map((post) => {
    const m = post.metrics!;
    const views = Math.max(m.views, 0);
    const clicks = Math.max(m.clicks, 0);
    const orders = Math.max(m.orders, 0);
    const ctr = views > 0 ? clicks / views : 0;
    const ordersPerClick = clicks > 0 ? orders / clicks : 0;
    const commission = Math.max(m.commissionEarned, 0);
    const score =
      ctr * 40 + ordersPerClick * 30 + Math.min(commission / 100, 1) * 30;
    return {
      post,
      productName: byId.get(post.productId)?.name ?? post.productId,
      ctr,
      ordersPerClick,
      commission,
      score,
    };
  });

  performances.sort((a, b) => b.score - a.score);
  const winners = performances.slice(0, 3);

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
    recommendations.push(
      `โพสต์ที่เวิร์กสุดวันนี้: ${top.productName} (${top.post.channel}) — CTR ~${(top.ctr * 100).toFixed(1)}%`,
    );
    const topProduct = byId.get(top.post.productId);
    if (topProduct) {
      recommendations.push(
        `วันพรุ่งนี้ลองมุมขายเดิมของ “${topProduct.name}” แต่เปลี่ยน hook ใหม่ 1 แบบ เพื่อทดสอบ`,
      );
    }
    const weak = [...performances].reverse()[0];
    if (weak && weak.post.id !== top.post.id) {
      recommendations.push(
        `โพสต์ที่อ่อนกว่า: ${weak.productName} — ลดการขายแข็ง เพิ่มตัวอย่างใช้งานจริง`,
      );
    }
  }

  recommendations.push(
    "อย่าโพสต์ซ้ำข้อความเดิมหลายรอบในวันเดียว — คุณภาพสำคัญกว่ารอบโพสต์",
  );

  const totalCommission = performances.reduce((s, p) => s + p.commission, 0);
  const summary =
    withMetrics.length === 0
      ? "สรุปเย็น: ยังไม่มีเมตริกที่บันทึก ระบบยังอยู่ในโหมดทดลอง"
      : `สรุปเย็น: บันทึก ${withMetrics.length} โพสต์ ค่าคอมรวมที่กรอก ฿${totalCommission.toLocaleString("th-TH")} (ตัวเลขทดลองจากผู้ใช้ ไม่ใช่การันตีรายได้)`;

  return {
    performances,
    winners,
    recommendations,
    summary,
    disclaimer: INCOME_DISCLAIMER,
  };
}
