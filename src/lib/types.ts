export type Platform = "shopee" | "tiktok_shop" | "facebook";
export type ContentChannel = "tiktok" | "facebook_page" | "facebook_group" | "facebook_reels";
export type PostStatus = "draft" | "approved" | "posted" | "skipped";

export interface Product {
  id: string;
  name: string;
  platform: Platform;
  affiliateUrl: string;
  price: number;
  commissionRate: number; // percent 0-100
  commissionAmount?: number; // optional fixed THB
  category: string;
  sellingPoints: string[];
  painPoints: string[];
  targetAudience: string;
  seasonalTags: string[];
  videoFriendly: boolean; // easy to demo in short video
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
  reasons: string[];
}

export interface ContentPack {
  id: string;
  productId: string;
  createdAt: string;
  disclosure: string;
  tiktokScript: {
    durationHint: string;
    scenes: { time: string; visual: string; voiceover: string }[];
    onScreenText: string[];
  };
  facebookCaption: string;
  reelsCaption: string;
  hooks: string[];
  ctas: string[];
  hashtags: { th: string[]; en: string[] };
  videoAngleSuggestion: string;
}

export interface ScheduledPost {
  id: string;
  date: string; // YYYY-MM-DD
  slot: "morning" | "noon" | "evening";
  channel: ContentChannel;
  productId: string;
  contentPackId: string;
  caption: string;
  status: PostStatus;
  approvedAt?: string;
  postedAt?: string;
  createdAt: string;
}

export interface PerformanceMetric {
  id: string;
  scheduledPostId: string;
  productId: string;
  date: string;
  views: number;
  clicks: number;
  orders: number;
  commissionEarned: number;
  notes?: string;
  createdAt: string;
}

export interface DailyBrief {
  id: string;
  date: string;
  type: "morning" | "evening";
  topProductIds: string[];
  summary: string;
  videoPriority: string[];
  recommendations: string[];
  createdAt: string;
}

export interface Database {
  products: Product[];
  contentPacks: ContentPack[];
  schedule: ScheduledPost[];
  metrics: PerformanceMetric[];
  briefs: DailyBrief[];
}
