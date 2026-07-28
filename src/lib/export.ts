import type { Database } from "./types";

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function productsToCsv(db: Database): string {
  const header = [
    "id",
    "name",
    "platform",
    "price",
    "commissionRate",
    "category",
    "affiliateUrl",
    "targetAudience",
    "videoEase",
    "seasonalScore",
  ];
  const rows = db.products.map((p) =>
    [
      p.id,
      p.name,
      p.platform,
      p.price,
      p.commissionRate,
      p.category,
      p.affiliateUrl,
      p.targetAudience,
      p.videoEase,
      p.seasonalScore,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function scheduleToCsv(db: Database): string {
  const header = [
    "id",
    "date",
    "suggestedTime",
    "channel",
    "productId",
    "status",
    "hookIndex",
    "ctaIndex",
    "views",
    "clicks",
    "orders",
    "commissionEarned",
  ];
  const rows = db.schedule.map((s) =>
    [
      s.id,
      s.date,
      s.suggestedTime,
      s.channel,
      s.productId,
      s.status,
      s.hookIndex,
      s.ctaIndex,
      s.metrics?.views ?? "",
      s.metrics?.clicks ?? "",
      s.metrics?.orders ?? "",
      s.metrics?.commissionEarned ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function briefsToCsv(db: Database): string {
  const header = [
    "id",
    "date",
    "type",
    "summary",
    "recommendations",
    "topProductIds",
    "scheduleIds",
    "createdAt",
  ];
  const rows = db.briefs.map((b) =>
    [
      b.id,
      b.date,
      b.type,
      b.summary,
      b.recommendations.join(" | "),
      b.topProductIds.join("|"),
      b.scheduleIds.join("|"),
      b.createdAt,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function weeklyToCsv(
  rows: {
    productId: string;
    productName: string;
    posts: number;
    views: number;
    clicks: number;
    orders: number;
    commission: number;
    avgCtr: number;
    score: number;
  }[],
): string {
  const header = [
    "productId",
    "productName",
    "posts",
    "views",
    "clicks",
    "orders",
    "commission",
    "avgCtr",
    "score",
  ];
  const body = rows.map((r) =>
    [
      r.productId,
      r.productName,
      r.posts,
      r.views,
      r.clicks,
      r.orders,
      r.commission,
      r.avgCtr.toFixed(4),
      r.score.toFixed(2),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

export function dbToJson(db: Database): string {
  return JSON.stringify(db, null, 2);
}
