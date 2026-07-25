import type { Platform, Product } from "../types";

/**
 * Future platform adapters (Shopee / TikTok Shop / Meta) should implement this.
 * MVP uses ManualAdapter only — user pastes product + affiliate link.
 */
export interface AffiliateAdapter {
  platform: Platform;
  /** Whether credentials/API keys are configured */
  isConfigured(): boolean;
  /** Search or import products when API is available */
  fetchCandidates?(query: string): Promise<Partial<Product>[]>;
}

export type AdapterStatus = {
  platform: Platform;
  configured: boolean;
  mode: "manual" | "api";
  note: string;
};
