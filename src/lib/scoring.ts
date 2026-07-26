import type {
  Product,
  RankedProduct,
  ScheduledPost,
  ScoreBreakdown,
} from "./types";

/** Impulse-buy sweet spot roughly ฿99–฿799 */
function impulsePriceScore(price: number): number {
  if (price <= 0) return 0;
  if (price >= 99 && price <= 399) return 100;
  if (price > 399 && price <= 799) return 80;
  if (price > 799 && price <= 1499) return 55;
  if (price < 99) return 70;
  return 30;
}

function commissionScore(rate: number): number {
  if (rate >= 20) return 100;
  if (rate >= 12) return 85;
  if (rate >= 8) return 70;
  if (rate >= 5) return 55;
  if (rate >= 2) return 35;
  return 15;
}

function painClarityScore(product: Product): number {
  const pains = product.painPoints.filter((p) => p.trim().length > 0);
  const sells = product.sellingPoints.filter((p) => p.trim().length > 0);
  const painPart = Math.min(pains.length, 3) * 22;
  const sellPart = Math.min(sells.length, 3) * 10;
  const audience = product.targetAudience.trim().length > 8 ? 14 : 0;
  return Math.min(100, painPart + sellPart + audience);
}

function scale1to5(value: number): number {
  const clamped = Math.max(1, Math.min(5, value || 1));
  return ((clamped - 1) / 4) * 100;
}

/** Soft boost 0–100 from manually recorded results (never claims guaranteed income). */
export function performanceBoost(
  productId: string,
  history: ScheduledPost[] = [],
): number {
  const posts = history.filter(
    (p) => p.productId === productId && p.status === "posted" && p.metrics,
  );
  if (posts.length === 0) return 50; // neutral when no data

  let totalScore = 0;
  for (const post of posts) {
    const m = post.metrics!;
    const views = Math.max(m.views, 0);
    const clicks = Math.max(m.clicks, 0);
    const orders = Math.max(m.orders, 0);
    const commission = Math.max(m.commissionEarned, 0);
    const ctr = views > 0 ? clicks / views : 0;
    const cvr = clicks > 0 ? orders / clicks : 0;
    totalScore +=
      Math.min(ctr * 100, 40) +
      Math.min(cvr * 100, 30) +
      Math.min(commission / 50, 30);
  }
  return Math.max(0, Math.min(100, totalScore / posts.length));
}

export function scoreProduct(
  product: Product,
  history: ScheduledPost[] = [],
): ScoreBreakdown {
  const commission = commissionScore(product.commissionRate);
  const impulsePrice = impulsePriceScore(product.price);
  const painClarity = painClarityScore(product);
  const videoEase = scale1to5(product.videoEase);
  const seasonal = scale1to5(product.seasonalScore);
  const historyBoost = performanceBoost(product.id, history);

  // Base fit 85% + learned performance 15% (experimental, data-driven)
  const base =
    commission * 0.25 +
    impulsePrice * 0.2 +
    painClarity * 0.25 +
    videoEase * 0.15 +
    seasonal * 0.15;

  const total = base * 0.85 + historyBoost * 0.15;

  return {
    commission: Math.round(commission),
    impulsePrice: Math.round(impulsePrice),
    painClarity: Math.round(painClarity),
    videoEase: Math.round(videoEase),
    seasonal: Math.round(seasonal),
    total: Math.round(total * 10) / 10,
  };
}

export function rankProducts(
  products: Product[],
  limit = 5,
  history: ScheduledPost[] = [],
): RankedProduct[] {
  return products
    .map((product) => ({ product, score: scoreProduct(product, history) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);
}
