import { newId, todayISO } from "./db";
import type {
  ContentChannel,
  ContentPack,
  Product,
  RankedProduct,
  ScheduledPost,
} from "./types";

const SLOT_CHANNELS: {
  slot: ScheduledPost["slot"];
  channel: ContentChannel;
  captionOf: (pack: ContentPack) => string;
}[] = [
  {
    slot: "morning",
    channel: "tiktok",
    captionOf: (pack) =>
      [
        pack.hooks[0],
        pack.ctas[0],
        [...pack.hashtags.th.slice(0, 3), ...pack.hashtags.en.slice(0, 2)].join(" "),
        "",
        pack.disclosure,
      ].join("\n"),
  },
  {
    slot: "noon",
    channel: "facebook_page",
    captionOf: (pack) => pack.facebookCaption,
  },
  {
    slot: "evening",
    channel: "facebook_reels",
    captionOf: (pack) =>
      [
        pack.reelsCaption,
        "",
        [...pack.hashtags.th.slice(0, 2), ...pack.hashtags.en.slice(0, 2)].join(" "),
      ].join("\n"),
  },
];

/**
 * Suggest 2–3 draft posts for the day from top ranked products.
 * Never auto-publishes — status is always "draft".
 */
export function buildDailyDrafts(
  ranked: RankedProduct[],
  packsByProductId: Map<string, ContentPack>,
  date = todayISO()
): ScheduledPost[] {
  const selected = ranked.slice(0, 3);
  const posts: ScheduledPost[] = [];
  selected.forEach((item, index) => {
    const plan = SLOT_CHANNELS[index];
    if (!plan) return;
    const pack = packsByProductId.get(item.product.id);
    if (!pack) return;
    posts.push({
      id: newId("post"),
      date,
      slot: plan.slot,
      channel: plan.channel,
      productId: item.product.id,
      contentPackId: pack.id,
      caption: plan.captionOf(pack),
      status: "draft",
      createdAt: new Date().toISOString(),
    });
  });
  return posts;
}

export function channelLabel(channel: ContentChannel): string {
  switch (channel) {
    case "tiktok":
      return "TikTok";
    case "facebook_page":
      return "Facebook Page";
    case "facebook_group":
      return "Facebook Group";
    case "facebook_reels":
      return "Facebook Reels";
  }
}

export function productMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.id, p]));
}
