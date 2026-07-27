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

/** Alternate evening slot to Facebook Group on even calendar days (anti-spam mix). */
function slotsForDate(date: string): { time: string; channel: ContentChannel }[] {
  const day = Number(date.slice(-2));
  const slots = SLOT_PLAN.map((s) => ({ ...s }));
  if (!Number.isNaN(day) && day % 2 === 0) {
    const evening = slots.find((s) => s.time === "19:30");
    if (evening) evening.channel = "facebook_group";
  }
  return slots;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

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
  if (channel === "facebook_group") {
    return pack.facebookGroupCaption || pack.facebookCaption;
  }
  return pack.facebookCaption;
}

/** Normalize caption for soft duplicate detection (anti-spam). */
export function captionFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .slice(0, 180);
}

/**
 * Suggest 2–3 quality posts/day. Never auto-publishes — status starts as draft.
 * Skips product+channel pairs used in the last 3 days to reduce spammy repeats.
 */
export function buildDailySchedule(params: {
  date: string;
  ranked: { product: Product; pack: ContentPack }[];
  existing: ScheduledPost[];
  maxPosts?: number;
}): ScheduledPost[] {
  const maxPosts = params.maxPosts ?? 3;
  const slots = slotsForDate(params.date);

  const usedToday = new Set(
    params.existing
      .filter((s) => s.date === params.date)
      .map((s) => `${s.productId}:${s.channel}`),
  );

  const recentKeys = new Set(
    params.existing
      .filter((s) => {
        const gap = daysBetween(s.date, params.date);
        return gap >= 0 && gap <= 3 && s.status !== "skipped";
      })
      .map((s) => `${s.productId}:${s.channel}`),
  );

  const posts: ScheduledPost[] = [];
  let slotIndex = 0;
  const usedChannelsToday = new Set(
    params.existing
      .filter((s) => s.date === params.date)
      .map((s) => s.channel),
  );

  const usedFingerprints = new Set(
    params.existing
      .filter((s) => s.date === params.date && s.status !== "skipped")
      .map((s) => captionFingerprint(s.captionPreview)),
  );

  for (const pick of params.ranked) {
    if (posts.length >= maxPosts) break;

    // Prefer unused channels first (platform diversity), then anti-spam keys
    let assigned: { time: string; channel: ContentChannel } | null = null;
    const orderedSlots = [
      ...slots.filter((s) => !usedChannelsToday.has(s.channel)),
      ...slots.filter((s) => usedChannelsToday.has(s.channel)),
    ];
    // Rotate start so morning slot isn't always first product forever
    const rotated = [
      ...orderedSlots.slice(slotIndex % orderedSlots.length),
      ...orderedSlots.slice(0, slotIndex % orderedSlots.length),
    ];

    for (const slot of rotated) {
      const key = `${pick.product.id}:${slot.channel}`;
      if (usedToday.has(key) || recentKeys.has(key)) continue;

      // Try a few hook/cta combos to avoid identical captions the same day
      let caption = "";
      let hookIndex = 0;
      let ctaIndex = 0;
      let fingerprintOk = false;
      for (let attempt = 0; attempt < pick.pack.hooks.length; attempt++) {
        hookIndex =
          (posts.length + (pick.pack.variant ?? 0) + attempt) %
          pick.pack.hooks.length;
        ctaIndex =
          (posts.length + (pick.pack.variant ?? 0) + attempt) %
          pick.pack.ctas.length;
        caption = captionForChannel(
          pick.pack,
          slot.channel,
          hookIndex,
          ctaIndex,
        );
        const fp = captionFingerprint(caption);
        if (!usedFingerprints.has(fp)) {
          fingerprintOk = true;
          break;
        }
      }
      if (!fingerprintOk) continue;

      assigned = slot;
      const key2 = `${pick.product.id}:${assigned.channel}`;
      usedToday.add(key2);
      recentKeys.add(key2);
      usedChannelsToday.add(assigned.channel);
      usedFingerprints.add(captionFingerprint(caption));
      slotIndex += 1;

      posts.push({
        id: newId("post"),
        date: params.date,
        suggestedTime: assigned.time,
        channel: assigned.channel,
        productId: pick.product.id,
        contentPackId: pick.pack.id,
        hookIndex,
        ctaIndex,
        status: "draft",
        captionPreview: caption,
      });
      break;
    }
  }

  // Prefer at least 2 posts when inventory allows
  return posts.slice(0, maxPosts);
}

export function channelLabel(channel: ContentChannel): string {
  switch (channel) {
    case "tiktok":
      return "TikTok";
    case "facebook_post":
      return "Facebook Page";
    case "facebook_group":
      return "Facebook Group";
    case "facebook_reels":
      return "Facebook Reels";
  }
}
