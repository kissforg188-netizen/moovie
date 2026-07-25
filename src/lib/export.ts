import type { Database } from "./types";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportProductsCsv(db: Database): string {
  const header = [
    "id",
    "name",
    "platform",
    "affiliateUrl",
    "price",
    "commissionRate",
    "category",
    "targetAudience",
    "sellingPoints",
    "painPoints",
    "seasonalTags",
    "videoFriendly",
  ];
  const rows = db.products.map((p) =>
    [
      p.id,
      p.name,
      p.platform,
      p.affiliateUrl,
      p.price,
      p.commissionRate,
      p.category,
      p.targetAudience,
      p.sellingPoints.join("|"),
      p.painPoints.join("|"),
      p.seasonalTags.join("|"),
      p.videoFriendly,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function exportScheduleCsv(db: Database): string {
  const header = [
    "id",
    "date",
    "slot",
    "channel",
    "productId",
    "status",
    "caption",
    "approvedAt",
    "postedAt",
  ];
  const rows = db.schedule.map((p) =>
    [
      p.id,
      p.date,
      p.slot,
      p.channel,
      p.productId,
      p.status,
      p.caption,
      p.approvedAt ?? "",
      p.postedAt ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function exportMetricsCsv(db: Database): string {
  const header = [
    "id",
    "date",
    "scheduledPostId",
    "productId",
    "views",
    "clicks",
    "orders",
    "commissionEarned",
    "notes",
  ];
  const rows = db.metrics.map((m) =>
    [
      m.id,
      m.date,
      m.scheduledPostId,
      m.productId,
      m.views,
      m.clicks,
      m.orders,
      m.commissionEarned,
      m.notes ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function exportAllJson(db: Database): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      disclaimer:
        "ข้อมูลทดลองจากระบบเลือกดี ไม่ใช่การรับประกันรายได้หรือผลการขายในอนาคต",
      ...db,
    },
    null,
    2
  );
}
