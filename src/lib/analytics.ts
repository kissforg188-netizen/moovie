import type { ContentPack, PerformanceMetric, Product, ScheduledPost } from "./types";

export interface PostInsight {
  scheduledPostId: string;
  productId: string;
  productName: string;
  channel: string;
  views: number;
  clicks: number;
  orders: number;
  commissionEarned: number;
  ctr: number;
  cvr: number;
  score: number;
  note: string;
}

export interface EveningAnalysis {
  insights: PostInsight[];
  winners: PostInsight[];
  recommendations: string[];
  nextDayAngles: string[];
  summary: string;
}

function metricForPost(
  post: ScheduledPost,
  metrics: PerformanceMetric[]
): PerformanceMetric | undefined {
  return metrics
    .filter((m) => m.scheduledPostId === post.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function analyzeEvening(args: {
  posts: ScheduledPost[];
  metrics: PerformanceMetric[];
  products: Product[];
  packs: ContentPack[];
}): EveningAnalysis {
  const productById = new Map(args.products.map((p) => [p.id, p]));
  const insights: PostInsight[] = args.posts.map((post) => {
    const m = metricForPost(post, args.metrics);
    const views = m?.views ?? 0;
    const clicks = m?.clicks ?? 0;
    const orders = m?.orders ?? 0;
    const commissionEarned = m?.commissionEarned ?? 0;
    const ctr = views > 0 ? clicks / views : 0;
    const cvr = clicks > 0 ? orders / clicks : 0;
    const score = Math.round(
      views * 0.01 + clicks * 2 + orders * 40 + commissionEarned * 1.5
    );
    let note = "ยังมีข้อมูลน้อย — เก็บผลต่ออีก 2–3 โพสต์ก่อนสรุปแนวทาง";
    if (views === 0 && clicks === 0) {
      note = "ยังไม่มีผลลัพธ์ กรุณากรอกตัวเลขจากแพลตฟอร์ม";
    } else if (ctr >= 0.05 && orders > 0) {
      note = "คอนเทนต์ดึงคลิกและมีออเดอร์ — ลองขยายมุมเดิมแบบไม่สแปม";
    } else if (ctr >= 0.05 && orders === 0) {
      note = "คลิกดีแต่ออเดอร์ยังไม่มา — ปรับ hook ให้ตรง pain มากขึ้น หรือเช็กหน้าสินค้า";
    } else if (views > 0 && ctr < 0.02) {
      note = "เข้าถึงได้แต่คลิกต่ำ — ลองเปลี่ยน hook / วินาทีแรกของคลิป";
    }
    return {
      scheduledPostId: post.id,
      productId: post.productId,
      productName: productById.get(post.productId)?.name ?? post.productId,
      channel: post.channel,
      views,
      clicks,
      orders,
      commissionEarned,
      ctr,
      cvr,
      score,
      note,
    };
  });

  const ranked = [...insights].sort((a, b) => b.score - a.score);
  const winners = ranked.filter((i) => i.score > 0).slice(0, 3);

  const recommendations: string[] = [];
  if (winners.length === 0) {
    recommendations.push(
      "วันนี้ยังไม่มีข้อมูลพอสำหรับสรุปผล — กรอก views/clicks/orders แล้วรัน evening อีกครั้ง"
    );
    recommendations.push(
      "พรุ่งนี้ทดลองโพสต์ 2 ชิ้นจากสินค้าคะแนนสูงสุด และเก็บผลให้ครบทุกช่องทาง"
    );
  } else {
    const top = winners[0];
    recommendations.push(
      `โพสต์ที่เวิร์กที่สุดวันนี้: ${top.productName} (${top.channel}) — ${top.note}`
    );
    if (top.orders > 0) {
      recommendations.push(
        "มีออเดอร์แล้ว: ทำคลิปมุมใกล้เคียงวันพรุ่งนี้ แต่เปลี่ยน hook อย่างน้อย 1 แบบ เพื่อไม่ซ้ำจำเจ"
      );
    }
    const weak = ranked.filter((i) => i.views > 0 && i.clicks === 0);
    if (weak.length) {
      recommendations.push(
        `โพสต์ที่คลิกไม่มา: ${weak.map((w) => w.productName).join(", ")} — ลดการขายแข็ง เน้นช่วยตัดสินใจ`
      );
    }
  }

  const nextDayAngles = winners.slice(0, 2).map((w) => {
    const pack = args.packs.find((p) =>
      args.posts.some(
        (post) => post.id === w.scheduledPostId && post.contentPackId === p.id
      )
    );
    const hook = pack?.hooks[1] ?? "เปิดด้วยปัญหาจริงของกลุ่มเป้าหมาย";
    return `${w.productName}: ลองมุม “${hook}” บนช่องทางที่ต่างจากวันนี้เล็กน้อย`;
  });

  if (nextDayAngles.length === 0) {
    nextDayAngles.push(
      "เริ่มจากสินค้า top ranking 2 ชิ้น ทำ TikTok 1 คลิป + Facebook caption 1 โพสต์"
    );
  }

  const totalCommission = insights.reduce((s, i) => s + i.commissionEarned, 0);
  const summary = [
    `สรุปเย็น: วิเคราะห์ ${insights.length} โพสต์`,
    winners[0]
      ? `ผู้นำชั่วคราวคือ “${winners[0].productName}” (คะแนนทดลอง ${winners[0].score})`
      : "ยังไม่มีโพสต์เด่น",
    `ค่าคอมที่บันทึกวันนี้รวม ${totalCommission.toLocaleString("th-TH")} บาท`,
    "หมายเหตุ: เป็นข้อมูลทดลองจากที่คุณกรอก ไม่ใช่การรับประกันรายได้",
  ].join(" · ");

  return { insights, winners, recommendations, nextDayAngles, summary };
}
