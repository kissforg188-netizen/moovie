import type { AffiliateAdapter } from "./types";

export const manualShopeeAdapter: AffiliateAdapter = {
  platform: "shopee",
  mode: "manual",
  normalizeLink(url: string) {
    return url.trim();
  },
};

export const manualTikTokAdapter: AffiliateAdapter = {
  platform: "tiktok_shop",
  mode: "manual",
  normalizeLink(url: string) {
    return url.trim();
  },
};
