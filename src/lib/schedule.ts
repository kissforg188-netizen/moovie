import { newId } from "./db";
import type {
  ContentChannel,
  ContentPack,
  Product,
  ScheduledPost,
} from "./types";

const SLOT_PLAN: { time: string; channel: ContentChannel }[] = [
  { time: "10:30", channel: "tiktok" },
  { time: "13:00", channel: "facebook_reels" },
  { time: "19:30", channel: "facebook_post" },
];

function captionForChannel(
  pack: ContentPack,
  channel: ContentChannel,
  hookIndex: number,
  ctaIndex: number,
): string {
  const hook = pack.hooks[hookIndex] ?? pack.hooks[0];
  const cta = pack.ctas[ctaIndex] ?? pack.ctas[0];
  if (channel === "tiktok") {
    return `${hook}\n\n${pack.tiktokScript.voiceover}\n\n${cta}\n\n${pack.disclosure}`;
  }
  if (channel === "facebook_reels") {
    return pack.reelsCaption;
  }
  return pack.facebookCaption;
}

/**
 * Suggest 2–3 quality posts/day. Never auto-publishes — status starts as draft.
 */
export function buildDailySchedule(params: {
  date: string;
  ranked: { product: Product; pack: ContentPack }[];
  existing: ScheduledPost[];
}): ScheduledPost[] {
  const usedProductIds = new Set(
    params.existing
      .filter((s) => s.date === params.date)
      .map((s) => s.productId),
  );

  const picks = params.ranked
    .filter((r) => !usedProductIds.has(r.product.id))
    .slice(0, 3);

  return picks.map((pick, index) => {
    const slot = SLOT_PLAN[index] ?? SLOT_PLAN[SLOT_PLAN.length - 1];
    const hookIndex = index % pick.pack.hooks.length;
    const ctaIndex = index % pick.pack.ctas.length;
    return {
      id: newId("post"),
      date: params.date,
      suggestedTime: slot.time,
      channel: slot.channel,
      productId: pick.product.id,
      contentPackId: pick.pack.id,
      hookIndex,
      ctaIndex,
      status: "draft" as const,
      captionPreview: captionForChannel(
        pick.pack,
        slot.channel,
        hookIndex,
        ctaIndex,
      ),
    };
  });
}

export function channelLabel(channel: ContentChannel): string {
  switch (channel) {
    case "tiktok":
      return "TikTok";
    case "facebook_post":
      return "Facebook Post";
    case "facebook_reels":
      return "Facebook Reels";
  }
}
