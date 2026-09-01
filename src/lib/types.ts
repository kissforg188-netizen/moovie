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
  /** When false, product is paused and excluded from morning ranking. Default true. */
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreBreakdown {
  commission: number;
  impulsePrice: number;
  painClarity: number;
  videoEase: number;
  seasonal: number;
  /**
   * Soft 0–100 from expected baht per sale (price × commission%).
   * Complements rate-only scoring so tiny high-% items don't dominate.
   */
  expectedCommission: number;
  /** Soft 0–100 from manually posted history (neutral 50 when empty). */
  historyBoost: number;
  /** Soft evening→morning learning delta (−4…+8). */
  learningBoost: number;
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
  /** Practical shot list for 15–30s videos (Thai). */
  filmingChecklist: string[];
  /** Soft selling angles (help-choose tone, not hard sell). */
  sellingAngles: string[];
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
  /**
   * Manual cost basis for real ROI: ads/boost, sample, production (บาท).
   * Optional — when 0/omitted, ROI% is unavailable (still track commission/click).
   */
  promoSpend?: number;
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

export interface AutomationLog {
  id: string;
  jobType: string;
  status: "pending" | "running" | "success" | "failed";
  message: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  finishedAt?: string;
}

/** Manual account readiness — no OAuth yet; user marks status themselves. */
export type AccountKey =
  | "shopee_affiliate"
  | "tiktok_shop_affiliate"
  | "tiktok_app"
  | "facebook";

export type AccountReadyStatus = "not_ready" | "ready" | "logged_in_today";

export interface AccountStatus {
  key: AccountKey;
  label: string;
  platform: "shopee" | "tiktok" | "facebook";
  /** When in the workflow the user must login */
  whenToLogin: string;
  /** What this login is for */
  purpose: string;
  status: AccountReadyStatus;
  /** Official login / bind portal */
  loginUrl: string;
  /** Optional signup / join page */
  signupUrl?: string;
  /** Short label for the primary link button */
  loginCta: string;
  notes?: string;
  updatedAt?: string;
}

/** User preferences for draft scheduling (never auto-publishes). */
export interface AutomationSettings {
  /** Suggested drafts per day (2–3). Default 3. */
  maxPostsPerDay: 2 | 3;
  /**
   * Anti-spam: skip product+channel pairs used within this many days.
   * Default 3. Range 2–7.
   */
  cooldownDays: number;
  /**
   * Auto-skip leftover drafts older than this many days when morning runs.
   * Default 5. Range 3–14. Never skips approved/posted.
   */
  staleDraftDays: number;
  updatedAt?: string;
}

/**
 * Soft experiment hints from evening metrics → next morning.
 * Never guarantees income; never auto-publishes.
 */
export interface LearningState {
  updatedAt: string;
  /** Evening date that produced this learning snapshot. */
  sourceDate: string;
  preferredChannel?: ContentChannel;
  preferredHookIndex?: number;
  preferredCtaIndex?: number;
  /** Suggested HH:mm slot that scored better (soft bias next morning). */
  preferredTime?: string;
  winnerProductIds: string[];
  /** Soft underperformers — mild ranking penalty next morning (experimental). */
  underperformerProductIds?: string[];
  /**
   * High views but zero orders — vanity/engagement-bait signal (soft penalty).
   * Experimental; never auto-blocks posting.
   */
  vanityProductIds?: string[];
  notes: string[];
}

export interface Database {
  products: Product[];
  contentPacks: ContentPack[];
  schedule: ScheduledPost[];
  briefs: DailyBrief[];
  /** Optional job history for Automation Center (JSON DB). */
  automationLogs?: AutomationLog[];
  /** Manual login/readiness status for affiliate + posting apps. */
  accounts?: AccountStatus[];
  /** Draft volume and related prefs. */
  settings?: AutomationSettings;
  /** Last evening learning snapshot for next-day soft bias. */
  learning?: LearningState;
}
