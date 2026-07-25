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

export function dbToJson(db: Database): string {
  return JSON.stringify(db, null, 2);
}
