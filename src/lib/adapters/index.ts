import { facebookPublisher } from "./facebook";
import { manualShopeeAdapter, manualTikTokAdapter } from "./manual";
import { shopeeApiAdapter } from "./shopee";
import { tiktokShopApiAdapter } from "./tiktok";
import type { AffiliateAdapter, SocialPublisher } from "./types";

export type { AffiliateAdapter, SocialPublisher };

/** Default = manual. Swap to API adapters when credentials exist. */
export const activeAdapters: AffiliateAdapter[] = [
  manualShopeeAdapter,
  manualTikTokAdapter,
];

export const futureAdapters: AffiliateAdapter[] = [
  shopeeApiAdapter,
  tiktokShopApiAdapter,
];

export const socialPublishers: SocialPublisher[] = [facebookPublisher];

export function getManualAdapter(platform: "shopee" | "tiktok_shop") {
  return platform === "shopee" ? manualShopeeAdapter : manualTikTokAdapter;
}
