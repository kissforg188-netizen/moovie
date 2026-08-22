import type { Platform } from "./types";

/**
 * Guess affiliate platform from a URL (manual mode helper).
 * Prefer explicit user choice when detection returns null.
 */
export function detectPlatformFromUrl(rawUrl: string): Platform | null {
  const url = rawUrl.trim().toLowerCase();
  if (!url) return null;

  // Shopee affiliate / product / short links (TH + regional)
  if (
    /shopee\.(co\.th|vn|sg|com\.my|co\.id|ph|tw|com)/.test(url) ||
    /s\.shopee\./.test(url) ||
    /shp\.ee\//.test(url) ||
    /affiliate\.shopee\./.test(url)
  ) {
    return "shopee";
  }

  // TikTok Shop / affiliate
  if (
    /tiktok\.com/.test(url) ||
    /vt\.tiktok\.com/.test(url) ||
    /shop\.tiktok\.com/.test(url) ||
    /tiktokglobalshop\.com/.test(url) ||
    /affiliate\.tiktok\.com/.test(url)
  ) {
    return "tiktok_shop";
  }

  // Facebook / Meta commerce or page shop links
  if (
    /facebook\.com/.test(url) ||
    /fb\.com\//.test(url) ||
    /fb\.me\//.test(url) ||
    /m\.me\//.test(url) ||
    /instagram\.com/.test(url)
  ) {
    return "facebook";
  }

  return null;
}

export function platformLabelTh(platform: Platform): string {
  if (platform === "tiktok_shop") return "TikTok Shop";
  if (platform === "facebook") return "Facebook";
  return "Shopee";
}
