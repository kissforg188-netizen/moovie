import type { Platform, Product } from "../types";

/**
 * Future platform adapters implement this. MVP uses ManualAdapter only.
 * No adapter may auto-publish content.
 */
export interface AffiliateAdapter {
  platform: Platform;
  mode: "manual" | "api";
  /** Fetch or normalize product candidates — API mode later */
  listCandidates?(): Promise<Partial<Product>[]>;
  /** Resolve/validate an affiliate link */
  normalizeLink?(url: string): string;
}

export interface SocialPublisher {
  platform: "tiktok" | "facebook";
  /** Publishing is intentionally unsupported in MVP */
  canAutoPost: false;
  reason: string;
}
