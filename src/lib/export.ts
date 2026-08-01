import type { ExperimentPlan } from "./experiments";
import { experimentPlanToMarkdown } from "./experiments";
import { channelLabel } from "./schedule";
import type { ContentPack, Database, Product } from "./types";
import { INCOME_DISCLAIMER } from "./disclosure";

export { experimentPlanToMarkdown };

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Ready-to-film Markdown pack for one product (Thai-first, disclosure included). */
export function contentPackToMarkdown(
  pack: ContentPack,
  product?: Product,
): string {
  const name = product?.name ?? pack.productId;
  const lines: string[] = [
    `# Content Pack — ${name}`,
    "",
    `> ${INCOME_DISCLAIMER}`,
    "",
    `สร้างเมื่อ: ${pack.createdAt}`,
    product
      ? `แพลตฟอร์ม: ${product.platform} · ราคา ~฿${product.price} · คอม ${product.commissionRate}%`
      : "",
    product?.affiliateUrl ? `ลิงก์ affiliate: ${product.affiliateUrl}` : "",
    "",
    "## Disclosure (ต้องมีทุกโพสต์)",
    pack.disclosure,
    "",
    "## Hooks (5)",
    ...pack.hooks.map((h, i) => `${i + 1}. ${h}`),
    "",
    "## CTA (3)",
    ...pack.ctas.map((c, i) => `${i + 1}. ${c}`),
    "",
    "## มุมขาย",
    ...pack.sellingAngles.map((a, i) => `${i + 1}. ${a}`),
    "",
    "## TikTok Script (~" + pack.tiktokScript.durationSec + "s)",
    pack.tiktokScript.voiceover,
    "",
    "### Scenes",
    ...pack.tiktokScript.scenes.map(
      (s) => `- [${s.time}] ${s.line} _(visual: ${s.visual})_`,
    ),
    "",
    "## Facebook Page Caption",
    pack.facebookCaption,
    "",
    "## Facebook Group Caption",
    pack.facebookGroupCaption,
    "",
    "## Reels Caption",
    pack.reelsCaption,
    "",
    "## Hashtags",
    [...pack.hashtagsTh, ...pack.hashtagsEn].join(" "),
    "",
    "## Checklist ถ่าย",
    ...pack.filmingChecklist.map((c) => `- [ ] ${c}`),
    "",
    `## ลำดับความสำคัญวิดีโอ`,
    pack.videoPriorityNote,
    "",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

/** Export latest content pack per product as one Markdown document. */
export function contentPacksToMarkdown(db: Database): string {
  const byProduct = new Map<string, ContentPack>();
  for (const pack of [...db.contentPacks].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )) {
    byProduct.set(pack.productId, pack);
  }
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const parts = [...byProduct.values()].map((pack) =>
    contentPackToMarkdown(pack, productById.get(pack.productId)),
  );
  if (parts.length === 0) {
    return `# Content Packs\n\nยังไม่มี content pack — รัน Morning workflow หรือกดสร้างคอนเทนต์ก่อน\n`;
  }
  return [
    `# เลือกดี — Content Packs Export`,
    "",
    `> ${INCOME_DISCLAIMER}`,
    "",
    `จำนวนแพ็ก: ${parts.length}`,
    "",
    "---",
    "",
    parts.join("\n\n---\n\n"),
  ].join("\n");
}

/**
 * Ready-to-post checklist for approved (or posted) items today.
 * Still never publishes — user copies caption and posts manually.
 */
export function approvedTodayToMarkdown(db: Database, date: string): string {
  const posts = db.schedule
    .filter(
      (s) =>
        s.date === date && (s.status === "approved" || s.status === "posted"),
    )
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const packById = new Map(db.contentPacks.map((p) => [p.id, p]));

  const blocks = posts.map((post, i) => {
    const product = productById.get(post.productId);
    const pack = packById.get(post.contentPackId);
    return [
      `## ${i + 1}. ${post.suggestedTime} · ${channelLabel(post.channel)} · ${post.status}`,
      `สินค้า: ${product?.name ?? post.productId}`,
      product?.affiliateUrl ? `ลิงก์ affiliate: ${product.affiliateUrl}` : "",
      "",
      "### Checklist ก่อนโพสต์",
      "- [ ] ตรวจว่าไม่ซ้ำกับโพสต์วันก่อน",
      "- [ ] มี disclosure ในแคปชัน",
      "- [ ] ไม่ใช้คำโฆษณาเกินจริง / ไม่การันตีรายได้",
      "- [ ] โพสต์ด้วยมือบนแอปจริงหลัง Approve แล้วเท่านั้น",
      "",
      "### Caption (คัดลอกได้)",
      "```",
      post.captionPreview,
      "```",
      "",
      pack
        ? `Hashtags: ${[...pack.hashtagsTh, ...pack.hashtagsEn].join(" ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `# Checklist โพสต์ที่อนุมัติแล้ว · ${date}`,
    "",
    `> Draft/Approve workflow — ระบบไม่โพสต์ให้อัตโนมัติ`,
    `> ${INCOME_DISCLAIMER}`,
    "",
    blocks.length
      ? blocks.join("\n\n---\n\n")
      : "_ยังไม่มีโพสต์สถานะ approved/posted วันนี้ — ไปที่ /calendar เพื่อ Approve draft_",
    "",
  ].join("\n");
}

/** Today's draft captions as a simple filming sheet. */
export function todayDraftsToMarkdown(db: Database, date: string): string {
  const posts = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const packById = new Map(db.contentPacks.map((p) => [p.id, p]));

  const blocks = posts.map((post) => {
    const product = productById.get(post.productId);
    const pack = packById.get(post.contentPackId);
    return [
      `## ${post.suggestedTime} · ${channelLabel(post.channel)} · ${post.status}`,
      `สินค้า: ${product?.name ?? post.productId}`,
      product?.affiliateUrl ? `ลิงก์: ${product.affiliateUrl}` : "",
      "",
      "### Caption",
      post.captionPreview,
      "",
      pack
        ? `Hook #${post.hookIndex + 1}: ${pack.hooks[post.hookIndex] ?? ""}`
        : "",
      pack ? `CTA #${post.ctaIndex + 1}: ${pack.ctas[post.ctaIndex] ?? ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `# ตารางถ่าย/โพสต์ · ${date}`,
    "",
    `> Draft only — ต้อง Approve ก่อนโพสต์จริง`,
    `> ${INCOME_DISCLAIMER}`,
    "",
    blocks.length ? blocks.join("\n\n---\n\n") : "_ยังไม่มี draft วันนี้_",
    "",
  ].join("\n");
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

/** Re-export helper for API consumers that already hold an ExperimentPlan. */
export function experimentsToMarkdown(plan: ExperimentPlan): string {
  return experimentPlanToMarkdown(plan);
}
