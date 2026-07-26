export type Platform = "shopee" | "tiktok_shop" | "facebook";
export type ContentChannel =
  | "tiktok"
  | "facebook_post"
  | "facebook_group"
  | "facebook_reels";
export type DraftStatus = "draft" | "approved" | "posted" | "skipped";

export interface Product {
  id: string;
  name: string;
  platform: Platform;
  affiliateUrl: string;
  price: number;
  commissionRate: number; // percent 0-100
  category: string;
  sellingPoints: string[];
  painPoints: string[];
  targetAudience: string;
  videoEase: number; // 1-5 how easy to make short video
  seasonalScore: number; // 1-5 seasonal/trending potential
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreBreakdown {
  commission: number;
  impulsePrice: number;
  painClarity: number;
  videoEase: number;
  seasonal: number;
  total: number;
}

export interface RankedProduct {
  product: Product;
  score: ScoreBreakdown;
}

export interface ContentPack {
  id: string;
  productId: string;
  createdAt: string;
  disclosure: string;
  hooks: string[];
  ctas: string[];
  hashtagsTh: string[];
  hashtagsEn: string[];
  tiktokScript: {
    durationSec: number;
    scenes: { time: string; line: string; visual: string }[];
    voiceover: string;
  };
  facebookCaption: string;
  /** Soft community tone for Facebook Groups (not hard sales). */
  facebookGroupCaption: string;
  reelsCaption: string;
  videoPriorityNote: string;
  /** Variant seed used to rotate hooks/CTAs and reduce duplicate spam. */
  variant?: number;
}

export interface ScheduledPost {
  id: string;
  date: string; // YYYY-MM-DD
  suggestedTime: string; // HH:mm
  channel: ContentChannel;
  productId: string;
  contentPackId: string;
  hookIndex: number;
  ctaIndex: number;
  status: DraftStatus;
  captionPreview: string;
  approvedAt?: string;
  postedAt?: string;
  metrics?: PostMetrics;
}

export interface PostMetrics {
  views: number;
  clicks: number;
  orders: number;
  commissionEarned: number;
  notes?: string;
  recordedAt: string;
}

export interface DailyBrief {
  id: string;
  date: string;
  type: "morning" | "evening";
  topProductIds: string[];
  contentPackIds: string[];
  scheduleIds: string[];
  summary: string;
  recommendations: string[];
  disclaimer: string;
  createdAt: string;
}

export interface Database {
  products: Product[];
  contentPacks: ContentPack[];
  schedule: ScheduledPost[];
  briefs: DailyBrief[];
}
