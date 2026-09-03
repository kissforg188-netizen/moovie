import { evaluateApproveGate } from "./approve";
import { AFFILIATE_DISCLOSURE, INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";
import type {
  ContentChannel,
  ContentPack,
  Database,
  Product,
  ScheduledPost,
} from "./types";

export interface PostingPack {
  scheduleId: string;
  date: string;
  suggestedTime: string;
  channel: ContentChannel;
  channelLabel: string;
  status: ScheduledPost["status"];
  productName: string;
  platform: Product["platform"] | "unknown";
  affiliateUrl: string;
  caption: string;
  hook: string;
  cta: string;
  hashtags: string[];
  filmingChecklist: string[];
  scriptLines: string[];
  complianceOk: boolean;
  complianceNotes: string[];
  readyToCopy: boolean;
  /** Plain text for mobile paste (LINE / Notes / TikTok). */
  text: string;
  disclaimer: string;
}

function shortVideoChannel(channel: ContentChannel): boolean {
  return channel === "tiktok" || channel === "facebook_reels";
}

/**
 * Build a ready-to-post pack for one scheduled draft.
 * Never publishes — user copies and posts manually after Approve.
 */
export function buildPostingPack(
  post: ScheduledPost,
  product: Product | undefined,
  pack: ContentPack | undefined,
): PostingPack {
  const gate = evaluateApproveGate(post.captionPreview, AFFILIATE_DISCLOSURE);
  const complianceNotes = gate.ok
    ? ["ผ่าน disclosure + ไม่พบคำโฆษณาเกินจริงในแคปชัน"]
    : [...gate.errors];

  const readyToCopy =
    (post.status === "approved" || post.status === "posted") && gate.ok;

  if (post.status === "draft") {
    complianceNotes.push(
      "ยังเป็น draft — ต้อง Approve ก่อนโพสต์จริง (ระบบไม่โพสต์ให้อัตโนมัติ)",
    );
  } else if (post.status === "skipped") {
    complianceNotes.push("โพสต์นี้ถูกข้ามแล้ว — ไม่ควรโพสต์");
  }

  const hook = pack?.hooks[post.hookIndex] ?? pack?.hooks[0] ?? "";
  const cta = pack?.ctas[post.ctaIndex] ?? pack?.ctas[0] ?? "";
  const hashtags = pack
    ? [...pack.hashtagsTh.slice(0, 5), ...pack.hashtagsEn.slice(0, 4)]
    : [];
  const filmingChecklist = pack?.filmingChecklist ?? [];
  const scriptLines =
    pack?.tiktokScript.scenes.map((s) => `[${s.time}] ${s.line}`) ?? [];

  const text = postingPackToText({
    scheduleId: post.id,
    date: post.date,
    suggestedTime: post.suggestedTime,
    channel: post.channel,
    channelLabel: channelLabel(post.channel),
    status: post.status,
    productName: product?.name ?? post.productId,
    platform: product?.platform ?? "unknown",
    affiliateUrl: product?.affiliateUrl ?? "",
    caption: post.captionPreview,
    hook,
    cta,
    hashtags,
    filmingChecklist,
    scriptLines,
    complianceOk: gate.ok,
    complianceNotes,
    readyToCopy,
    text: "",
    disclaimer: INCOME_DISCLAIMER,
  });

  return {
    scheduleId: post.id,
    date: post.date,
    suggestedTime: post.suggestedTime,
    channel: post.channel,
    channelLabel: channelLabel(post.channel),
    status: post.status,
    productName: product?.name ?? post.productId,
    platform: product?.platform ?? "unknown",
    affiliateUrl: product?.affiliateUrl ?? "",
    caption: post.captionPreview,
    hook,
    cta,
    hashtags,
    filmingChecklist,
    scriptLines,
    complianceOk: gate.ok,
    complianceNotes,
    readyToCopy,
    text,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function postingPackToText(pack: PostingPack): string {
  const lines: string[] = [
    `📦 Posting Pack · ${pack.suggestedTime} · ${pack.channelLabel}`,
    `สินค้า: ${pack.productName}`,
    `สถานะ: ${pack.status}${pack.readyToCopy ? " · พร้อมคัดลอกไปโพสต์มือ" : ""}`,
    "",
    "— Checklist ก่อนโพสต์ —",
    ...pack.complianceNotes.map((n) => `• ${n}`),
    "- [ ] ไม่โพสต์ซ้ำช่องทางเดิมในวันเดียวกันแบบไร้คุณภาพ",
    "- [ ] มี disclosure ในแคปชัน",
    "- [ ] ไม่การันตีรายได้ / ไม่ใช้คำโฆษณาเกินจริง",
    "",
  ];

  if (pack.affiliateUrl) {
    lines.push("ลิงก์ affiliate:", pack.affiliateUrl, "");
  }

  if (pack.hook) {
    lines.push(`Hook: ${pack.hook}`);
  }
  if (pack.cta) {
    lines.push(`CTA: ${pack.cta}`);
  }
  if (pack.hook || pack.cta) lines.push("");

  if (shortVideoChannel(pack.channel) && pack.scriptLines.length) {
    lines.push("สคริปต์สั้น:", ...pack.scriptLines.map((l) => `  ${l}`), "");
  }

  if (shortVideoChannel(pack.channel) && pack.filmingChecklist.length) {
    lines.push(
      "เช็คลิสต์ถ่าย:",
      ...pack.filmingChecklist.map((c) => `- [ ] ${c}`),
      "",
    );
  }

  lines.push(
    "— Caption (คัดลอกทั้งก้อน) —",
    pack.caption,
    "",
  );

  if (pack.hashtags.length) {
    lines.push("Hashtags:", pack.hashtags.join(" "), "");
  }

  lines.push(`หมายเหตุ: ${pack.disclaimer}`);
  return lines.join("\n");
}

/** Export all of today's approved/posted items as one mobile-friendly digest. */
export function postingPacksForDate(db: Database, date: string): PostingPack[] {
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const packById = new Map(db.contentPacks.map((p) => [p.id, p]));
  return db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime))
    .map((post) =>
      buildPostingPack(
        post,
        productById.get(post.productId),
        packById.get(post.contentPackId),
      ),
    );
}

export function postingPacksToMarkdown(packs: PostingPack[], date: string): string {
  const ready = packs.filter((p) => p.status === "approved" || p.status === "posted");
  const blocks = (ready.length ? ready : packs).map((p, i) =>
    [
      `## ${i + 1}. ${p.suggestedTime} · ${p.channelLabel} · ${p.status}`,
      "",
      "```",
      p.text,
      "```",
    ].join("\n"),
  );

  return [
    `# Posting Packs · ${date}`,
    "",
    `> คัดลอกไปโพสต์ด้วยมือเท่านั้น — ระบบไม่โพสต์อัตโนมัติ`,
    `> ${INCOME_DISCLAIMER}`,
    "",
    blocks.length
      ? blocks.join("\n\n---\n\n")
      : "_ยังไม่มีคิววันนี้ — รัน Morning workflow ก่อน_",
    "",
  ].join("\n");
}
