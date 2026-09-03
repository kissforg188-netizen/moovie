import assert from "assert";
import { evaluateApproveGate } from "../src/lib/approve";
import {
  approveQueueToMarkdown,
  buildApproveQueue,
  scoreApprovePriority,
} from "../src/lib/approve-queue";
import {
  qualityBriefLines,
  scoreCaptionQuality,
} from "../src/lib/caption-quality";
import {
  buildDailyDigest,
  dailyDigestToMarkdown,
} from "../src/lib/daily-digest";
import {
  buildTomorrowPlan,
  tomorrowPlanToMarkdown,
} from "../src/lib/tomorrow-plan";
import {
  buildWinnerPlaybook,
  scorePlaybookProduct,
  winnerPlaybookToMarkdown,
} from "../src/lib/winner-playbook";
import {
  buildWeeklyReview,
  weeklyReviewLines,
  weeklyReviewToMarkdown,
} from "../src/lib/weekly-review";
import {
  buildPostingHygiene,
  postingHygieneLines,
  postingHygieneToMarkdown,
} from "../src/lib/posting-hygiene";
import {
  buildResultsIntake,
  resultsIntakeLines,
  resultsIntakeToMarkdown,
  scoreIntakePriority,
} from "../src/lib/results-intake";
import {
  buildCreativePerformance,
  creativeFingerprint,
  creativePerformanceLines,
  creativePerformanceToMarkdown,
} from "../src/lib/creative-performance";
import {
  buildPublishQueue,
  publishQueueLines,
  publishQueueToMarkdown,
  scorePublishPriority,
} from "../src/lib/publish-queue";
import {
  buildSoftRoiLab,
  softRoiLabLines,
  softRoiLabToMarkdown,
} from "../src/lib/roi-lab";
import {
  buildChannelFitLab,
  channelFitLabLines,
  channelFitLabToMarkdown,
} from "../src/lib/channel-fit";
import {
  buildCategoryFitLab,
  categoryFitLabLines,
  categoryFitLabToMarkdown,
  normalizeCategory,
} from "../src/lib/category-fit";
import {
  buildPriceBandFitLab,
  priceBandFitLabLines,
  priceBandFitLabToMarkdown,
  priceBandOf,
} from "../src/lib/price-band";
import {
  buildCommissionBandFitLab,
  commissionBandFitLabLines,
  commissionBandFitLabToMarkdown,
  commissionBandOf,
} from "../src/lib/commission-band";
import {
  buildPainClarityFitLab,
  painClarityBandOf,
  painClarityFitLabLines,
  painClarityFitLabToMarkdown,
  painClarityScoreOf,
} from "../src/lib/pain-clarity";
import {
  buildVideoEaseFitLab,
  videoEaseBandOf,
  videoEaseFitLabLines,
  videoEaseFitLabToMarkdown,
  videoEaseOf,
} from "../src/lib/video-ease";
import {
  buildSeasonalFitLab,
  seasonalBandOf,
  seasonalFitLabLines,
  seasonalFitLabToMarkdown,
  seasonalScoreOf,
} from "../src/lib/seasonal-fit";
import {
  audienceBandOf,
  audienceClarityScoreOf,
  audienceFitLabLines,
  audienceFitLabToMarkdown,
  buildAudienceFitLab,
} from "../src/lib/audience-fit";
import {
  classifyHookStyle,
  hookFitLabLines,
  hookFitLabToMarkdown,
  hookStyleFromIndex,
  hookStyleOf,
  buildHookFitLab,
} from "../src/lib/hook-fit";
import {
  auditDraftCaptions,
  productReadinessIssues,
  sanitizeMarketingText,
} from "../src/lib/compliance";
import {
  withDisclosure,
  AFFILIATE_DISCLOSURE,
  INCOME_DISCLAIMER,
} from "../src/lib/disclosure";
import { generateContentPack } from "../src/lib/content";
import {
  buildPauseSuggestions,
  pauseSuggestionLines,
} from "../src/lib/pause-suggestions";
import {
  detectPlatformFromUrl,
  platformLabelTh,
} from "../src/lib/platform-detect";
import {
  buildPostingPack,
  postingPacksToMarkdown,
} from "../src/lib/posting-pack";
import { regenerateScheduledDraft } from "../src/lib/regenerate";
import {
  approvedTodayToMarkdown,
  briefsToCsv,
  contentPackToMarkdown,
  filmingPlanFromDb,
} from "../src/lib/export";
import {
  buildFilmingQueue,
  filmingQueueLines,
  filmingQueueToMarkdown,
} from "../src/lib/filming";
import { normalizeImportRow, parseCsv, rowsToProducts } from "../src/lib/import";
import { analyzePosted } from "../src/lib/analytics";
import { bangkokParts, todayISO } from "../src/lib/db";
import { buildExperimentPlan, experimentPlanToMarkdown } from "../src/lib/experiments";
import { buildLearningState, learningRankBoost } from "../src/lib/learning";
import {
  explainScore,
  expectedCommissionBaht,
  expectedCommissionScore,
  rankProducts,
  scoreProduct,
} from "../src/lib/scoring";
import {
  buildDailySchedule,
  captionFingerprint,
  channelLabel,
  expireStaleDrafts,
} from "../src/lib/schedule";
import {
  effectiveSeasonalScore,
  eventProximityBoost,
  thaiSeasonBoost,
} from "../src/lib/seasonality";
import {
  normalizeCooldownDays,
  normalizeStaleDraftDays,
  resolveSettings,
} from "../src/lib/settings";
import { weeklyInsightLines, weeklyProductRollup } from "../src/lib/weekly";
import type { Product, ScheduledPost } from "../src/lib/types";

function sample(partial: Partial<Product> & Pick<Product, "id" | "name">): Product {
  const now = new Date().toISOString();
  return {
    platform: "shopee",
    affiliateUrl: "https://example.com",
    price: 199,
    commissionRate: 12,
    category: "ทดสอบ",
    sellingPoints: ["ใช้ง่าย"],
    painPoints: ["ปัญหาชัด"],
    targetAudience: "ผู้ใช้ทั่วไป",
    videoEase: 4,
    seasonalScore: 3,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function run() {
  const cheapHigh = sample({
    id: "a",
    name: "ถูกคอมสูง",
    price: 150,
    commissionRate: 20,
    videoEase: 5,
    seasonalScore: 5,
    painPoints: ["ร้อน", "พกยาก", "เสียงดัง"],
    sellingPoints: ["เบา", "เงียบ", "ชาร์จไว"],
  });
  const expensiveLow = sample({
    id: "b",
    name: "แพงคอมต่ำ",
    price: 5000,
    commissionRate: 1,
    videoEase: 1,
    seasonalScore: 1,
    painPoints: [],
    sellingPoints: [],
  });

  const scoreA = scoreProduct(cheapHigh);
  const scoreB = scoreProduct(expensiveLow);
  assert.ok(scoreA.total > scoreB.total, "สินค้า impulse+คอมสูงควรคะแนนดีกว่า");

  const ranked = rankProducts([expensiveLow, cheapHigh], 5);
  assert.equal(ranked[0].product.id, "a");

  const pack = generateContentPack(cheapHigh, { variant: 0 });
  assert.equal(pack.hooks.length, 5);
  assert.equal(pack.ctas.length, 3);
  assert.equal(pack.sellingAngles.length, 3);
  assert.ok(pack.facebookCaption.includes(AFFILIATE_DISCLOSURE));
  assert.ok(pack.facebookGroupCaption.includes(AFFILIATE_DISCLOSURE));
  assert.ok(pack.reelsCaption.includes(AFFILIATE_DISCLOSURE));
  assert.ok(withDisclosure("ทดสอบ").includes(AFFILIATE_DISCLOSURE));

  const packB = generateContentPack(cheapHigh, { variant: 1 });
  assert.notEqual(
    pack.hooks[0],
    packB.hooks[0],
    "variant ต่างกันควรหมุน hook เพื่อลดสแปม",
  );
  assert.notEqual(
    pack.sellingAngles[0],
    packB.sellingAngles[0],
    "variant ต่างกันควรหมุนมุมขาย",
  );

  // Paused products must be excluded from ranking
  const paused = sample({
    id: "paused",
    name: "พักไว้",
    active: false,
    price: 99,
    commissionRate: 50,
    videoEase: 5,
    seasonalScore: 5,
    painPoints: ["a", "b", "c"],
    sellingPoints: ["x", "y", "z"],
  });
  const rankedActive = rankProducts([paused, expensiveLow], 5);
  assert.ok(
    rankedActive.every((r) => r.product.id !== "paused"),
    "สินค้าที่พักต้องไม่เข้า ranking",
  );

  const schedule = buildDailySchedule({
    date: "2026-07-25",
    ranked: [
      { product: cheapHigh, pack },
      { product: expensiveLow, pack: generateContentPack(expensiveLow) },
    ],
    existing: [],
  });
  assert.ok(schedule.length >= 1 && schedule.length <= 3);
  assert.ok(schedule.every((s) => s.status === "draft"));

  // Even calendar day should prefer facebook_group for evening slot when assigned
  const evenDay = buildDailySchedule({
    date: "2026-07-26",
    ranked: [
      { product: cheapHigh, pack },
      {
        product: sample({ id: "c", name: "กลาง" }),
        pack: generateContentPack(sample({ id: "c", name: "กลาง" })),
      },
      {
        product: sample({ id: "d", name: "กลาง2" }),
        pack: generateContentPack(sample({ id: "d", name: "กลาง2" })),
      },
    ],
    existing: [],
  });
  assert.ok(
    evenDay.some((s) => s.channel === "facebook_group"),
    "วันคู่ควรมี Facebook Group ในคิว",
  );
  assert.equal(channelLabel("facebook_group"), "Facebook Group");

  // Anti-spam: same product+channel within 3 days should be skipped
  const prior: ScheduledPost[] = [
    {
      id: "old",
      date: "2026-07-24",
      suggestedTime: "10:30",
      channel: "tiktok",
      productId: "a",
      contentPackId: pack.id,
      hookIndex: 0,
      ctaIndex: 0,
      status: "posted",
      captionPreview: "x",
    },
  ];
  const antiSpam = buildDailySchedule({
    date: "2026-07-26",
    ranked: [{ product: cheapHigh, pack }],
    existing: prior,
  });
  assert.ok(
    antiSpam.every((s) => !(s.productId === "a" && s.channel === "tiktok")),
    "ไม่ควรจัด tiktok ซ้ำให้สินค้าเดิมภายใน 3 วัน",
  );

  // Channel diversity: prefer different channels in one day when inventory allows
  const diverse = buildDailySchedule({
    date: "2026-07-27",
    ranked: [
      { product: cheapHigh, pack },
      {
        product: sample({ id: "e", name: "สอง" }),
        pack: generateContentPack(sample({ id: "e", name: "สอง" })),
      },
      {
        product: sample({ id: "f", name: "สาม" }),
        pack: generateContentPack(sample({ id: "f", name: "สาม" })),
      },
    ],
    existing: [],
  });
  const channels = new Set(diverse.map((s) => s.channel));
  assert.ok(channels.size >= 2, "วันเดียวควรกระจายอย่างน้อย 2 ช่องทางเมื่อมีสินค้าพอ");

  // Compliance soft-sanitize
  const dirty = sanitizeMarketingText("รับประกันรายได้ รวยแน่ ต้องซื้อเลย!!!");
  assert.equal(dirty.ok, false);
  assert.ok(!dirty.text.includes("รับประกันรายได้"));
  assert.ok(!dirty.text.includes("รวยแน่"));

  // Seasonality: July boosts แกเจ็ต soft; Songkran month boosts พัดลม more
  const julyFan = effectiveSeasonalScore(4, "พัดลม", new Date("2026-07-15T12:00:00Z"));
  const aprilFan = effectiveSeasonalScore(4, "พัดลม", new Date("2026-04-10T12:00:00Z"));
  assert.ok(aprilFan >= julyFan, "พัดลมควรได้ seasonal สูงกว่าช่วงสงกรานต์");
  assert.ok(thaiSeasonBoost("แกเจ็ต", new Date("2026-07-01T12:00:00Z")).boost >= 0);

  // Import CSV
  const csv = `name,platform,affiliateUrl,price,commissionRate,category
สายชาร์จ,shopee,https://shopee.co.th/x,99,16,แกเจ็ต`;
  const imported = rowsToProducts(parseCsv(csv));
  assert.equal(imported.products.length, 1);
  assert.equal(imported.products[0].platform, "shopee");
  assert.equal(imported.duplicates, 0);
  const dupImport = rowsToProducts(parseCsv(csv), ["https://shopee.co.th/x"]);
  assert.equal(dupImport.products.length, 0);
  assert.equal(dupImport.duplicates, 1);
  assert.ok(
    normalizeImportRow({ ชื่อ: "ก", ลิงก์: "https://x.com" })?.name === "ก",
  );

  // Caption fingerprint soft-dedupe
  assert.equal(
    captionFingerprint("Hello   WORLD https://x.com"),
    captionFingerprint("hello world "),
  );

  // Briefs CSV export includes type column
  const briefCsv = briefsToCsv({
    products: [],
    contentPacks: [],
    schedule: [],
    briefs: [
      {
        id: "b1",
        date: "2026-07-27",
        type: "morning",
        topProductIds: ["a"],
        contentPackIds: [],
        scheduleIds: [],
        summary: "สรุปเช้า",
        recommendations: ["ลอง A", "ลอง B"],
        disclaimer: "ทดลอง",
        createdAt: new Date().toISOString(),
      },
    ],
    automationLogs: [],
    accounts: [],
  });
  assert.ok(briefCsv.includes("morning"));
  assert.ok(briefCsv.includes("สรุปเช้า"));

  // Filming checklist on content packs
  assert.ok(pack.filmingChecklist.length >= 5);
  assert.ok(pack.filmingChecklist.some((c) => c.includes("disclosure")));

  // Weekly rollup from manual metrics
  const weeklyPosts: ScheduledPost[] = [
    {
      id: "p1",
      date: "2026-07-26",
      suggestedTime: "10:30",
      channel: "tiktok",
      productId: "a",
      contentPackId: pack.id,
      hookIndex: 0,
      ctaIndex: 0,
      status: "posted",
      captionPreview: "x",
      metrics: {
        views: 1000,
        clicks: 80,
        orders: 4,
        commissionEarned: 120,
        recordedAt: new Date().toISOString(),
      },
    },
    {
      id: "p2",
      date: "2026-07-25",
      suggestedTime: "13:00",
      channel: "facebook_reels",
      productId: "b",
      contentPackId: "pack-b",
      hookIndex: 1,
      ctaIndex: 1,
      status: "posted",
      captionPreview: "y",
      metrics: {
        views: 500,
        clicks: 10,
        orders: 0,
        commissionEarned: 0,
        recordedAt: new Date().toISOString(),
      },
    },
  ];
  const weekly = weeklyProductRollup(
    [cheapHigh, expensiveLow],
    weeklyPosts,
    "2026-07-27",
    7,
  );
  assert.equal(weekly[0].productId, "a");
  assert.ok(weeklyInsightLines(weekly)[0].includes("ถูกคอมสูง"));

  // Platform diversity soft-mix in top N when scores are close
  const manyShopee = [
    sample({ id: "s1", name: "S1", platform: "shopee", commissionRate: 20, price: 150, videoEase: 5, seasonalScore: 5, painPoints: ["a", "b", "c"], sellingPoints: ["x", "y", "z"] }),
    sample({ id: "s2", name: "S2", platform: "shopee", commissionRate: 19, price: 160, videoEase: 5, seasonalScore: 5, painPoints: ["a", "b", "c"], sellingPoints: ["x", "y", "z"] }),
    sample({ id: "s3", name: "S3", platform: "shopee", commissionRate: 18, price: 170, videoEase: 5, seasonalScore: 5, painPoints: ["a", "b", "c"], sellingPoints: ["x", "y", "z"] }),
    sample({ id: "s4", name: "S4", platform: "shopee", commissionRate: 17, price: 180, videoEase: 5, seasonalScore: 5, painPoints: ["a", "b", "c"], sellingPoints: ["x", "y", "z"] }),
    sample({
      id: "t1",
      name: "T1",
      platform: "tiktok_shop",
      commissionRate: 16,
      price: 190,
      videoEase: 5,
      seasonalScore: 5,
      painPoints: ["a", "b", "c"],
      sellingPoints: ["x", "y", "z"],
    }),
  ];
  const mixed = rankProducts(manyShopee, 5);
  assert.ok(
    mixed.some((r) => r.product.platform === "tiktok_shop"),
    "ควรดึง TikTok Shop เข้า Top เมื่อคะแนนใกล้เคียง เพื่อกระจายแพลตฟอร์ม",
  );

  // Settings: cooldown + stale draft defaults
  assert.equal(normalizeCooldownDays(99), 7);
  assert.equal(normalizeCooldownDays(1), 2);
  assert.equal(normalizeStaleDraftDays(1), 3);
  assert.equal(normalizeStaleDraftDays(20), 14);
  const resolved = resolveSettings({
    products: [],
    contentPacks: [],
    schedule: [],
    briefs: [],
  });
  assert.equal(resolved.cooldownDays, 3);
  assert.equal(resolved.staleDraftDays, 5);

  // Configurable cooldown: with cooldownDays=2, gap=3 (วันถัดไปหลังครบ) ว่างอีกครั้ง
  const cooldownPrior: ScheduledPost[] = [
    {
      id: "old2",
      date: "2026-07-24",
      suggestedTime: "10:30",
      channel: "tiktok",
      productId: "a",
      contentPackId: pack.id,
      hookIndex: 0,
      ctaIndex: 0,
      status: "posted",
      captionPreview: "x",
    },
  ];
  const stillBlocked = buildDailySchedule({
    date: "2026-07-26",
    ranked: [{ product: cheapHigh, pack }],
    existing: cooldownPrior,
    cooldownDays: 2,
  });
  assert.ok(
    stillBlocked.every((s) => !(s.productId === "a" && s.channel === "tiktok")),
    "gap=2 กับ cooldown=2 ยังต้องบล็อก",
  );
  const shortCooldown = buildDailySchedule({
    date: "2026-07-27",
    ranked: [{ product: cheapHigh, pack }],
    existing: cooldownPrior,
    cooldownDays: 2,
  });
  assert.ok(
    shortCooldown.some((s) => s.productId === "a" && s.channel === "tiktok"),
    "cooldown 2 วันควรอนุญาต tiktok ซ้ำเมื่อ gap > 2",
  );

  // Stale draft expiry skips old drafts only
  const staleList: ScheduledPost[] = [
    {
      id: "stale",
      date: "2026-07-01",
      suggestedTime: "10:30",
      channel: "tiktok",
      productId: "a",
      contentPackId: pack.id,
      hookIndex: 0,
      ctaIndex: 0,
      status: "draft",
      captionPreview: "old draft",
    },
    {
      id: "fresh",
      date: "2026-07-28",
      suggestedTime: "13:00",
      channel: "facebook_reels",
      productId: "b",
      contentPackId: "p",
      hookIndex: 0,
      ctaIndex: 0,
      status: "draft",
      captionPreview: "fresh",
    },
    {
      id: "kept",
      date: "2026-07-01",
      suggestedTime: "19:30",
      channel: "facebook_post",
      productId: "a",
      contentPackId: pack.id,
      hookIndex: 0,
      ctaIndex: 0,
      status: "approved",
      captionPreview: "approved keep",
    },
  ];
  const expired = expireStaleDrafts(staleList, "2026-07-30", 5);
  assert.ok(expired.expiredIds.includes("stale"));
  assert.equal(staleList.find((s) => s.id === "stale")?.status, "skipped");
  assert.equal(staleList.find((s) => s.id === "fresh")?.status, "draft");
  assert.equal(staleList.find((s) => s.id === "kept")?.status, "approved");

  // August Mother's Day seasonality
  const augGift = thaiSeasonBoost("ของขวัญ", new Date("2026-08-10T12:00:00Z"));
  assert.ok(augGift.label.includes("วันแม่"));
  assert.ok(augGift.boost >= 10);

  // Event proximity: closer to Mother's Day → higher soft boost
  const aug1 = eventProximityBoost("ของขวัญ", new Date("2026-08-01T12:00:00Z"));
  const aug11 = eventProximityBoost("ของขวัญ", new Date("2026-08-11T12:00:00Z"));
  assert.ok(aug1.label?.includes("วันแม่"));
  assert.ok(aug11.boost >= aug1.boost, "ใกล้วันแม่ควรได้ boost สูงกว่าต้นเดือน");
  const augGiftScore = effectiveSeasonalScore(
    4,
    "ของขวัญ",
    new Date("2026-08-11T12:00:00Z"),
  );
  const julyGiftScore = effectiveSeasonalScore(
    4,
    "ของขวัญ",
    new Date("2026-07-11T12:00:00Z"),
  );
  assert.ok(augGiftScore > julyGiftScore, "ของขวัญใกล้วันแม่ควร season สูงกว่ากรกฎาคม");

  // Markdown content pack export includes disclosure + hooks
  const md = contentPackToMarkdown(pack, cheapHigh);
  assert.ok(md.includes(AFFILIATE_DISCLOSURE));
  assert.ok(md.includes("## Hooks"));
  assert.ok(md.includes(cheapHigh.name));

  // Category diversity: avoid stuffing top N with one category when alternatives exist
  const sameCatHeavy = [
    sample({
      id: "g1",
      name: "G1",
      category: "แกเจ็ต",
      commissionRate: 20,
      price: 150,
      videoEase: 5,
      seasonalScore: 5,
      painPoints: ["a", "b", "c"],
      sellingPoints: ["x", "y", "z"],
    }),
    sample({
      id: "g2",
      name: "G2",
      category: "แกเจ็ต",
      commissionRate: 19,
      price: 160,
      videoEase: 5,
      seasonalScore: 5,
      painPoints: ["a", "b", "c"],
      sellingPoints: ["x", "y", "z"],
    }),
    sample({
      id: "g3",
      name: "G3",
      category: "แกเจ็ต",
      commissionRate: 18,
      price: 170,
      videoEase: 5,
      seasonalScore: 5,
      painPoints: ["a", "b", "c"],
      sellingPoints: ["x", "y", "z"],
    }),
    sample({
      id: "h1",
      name: "H1",
      category: "บ้าน",
      commissionRate: 16,
      price: 180,
      videoEase: 5,
      seasonalScore: 5,
      painPoints: ["a", "b", "c"],
      sellingPoints: ["x", "y", "z"],
    }),
  ];
  const catMixed = rankProducts(sameCatHeavy, 3);
  assert.ok(
    catMixed.some((r) => r.product.category === "บ้าน"),
    "ควรดึงหมวดอื่นเข้า Top เมื่อคะแนนใกล้เคียง",
  );

  // Learning soft boost + evening → morning bias
  const learning = buildLearningState(
    [
      {
        post: {
          id: "lp1",
          date: "2026-07-30",
          suggestedTime: "10:30",
          channel: "tiktok",
          productId: "a",
          contentPackId: pack.id,
          hookIndex: 2,
          ctaIndex: 1,
          status: "posted",
          captionPreview: "ok",
          metrics: {
            views: 2000,
            clicks: 100,
            orders: 5,
            commissionEarned: 200,
            recordedAt: new Date().toISOString(),
          },
        },
        productName: "ถูกคอมสูง",
        ctr: 0.05,
        ordersPerClick: 0.05,
        commission: 200,
        commissionPerClick: 2,
        roiPerClick: 2,
        promoSpend: 0,
        roi: null,
        score: 40,
      },
      {
        post: {
          id: "lp2",
          date: "2026-07-30",
          suggestedTime: "13:00",
          channel: "facebook_reels",
          productId: "b",
          contentPackId: "x",
          hookIndex: 0,
          ctaIndex: 0,
          status: "posted",
          captionPreview: "weak",
          metrics: {
            views: 500,
            clicks: 5,
            orders: 0,
            commissionEarned: 0,
            recordedAt: new Date().toISOString(),
          },
        },
        productName: "แพงคอมต่ำ",
        ctr: 0.01,
        ordersPerClick: 0,
        commission: 0,
        commissionPerClick: 0,
        roiPerClick: 0,
        promoSpend: 0,
        roi: null,
        score: 5,
      },
    ],
    "2026-07-30",
  );
  assert.equal(learning.preferredChannel, "tiktok");
  assert.ok(learning.winnerProductIds.includes("a"));
  assert.ok(learning.underperformerProductIds?.includes("b"));
  assert.ok(learningRankBoost("a", learning) > learningRankBoost("b", learning));
  assert.ok(learningRankBoost("b", learning) < 0, "underperformer ควรได้ soft penalty");
  assert.equal(learning.preferredHookIndex, 2);

  const learnedSchedule = buildDailySchedule({
    date: "2026-07-31",
    ranked: [{ product: cheapHigh, pack }],
    existing: [],
    learning,
  });
  assert.ok(learnedSchedule.length >= 1);
  assert.equal(learnedSchedule[0].channel, "tiktok");
  assert.equal(learnedSchedule[0].hookIndex, 2);

  // Approved checklist export
  const approvedMd = approvedTodayToMarkdown(
    {
      products: [cheapHigh],
      contentPacks: [pack],
      schedule: [
        {
          id: "ap1",
          date: "2026-07-31",
          suggestedTime: "10:30",
          channel: "tiktok",
          productId: "a",
          contentPackId: pack.id,
          hookIndex: 0,
          ctaIndex: 0,
          status: "approved",
          captionPreview: `caption with ${AFFILIATE_DISCLOSURE}`,
        },
      ],
      briefs: [],
    },
    "2026-07-31",
  );
  assert.ok(approvedMd.includes("Checklist"));
  assert.ok(approvedMd.includes(AFFILIATE_DISCLOSURE));
  assert.ok(approvedMd.includes("ถูกคอมสูง"));

  // Product notes appear in filming checklist
  const withNotes = generateContentPack(
    sample({ id: "n1", name: "มีโน้ต", notes: "โชว์การพกในกระเป๋า" }),
  );
  assert.ok(withNotes.filmingChecklist.some((c) => c.includes("พกในกระเป๋า")));

  // Platform-aware hooks differ between Shopee and TikTok Shop
  const shopeePack = generateContentPack(
    sample({ id: "ps", name: "Shopee", platform: "shopee" }),
    { variant: 0 },
  );
  const tiktokPack = generateContentPack(
    sample({ id: "pt", name: "TikTok", platform: "tiktok_shop" }),
    { variant: 0 },
  );
  assert.notDeepEqual(shopeePack.hooks, tiktokPack.hooks);

  // Experiment plan + markdown export
  const plan = buildExperimentPlan({
    date: "2026-08-01",
    ranked: [{ product: cheapHigh, score: scoreProduct(cheapHigh) }],
    packs: [pack],
    schedule: [
      {
        id: "exp1",
        date: "2026-08-01",
        suggestedTime: "10:30",
        channel: "tiktok",
        productId: "a",
        contentPackId: pack.id,
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft",
        captionPreview: "draft caption",
      },
    ],
    products: [cheapHigh, expensiveLow],
    learning,
  });
  assert.ok(plan.abTests.length >= 1);
  assert.ok(plan.lines.length >= 2);
  const planMd = experimentPlanToMarkdown(plan);
  assert.ok(planMd.includes("แผนทดลอง"));
  assert.ok(planMd.includes(AFFILIATE_DISCLOSURE) || planMd.includes("ทดลอง"));

  // CTA copy should be Thai (no leftover English fragment)
  assert.ok(
    pack.ctas.every((c) => !/\bdig\b/i.test(c)),
    "CTA ต้องไม่มีคำว่า dig",
  );

  // TikTok caption must not duplicate disclosure / opening hook block
  const tiktokPost = buildDailySchedule({
    date: "2026-08-02",
    ranked: [{ product: cheapHigh, pack }],
    existing: [],
    maxPosts: 1,
  }).find((s) => s.channel === "tiktok");
  if (tiktokPost) {
    const disclosureHits = (
      tiktokPost.captionPreview.match(new RegExp(AFFILIATE_DISCLOSURE, "g")) ?? []
    ).length;
    assert.equal(disclosureHits, 1, "TikTok caption ควรมี disclosure ครั้งเดียว");
  }

  // Daily room: existing active posts reduce how many new drafts can be created
  const filledDay = buildDailySchedule({
    date: "2026-08-02",
    ranked: [
      { product: cheapHigh, pack },
      {
        product: sample({ id: "room2", name: "Room2" }),
        pack: generateContentPack(sample({ id: "room2", name: "Room2" })),
      },
    ],
    existing: [
      {
        id: "ex1",
        date: "2026-08-02",
        suggestedTime: "10:30",
        channel: "tiktok",
        productId: "other",
        contentPackId: "x",
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft",
        captionPreview: "already one",
      },
      {
        id: "ex2",
        date: "2026-08-02",
        suggestedTime: "13:00",
        channel: "facebook_reels",
        productId: "other2",
        contentPackId: "y",
        hookIndex: 0,
        ctaIndex: 0,
        status: "approved",
        captionPreview: "already two",
      },
      {
        id: "ex3",
        date: "2026-08-02",
        suggestedTime: "19:30",
        channel: "facebook_post",
        productId: "other3",
        contentPackId: "z",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted",
        captionPreview: "already three",
      },
    ],
    maxPosts: 3,
  });
  assert.equal(filledDay.length, 0, "วันที่มี draft ครบแล้วต้องไม่สร้างเพิ่ม");

  // Bangkok calendar helpers
  const bkk = bangkokParts(new Date("2026-08-02T20:00:00.000Z")); // 03:00 Aug 3 Bangkok
  assert.equal(bkk.ymd, "2026-08-03");
  assert.equal(todayISO(new Date("2026-08-02T20:00:00.000Z")), "2026-08-03");

  // Back-to-school window after Mother's Day
  const school = eventProximityBoost(
    "แกเจ็ต",
    new Date("2026-08-20T05:00:00.000Z"),
  );
  assert.ok(school.label?.includes("เปิดเทอม"));
  assert.ok(school.boost >= 4);
  const mothersDayGone = eventProximityBoost(
    "ของขวัญ",
    new Date("2026-08-20T05:00:00.000Z"),
  );
  assert.equal(mothersDayGone.boost, 0, "หลังวันแม่ของขวัญทั่วไปไม่ควรได้ event boost เดิม");

  // True ROI when promoSpend recorded; commissionPerClick always available
  const roiAnalysis = analyzePosted(
    [
      {
        id: "roi1",
        date: "2026-08-02",
        suggestedTime: "10:30",
        channel: "tiktok",
        productId: "a",
        contentPackId: pack.id,
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted",
        captionPreview: "x",
        metrics: {
          views: 1000,
          clicks: 50,
          orders: 2,
          commissionEarned: 200,
          promoSpend: 100,
          recordedAt: new Date().toISOString(),
        },
      },
    ],
    [cheapHigh],
  );
  assert.equal(roiAnalysis.performances[0].commissionPerClick, 4);
  assert.ok(roiAnalysis.performances[0].roi != null);
  assert.ok(Math.abs((roiAnalysis.performances[0].roi ?? 0) - 1) < 0.001);
  assert.ok(roiAnalysis.summary.includes("ROI"));

  // Ranking date should affect seasonal score (workflow date, not wall clock only)
  const schoolProduct = sample({
    id: "school",
    name: "กระเป๋านักเรียน",
    category: "นักเรียน",
    seasonalScore: 3,
    commissionRate: 10,
    price: 299,
  });
  const scoreAug20 = scoreProduct(
    schoolProduct,
    [],
    new Date("2026-08-20T05:00:00.000Z"),
  );
  const scoreJan = scoreProduct(
    schoolProduct,
    [],
    new Date("2026-01-15T05:00:00.000Z"),
  );
  assert.ok(
    scoreAug20.seasonal >= scoreJan.seasonal,
    "หมวดนักเรียนช่วงเปิดเทอมปลายควร season ไม่ต่ำกว่ามกราคม",
  );

  // Expected baht commission: tiny high-% should not beat solid mid-ticket
  const tinyHighPct = sample({
    id: "tiny",
    name: "ของถูกคอมสูง",
    price: 20,
    commissionRate: 50,
    videoEase: 3,
    seasonalScore: 3,
    painPoints: ["a"],
    sellingPoints: ["x"],
  });
  const midTicket = sample({
    id: "mid",
    name: "กลางคอมพอดี",
    price: 299,
    commissionRate: 12,
    videoEase: 3,
    seasonalScore: 3,
    painPoints: ["a"],
    sellingPoints: ["x"],
  });
  assert.ok(expectedCommissionBaht(299, 12) > expectedCommissionBaht(20, 50));
  assert.ok(
    expectedCommissionScore(299, 12) > expectedCommissionScore(20, 50),
    "ค่าคอมคาดหวัง (บาท) ของสินค้า mid-ticket ควรสูงกว่าของถูกคอมสูง%",
  );
  const scoreTiny = scoreProduct(tinyHighPct);
  const scoreMid = scoreProduct(midTicket);
  assert.ok(
    scoreMid.expectedCommission > scoreTiny.expectedCommission,
    "breakdown ต้องสะท้อน expected commission",
  );
  assert.ok(typeof scoreMid.historyBoost === "number");
  assert.ok(typeof scoreMid.learningBoost === "number");
  assert.ok(explainScore(midTicket, scoreMid).includes("ค่าคอมคาดหวัง"));

  // Vanity + preferredTime learning
  const vanityLearning = buildLearningState(
    [
      {
        post: {
          id: "v1",
          date: "2026-08-02",
          suggestedTime: "19:30",
          channel: "facebook_post",
          productId: "a",
          contentPackId: pack.id,
          hookIndex: 0,
          ctaIndex: 0,
          status: "posted",
          captionPreview: "ok",
          metrics: {
            views: 2000,
            clicks: 40,
            orders: 2,
            commissionEarned: 80,
            recordedAt: new Date().toISOString(),
          },
        },
        productName: "ถูกคอมสูง",
        ctr: 0.02,
        ordersPerClick: 0.05,
        commission: 80,
        commissionPerClick: 2,
        roiPerClick: 2,
        promoSpend: 0,
        roi: null,
        score: 35,
      },
      {
        post: {
          id: "v2",
          date: "2026-08-02",
          suggestedTime: "10:30",
          channel: "tiktok",
          productId: "b",
          contentPackId: "x",
          hookIndex: 1,
          ctaIndex: 1,
          status: "posted",
          captionPreview: "vanity",
          metrics: {
            views: 800,
            clicks: 5,
            orders: 0,
            commissionEarned: 0,
            recordedAt: new Date().toISOString(),
          },
        },
        productName: "แพงคอมต่ำ",
        ctr: 0.006,
        ordersPerClick: 0,
        commission: 0,
        commissionPerClick: 0,
        roiPerClick: 0,
        promoSpend: 0,
        roi: null,
        score: 4,
      },
    ],
    "2026-08-02",
  );
  assert.equal(vanityLearning.preferredTime, "19:30");
  assert.ok(vanityLearning.vanityProductIds?.includes("b"));
  assert.ok(
    learningRankBoost("b", vanityLearning) < 0,
    "vanity/underperformer ควรได้ soft penalty",
  );

  const timeBiased = buildDailySchedule({
    date: "2026-08-03",
    ranked: [{ product: cheapHigh, pack }],
    existing: [],
    learning: vanityLearning,
    maxPosts: 1,
  });
  assert.equal(timeBiased[0]?.suggestedTime, "19:30");

  // Filming queue prefers easy + high-rank products
  const filmQueue = buildFilmingQueue(
    [
      { product: cheapHigh, score: scoreA },
      { product: expensiveLow, score: scoreB },
    ],
    [pack, generateContentPack(expensiveLow, { variant: 0 })],
    [
      {
        id: "sch-film",
        date: "2026-08-04",
        suggestedTime: "10:30",
        channel: "tiktok",
        productId: "a",
        contentPackId: pack.id,
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft",
        captionPreview: withDisclosure("preview"),
      },
    ],
    "2026-08-04",
  );
  assert.equal(filmQueue[0]?.productId, "a");
  assert.ok(filmQueue[0].priority > filmQueue[1].priority);
  assert.ok(filmQueue[0].onTodaySchedule);
  const filmLines = filmingQueueLines(filmQueue, 2);
  assert.ok(filmLines[0].includes("ถูกคอมสูง"));
  assert.ok(filmingQueueToMarkdown(filmQueue, "2026-08-04").includes("คิวถ่ายวิดีโอ"));

  // Compliance audit catches missing disclosure
  const audit = auditDraftCaptions(
    [
      {
        id: "d1",
        channel: "tiktok",
        captionPreview: "ขายดีอันดับ 1 ต้องซื้อเลย",
        status: "draft",
      },
      {
        id: "d2",
        channel: "facebook_post",
        captionPreview: withDisclosure("แชร์ตัวเลือกนะ"),
        status: "draft",
      },
    ],
    AFFILIATE_DISCLOSURE,
  );
  assert.equal(audit.ok, false);
  assert.ok(audit.findings.some((f) => f.label === "ขาด disclosure"));
  assert.ok(audit.findings.some((f) => f.severity === "warn"));

  const readyLines = productReadinessIssues([
    sample({
      id: "weak",
      name: "ข้อมูลไม่ครบ",
      painPoints: [],
      sellingPoints: [],
      targetAudience: "",
      affiliateUrl: "",
    }),
    cheapHigh,
  ]);
  assert.ok(readyLines[0].includes("ข้อมูลสินค้าไม่ครบ"));

  const filmMd = filmingPlanFromDb(
    {
      products: [cheapHigh, expensiveLow],
      contentPacks: [pack],
      schedule: [],
      briefs: [],
    },
    "2026-08-04",
  );
  assert.ok(filmMd.includes("ถูกคอมสูง"));

  // Approve gate blocks missing disclosure / overclaim
  const gateBad = evaluateApproveGate("ขายดีอันดับ 1 ต้องซื้อเลย");
  assert.equal(gateBad.ok, false);
  assert.ok(gateBad.errors.some((e) => e.includes("disclosure")));
  const gateGood = evaluateApproveGate(withDisclosure("แชร์ตัวเลือกนะ"));
  assert.equal(gateGood.ok, true);

  // Regenerate draft creates a new pack + keeps draft status
  const regenDb = {
    products: [cheapHigh],
    contentPacks: [pack],
    schedule: [
      {
        id: "regen1",
        date: "2026-08-05",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: pack.id,
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft" as const,
        captionPreview: withDisclosure("เก่า"),
      },
    ],
    briefs: [],
  };
  const regen = regenerateScheduledDraft(regenDb, "regen1");
  assert.equal(regen.ok, true);
  assert.equal(regenDb.schedule[0].status, "draft");
  assert.notEqual(regenDb.schedule[0].contentPackId, pack.id);
  assert.ok((regenDb.contentPacks.length ?? 0) >= 2);
  assert.ok(
    evaluateApproveGate(regenDb.schedule[0].captionPreview).ok,
    "regenerated caption must pass approve gate",
  );

  // Pause suggestions are soft-only (never auto-pause)
  const pause = buildPauseSuggestions({
    products: [cheapHigh],
    schedule: [
      {
        id: "p1",
        date: "2026-08-01",
        suggestedTime: "10:30",
        channel: "tiktok",
        productId: cheapHigh.id,
        contentPackId: pack.id,
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted",
        captionPreview: withDisclosure("a"),
        metrics: {
          views: 5000,
          clicks: 30,
          orders: 0,
          commissionEarned: 0,
          recordedAt: "2026-08-01T12:00:00.000Z",
        },
      },
      {
        id: "p2",
        date: "2026-08-02",
        suggestedTime: "10:30",
        channel: "facebook_reels",
        productId: cheapHigh.id,
        contentPackId: pack.id,
        hookIndex: 1,
        ctaIndex: 1,
        status: "posted",
        captionPreview: withDisclosure("b"),
        metrics: {
          views: 4000,
          clicks: 25,
          orders: 0,
          commissionEarned: 0,
          recordedAt: "2026-08-02T12:00:00.000Z",
        },
      },
    ],
    learning: {
      updatedAt: "2026-08-02T20:00:00.000Z",
      sourceDate: "2026-08-02",
      winnerProductIds: [],
      underperformerProductIds: [cheapHigh.id],
      vanityProductIds: [cheapHigh.id],
      notes: [],
    },
  });
  assert.ok(pause.some((s) => s.productId === cheapHigh.id));
  assert.ok(pauseSuggestionLines(pause)[0].includes("พักชั่วคราว"));

  // Platform detect from affiliate URLs
  assert.equal(detectPlatformFromUrl("https://shopee.co.th/product/1"), "shopee");
  assert.equal(detectPlatformFromUrl("https://s.shp.ee/abc"), "shopee");
  assert.equal(
    detectPlatformFromUrl("https://shop.tiktok.com/view/product/1"),
    "tiktok_shop",
  );
  assert.equal(
    detectPlatformFromUrl("https://www.facebook.com/commerce/1"),
    "facebook",
  );
  assert.equal(detectPlatformFromUrl("https://example.com/x"), null);
  assert.equal(platformLabelTh("tiktok_shop"), "TikTok Shop");

  // Import falls back to URL detect when platform omitted
  const importedFromUrl = normalizeImportRow({
    name: "จากลิงก์",
    affiliateUrl: "https://vt.tiktok.com/ZSxxxx/",
    price: 120,
    commissionRate: 15,
  });
  assert.equal(importedFromUrl?.platform, "tiktok_shop");

  // Posting pack: draft is preview-only; approved + disclosure is ready
  const postDraft = {
    id: "sch-pack",
    date: "2026-08-06",
    suggestedTime: "10:30",
    channel: "tiktok" as const,
    productId: cheapHigh.id,
    contentPackId: pack.id,
    hookIndex: 0,
    ctaIndex: 0,
    status: "draft" as const,
    captionPreview: withDisclosure("ช่วยเลือกของชิ้นนี้"),
  };
  const previewPack = buildPostingPack(postDraft, cheapHigh, pack);
  assert.equal(previewPack.readyToCopy, false);
  assert.ok(previewPack.text.includes("Approve"));
  assert.ok(previewPack.complianceOk);

  const approvedPack = buildPostingPack(
    { ...postDraft, status: "approved" },
    cheapHigh,
    pack,
  );
  assert.equal(approvedPack.readyToCopy, true);
  assert.ok(approvedPack.text.includes(cheapHigh.affiliateUrl));
  assert.ok(approvedPack.text.includes("Caption"));

  const mdPacks = postingPacksToMarkdown([approvedPack], "2026-08-06");
  assert.ok(mdPacks.includes("Posting Packs"));
  assert.ok(mdPacks.includes("ไม่โพสต์อัตโนมัติ"));

  // Caption quality: disclosure + soft tone scores higher than spammy overclaim
  const goodCaption = withDisclosure(
    "ช่วยเลือกพัดตั้งโต๊ะเงียบ ๆ ถ้าสนใจลองเปิดดูรายละเอียดก่อนตัดสินใจ #ของใช้ในบ้าน #รีวิวสั้น",
  );
  const goodQ = scoreCaptionQuality(goodCaption, "tiktok");
  assert.ok(goodQ.score >= 70, `expected good caption >=70 got ${goodQ.score}`);
  assert.ok(goodQ.grade === "A" || goodQ.grade === "B");

  const badCaption = "รวยแน่!!! ต้องซื้อเลย รับประกันรายได้";
  const badQ = scoreCaptionQuality(badCaption, "tiktok");
  assert.ok(badQ.score < goodQ.score);
  assert.ok(badQ.tips.some((t) => /disclosure|โฆษณา|เร่งซื้อ|สแปม|ช่วยเลือก/i.test(t)));

  const emptyQ = scoreCaptionQuality("", "facebook_post");
  assert.equal(emptyQ.score, 0);
  assert.equal(emptyQ.grade, "D");

  const qLines = qualityBriefLines(
    [
      {
        captionPreview: goodCaption,
        channel: "tiktok",
        productId: cheapHigh.id,
        status: "draft",
      },
      {
        captionPreview: badCaption,
        channel: "facebook_post",
        productId: expensiveLow.id,
        status: "draft",
      },
    ],
    [cheapHigh, expensiveLow],
  );
  assert.ok(qLines[0].includes("คุณภาพแคปชันวันนี้"));

  // Daily Action Digest: pending drafts + blocked approve + missing metrics
  const digestDb = {
    products: [cheapHigh, expensiveLow],
    contentPacks: [],
    schedule: [
      {
        id: "sched_digest_ok",
        date: "2026-08-08",
        suggestedTime: "10:00",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack_x",
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft" as const,
        captionPreview: goodCaption,
      },
      {
        id: "sched_digest_bad",
        date: "2026-08-08",
        suggestedTime: "12:00",
        channel: "facebook_post" as const,
        productId: expensiveLow.id,
        contentPackId: "pack_y",
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft" as const,
        captionPreview: badCaption,
      },
      {
        id: "sched_digest_posted",
        date: "2026-08-07",
        suggestedTime: "18:00",
        channel: "facebook_reels" as const,
        productId: cheapHigh.id,
        contentPackId: "pack_z",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: goodCaption,
        postedAt: "2026-08-07T11:00:00.000Z",
      },
    ],
    briefs: [],
    automationLogs: [],
  };
  const digest = buildDailyDigest(digestDb as never, "2026-08-08");
  assert.equal(digest.counts.draftPending, 2);
  assert.ok(digest.counts.approveBlocked >= 1);
  assert.ok(digest.counts.missingMetrics >= 1);
  assert.ok(digest.actions.some((a) => a.id.startsWith("blocked-")));
  assert.ok(digest.actions.some((a) => a.id.startsWith("metrics-")));
  assert.ok(digest.lines.some((l) => /Digest 2026-08-08/.test(l)));
  const digestMd = dailyDigestToMarkdown(digest);
  assert.ok(digestMd.includes("Daily Action Digest"));
  assert.ok(digestMd.includes("ไม่โพสต์อัตโนมัติ") || digestMd.includes(AFFILIATE_DISCLOSURE) || digestMd.includes("ทดลอง"));

  // Tomorrow Plan — evening actionable picks + fatigue + markdown
  const midProduct = sample({
    id: "p_mid",
    name: "สินค้ากลาง",
    price: 299,
    commissionRate: 10,
    videoEase: 4,
    painPoints: ["ของรกโต๊ะ"],
    sellingPoints: ["เก็บของง่าย"],
  });
  const tomorrowDb = {
    ...digestDb,
    products: [cheapHigh, expensiveLow, midProduct],
    settings: { maxPostsPerDay: 3 as const, cooldownDays: 3, staleDraftDays: 5 },
    schedule: [
      ...((digestDb as { schedule: ScheduledPost[] }).schedule ?? []),
      {
        id: "sched_tmr_1",
        date: "2026-08-06",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack_a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: goodCaption,
        metrics: {
          views: 1200,
          clicks: 40,
          orders: 2,
          commissionEarned: 80,
          recordedAt: "2026-08-06T12:00:00.000Z",
        },
      },
      {
        id: "sched_tmr_2",
        date: "2026-08-07",
        suggestedTime: "13:00",
        channel: "facebook_reels" as const,
        productId: cheapHigh.id,
        contentPackId: "pack_a",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: goodCaption,
        metrics: {
          views: 800,
          clicks: 20,
          orders: 1,
          commissionEarned: 40,
          recordedAt: "2026-08-07T12:00:00.000Z",
        },
      },
      {
        id: "sched_tmr_3",
        date: "2026-08-08",
        suggestedTime: "19:30",
        channel: "facebook_post" as const,
        productId: cheapHigh.id,
        contentPackId: "pack_a",
        hookIndex: 2,
        ctaIndex: 1,
        status: "draft" as const,
        captionPreview: goodCaption,
      },
    ],
    learning: {
      updatedAt: "2026-08-08T12:00:00.000Z",
      sourceDate: "2026-08-08",
      winnerProductIds: [cheapHigh.id],
      underperformerProductIds: [expensiveLow.id],
      vanityProductIds: [],
      preferredChannel: "tiktok" as const,
      preferredHookIndex: 1,
      notes: ["ทดสอบ learning"],
    },
  };
  const tomorrowPlan = buildTomorrowPlan(tomorrowDb as never, "2026-08-08");
  assert.equal(tomorrowPlan.tomorrowDate, "2026-08-09");
  assert.ok(tomorrowPlan.picks.length >= 1);
  assert.ok(tomorrowPlan.picks.length <= 3);
  assert.ok(tomorrowPlan.checklist.length >= 2);
  assert.ok(tomorrowPlan.channelTips.some((c) => c.channel === "tiktok"));
  // cheapHigh appears 3x in cooldown window → fatigue warning or recentPostCount
  assert.ok(
    tomorrowPlan.fatigueWarnings.some((w) => w.includes(cheapHigh.name)) ||
      tomorrowPlan.picks.some(
        (p) => p.productId === cheapHigh.id && p.recentPostCount >= 3,
      ),
  );
  assert.ok(tomorrowPlan.lines.some((l) => /Tomorrow Plan/.test(l)));
  const tomorrowPlanMd = tomorrowPlanToMarkdown(tomorrowPlan);
  assert.ok(tomorrowPlanMd.includes("Tomorrow Plan"));
  assert.ok(
    tomorrowPlanMd.includes("ไม่โพสต์อัตโนมัติ") ||
      tomorrowPlanMd.includes("ทดลอง"),
  );
  assert.ok(tomorrowPlanMd.includes("Checklist") || tomorrowPlanMd.includes("ถ่าย"));

  // Approve Priority Queue — ready before blocked; never auto-publish
  const readyPriority = scoreApprovePriority({
    gateOk: true,
    qualityScore: 90,
    qualityGrade: "A",
    expectedBahtScore: 85,
    videoEase: 5,
    channel: "tiktok",
    suggestedTime: "10:00",
  });
  const blockedPriority = scoreApprovePriority({
    gateOk: false,
    qualityScore: 90,
    qualityGrade: "A",
    expectedBahtScore: 85,
    videoEase: 5,
    channel: "tiktok",
    suggestedTime: "10:00",
  });
  assert.ok(readyPriority > blockedPriority);

  const approveQueue = buildApproveQueue(tomorrowDb as never, "2026-08-08");
  assert.ok(approveQueue.counts.total >= 2);
  assert.ok(approveQueue.counts.ready >= 1);
  assert.ok(approveQueue.counts.blocked >= 1);
  assert.equal(approveQueue.items[0].band, "ready");
  assert.ok(
    approveQueue.items.some((i) => i.band === "blocked"),
  );
  // Ready items should appear before blocked
  const firstBlockedIdx = approveQueue.items.findIndex((i) => i.band === "blocked");
  const firstReadyIdx = approveQueue.items.findIndex((i) => i.band === "ready");
  assert.ok(firstReadyIdx >= 0 && firstReadyIdx < firstBlockedIdx);
  assert.ok(approveQueue.lines.some((l) => /Approve Queue/.test(l)));
  const approveQueueMd = approveQueueToMarkdown(approveQueue);
  assert.ok(approveQueueMd.includes("Approve Priority Queue"));
  assert.ok(
    approveQueueMd.includes("ไม่โพสต์อัตโนมัติ") ||
      approveQueueMd.includes("ทดลอง"),
  );

  // Winner Playbook — keep/stop/try from metrics; never auto-publish
  const strongScore = scorePlaybookProduct({
    posts: 3,
    orders: 2,
    commission: 300,
    avgCtr: 0.08,
  });
  const weakScore = scorePlaybookProduct({
    posts: 3,
    orders: 0,
    commission: 0,
    avgCtr: 0.01,
  });
  assert.ok(strongScore > weakScore);

  const playbookDb = {
    ...tomorrowDb,
    schedule: [
      ...tomorrowDb.schedule,
      {
        id: "sch-win-1",
        date: "2026-08-07",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `keep ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 1000,
          clicks: 80,
          orders: 3,
          commissionEarned: 240,
        },
      },
      {
        id: "sch-win-2",
        date: "2026-08-06",
        suggestedTime: "13:00",
        channel: "facebook_reels" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 0,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `weak ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 800,
          clicks: 40,
          orders: 0,
          commissionEarned: 0,
        },
      },
      {
        id: "sch-win-3",
        date: "2026-08-05",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 0,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `weak2 ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 600,
          clicks: 30,
          orders: 0,
          commissionEarned: 0,
        },
      },
    ],
  };
  const playbook = buildWinnerPlaybook(playbookDb as never, "2026-08-08", 14);
  assert.ok(playbook.samplePosts >= 2);
  assert.ok(playbook.keepDoing.length >= 1);
  assert.ok(
    playbook.keepDoing.some((k) => k.productId === cheapHigh.id) ||
      playbook.keepDoing[0].commission >= 0,
  );
  assert.ok(playbook.stopOrPause.length >= 1);
  assert.ok(
    playbook.stopOrPause.some((s) => s.productId === expensiveLow.id),
  );
  assert.ok(playbook.experiments.length >= 1);
  assert.ok(playbook.checklist.some((c) => /disclosure|Approve/.test(c)));
  assert.ok(playbook.lines.some((l) => /Winner Playbook/.test(l)));
  assert.ok(
    playbook.disclaimer.includes("ไม่") ||
      playbook.disclaimer.includes("ทดลอง"),
  );
  const playbookMd = winnerPlaybookToMarkdown(playbook);
  assert.ok(playbookMd.includes("Winner Playbook"));
  assert.ok(playbookMd.includes("Keep doing"));
  assert.ok(
    playbookMd.includes("ไม่โพสต์อัตโนมัติ") ||
      playbookMd.includes("ทดลอง"),
  );

  // Weekly Review — rolling 7-day retrospective; never auto-publish
  const weeklyReview = buildWeeklyReview(playbookDb as never, "2026-08-08", 7);
  assert.equal(weeklyReview.windowDays, 7);
  assert.ok(weeklyReview.totals.withMetrics >= 2);
  assert.ok(weeklyReview.totals.commission >= 240);
  assert.ok(weeklyReview.totals.orders >= 3);
  assert.ok(weeklyReview.topPosts.length >= 1);
  assert.ok(
    weeklyReview.topPosts.some((p) => p.productId === cheapHigh.id),
  );
  assert.ok(weeklyReview.productLeaders.length >= 1);
  assert.ok(weeklyReview.channelMix.length >= 1);
  assert.ok(weeklyReview.nextWeekFocus.length >= 1);
  assert.ok(weeklyReview.dataGaps.length >= 1);
  assert.ok(weeklyReview.checklist.some((c) => /disclosure|Approve/.test(c)));
  assert.ok(weeklyReview.lines.some((l) => /Weekly Review/.test(l)));
  assert.ok(weeklyReviewLines(weeklyReview, 3).length <= 3);
  assert.ok(
    weeklyReview.disclaimer.includes("ไม่") ||
      weeklyReview.disclaimer.includes("ทดลอง"),
  );
  const weeklyReviewMd = weeklyReviewToMarkdown(weeklyReview);
  assert.ok(weeklyReviewMd.includes("Weekly Review"));
  assert.ok(weeklyReviewMd.includes("โฟกัสสัปดาห์หน้า"));
  assert.ok(
    weeklyReviewMd.includes("ไม่โพสต์อัตโนมัติ") ||
      weeklyReviewMd.includes("ทดลอง"),
  );

  // Posting Hygiene — anti-spam health; never auto-publish
  const hygieneClean = buildPostingHygiene(
    { ...playbookDb, schedule: [] } as never,
    "2026-08-08",
    7,
  );
  assert.ok(["A", "B"].includes(hygieneClean.grade));
  assert.ok(hygieneClean.score >= 70);
  assert.ok(hygieneClean.todayRoomLeft === hygieneClean.maxPostsPerDay);

  const dupeCaption = `ซ้ำ ๆ กันทั้งวันเพื่อทดสอบ fingerprint hygiene ${AFFILIATE_DISCLOSURE}`;
  const hygieneDb = {
    ...playbookDb,
    settings: {
      maxPostsPerDay: 3 as const,
      cooldownDays: 3,
      staleDraftDays: 5,
    },
    schedule: [
      ...playbookDb.schedule,
      {
        id: "sch-hyg-1",
        date: "2026-08-08",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft" as const,
        captionPreview: dupeCaption,
      },
      {
        id: "sch-hyg-2",
        date: "2026-08-07",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: dupeCaption,
      },
      {
        id: "sch-hyg-3",
        date: "2026-08-06",
        suggestedTime: "13:00",
        channel: "facebook_reels" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `อีกมุม ${AFFILIATE_DISCLOSURE}`,
      },
      {
        id: "sch-hyg-4",
        date: "2026-08-05",
        suggestedTime: "19:30",
        channel: "facebook_post" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 2,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `มุมสาม ${AFFILIATE_DISCLOSURE}`,
      },
    ],
  };
  const hygiene = buildPostingHygiene(hygieneDb as never, "2026-08-08", 7);
  assert.equal(hygiene.windowDays, 7);
  assert.ok(hygiene.hotProducts.some((h) => h.productId === cheapHigh.id));
  assert.ok(hygiene.nearDuplicates.length >= 1);
  assert.ok(hygiene.coolingPairs.length >= 1);
  assert.ok(hygiene.doNotPost.length >= 1);
  assert.ok(hygiene.actions.length >= 1);
  assert.ok(hygiene.checklist.some((c) => /disclosure|Approve/.test(c)));
  assert.ok(hygiene.lines.some((l) => /Posting Hygiene/.test(l)));
  assert.ok(postingHygieneLines(hygiene, 3).length <= 3);
  assert.ok(
    hygiene.disclaimer.includes("ไม่") || hygiene.disclaimer.includes("ทดลอง"),
  );
  const hygieneMd = postingHygieneToMarkdown(hygiene);
  assert.ok(hygieneMd.includes("Posting Hygiene"));
  assert.ok(hygieneMd.includes("อย่าโพสต์") || hygieneMd.includes("Checklist"));
  assert.ok(
    hygieneMd.includes("ไม่โพสต์อัตโนมัติ") || hygieneMd.includes("ทดลอง"),
  );

  // Results Intake — evening metrics queue; never auto-publish / never claim income
  assert.ok(
    scoreIntakePriority({
      band: "overdue",
      completeness: 0,
      daysAgo: 3,
      channel: "tiktok",
      suggestedTime: "10:30",
    }) >
      scoreIntakePriority({
        band: "complete",
        completeness: 90,
        daysAgo: 0,
        channel: "facebook_post",
        suggestedTime: "19:00",
      }),
  );

  const intakeEmpty = buildResultsIntake(
    { ...playbookDb, schedule: [] } as never,
    "2026-08-08",
    7,
  );
  assert.equal(intakeEmpty.counts.postedInWindow, 0);
  assert.equal(intakeEmpty.counts.needsAttention, 0);
  assert.ok(intakeEmpty.actions.some((a) => /ยังไม่มีโพสต์/.test(a.title)));
  assert.ok(intakeEmpty.lines.some((l) => /Results Intake/.test(l)));

  const intakeDb = {
    ...playbookDb,
    schedule: [
      {
        id: "sch-in-1",
        date: "2026-08-08",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `วันนี้ ${AFFILIATE_DISCLOSURE}`,
        // no metrics → today band
      },
      {
        id: "sch-in-2",
        date: "2026-08-05",
        suggestedTime: "13:00",
        channel: "facebook_reels" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `ค้าง ${AFFILIATE_DISCLOSURE}`,
        // empty metrics object → overdue
        metrics: {
          views: 0,
          clicks: 0,
          orders: 0,
          commissionEarned: 0,
          recordedAt: "2026-08-05T20:00:00.000Z",
        },
      },
      {
        id: "sch-in-3",
        date: "2026-08-06",
        suggestedTime: "19:30",
        channel: "facebook_post" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 2,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `บางส่วน ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 1200,
          clicks: 40,
          orders: 0,
          commissionEarned: 0,
          notes: "",
          recordedAt: "2026-08-06T21:00:00.000Z",
        },
      },
      {
        id: "sch-in-4",
        date: "2026-08-07",
        suggestedTime: "11:00",
        channel: "tiktok" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 0,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `ครบ ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 8000,
          clicks: 220,
          orders: 4,
          commissionEarned: 180,
          notes: "hook 1 โอเค",
          recordedAt: "2026-08-07T22:00:00.000Z",
        },
      },
      {
        id: "sch-in-draft",
        date: "2026-08-08",
        suggestedTime: "15:00",
        channel: "facebook_group" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "draft" as const,
        captionPreview: `อย่านับ draft ${AFFILIATE_DISCLOSURE}`,
      },
    ],
  };
  const intake = buildResultsIntake(intakeDb as never, "2026-08-08", 7);
  assert.equal(intake.windowDays, 7);
  assert.equal(intake.counts.postedInWindow, 4);
  assert.ok(intake.counts.today >= 1);
  assert.ok(intake.counts.overdue >= 1);
  assert.ok(intake.counts.partial >= 1);
  assert.ok(intake.counts.complete >= 1);
  assert.ok(intake.counts.needsAttention >= 3);
  assert.ok(intake.rows[0].band !== "complete");
  assert.ok(
    intake.rows.find((r) => r.band === "overdue")!.priority >=
      intake.rows.find((r) => r.band === "complete")!.priority,
  );
  assert.ok(intake.actions.length >= 1);
  assert.ok(intake.checklist.some((c) => /disclosure|โพสต์ด้วยมือ/.test(c)));
  assert.ok(intake.lines.some((l) => /Results Intake/.test(l)));
  assert.ok(resultsIntakeLines(intake, 3).length <= 3);
  assert.ok(
    intake.disclaimer.includes("ไม่") || intake.disclaimer.includes("ทดลอง"),
  );
  const intakeMd = resultsIntakeToMarkdown(intake);
  assert.ok(intakeMd.includes("Results Intake"));
  assert.ok(intakeMd.includes("คิวกรอกผล") || intakeMd.includes("Checklist"));
  assert.ok(
    intakeMd.includes("ไม่โพสต์อัตโนมัติ") || intakeMd.includes("ทดลอง"),
  );

  // Creative Performance — hook/CTA leaderboard from manual metrics
  assert.ok(creativeFingerprint("  Hello!! World  ").includes("hello"));
  assert.equal(
    creativeFingerprint("ทดสอบ Hook A"),
    creativeFingerprint("ทดสอบ hook a!!!"),
  );

  const creativeEmpty = buildCreativePerformance(
    { ...playbookDb, schedule: [], contentPacks: [] } as never,
    "2026-08-08",
    7,
  );
  assert.equal(creativeEmpty.counts.withMetrics, 0);
  assert.ok(creativeEmpty.actions.some((a) => /ยังไม่มีผล/.test(a.title)));
  assert.ok(creativeEmpty.lines.some((l) => /Creative Performance/.test(l)));

  const creativePacks = [
    {
      id: "pack-a",
      productId: cheapHigh.id,
      createdAt: "2026-08-01T00:00:00.000Z",
      disclosure: AFFILIATE_DISCLOSURE,
      hooks: [
        "เจอปัญหาโต๊ะรกไหม",
        "ของชิ้นนี้ช่วยจัดโต๊ะได้จริง",
        "ลองเทียบก่อนซื้อนะ",
        "รีวิวสั้น ๆ จากคนใช้จริง",
        "เลือกของให้ตรงงาน",
      ],
      ctas: [
        "ดูรายละเอียดในลิงก์ได้",
        "เทียบสเปกก่อนตัดสินใจ",
        "ลองดูรีวิวเพิ่มในลิงก์",
      ],
      hashtagsTh: ["#รีวิวของ"],
      hashtagsEn: ["#review"],
      tiktokScript: {
        durationSec: 20,
        scenes: [],
        voiceover: AFFILIATE_DISCLOSURE,
      },
      facebookCaption: AFFILIATE_DISCLOSURE,
      facebookGroupCaption: AFFILIATE_DISCLOSURE,
      reelsCaption: AFFILIATE_DISCLOSURE,
      videoPriorityNote: "ถ่ายใกล้",
      filmingChecklist: ["เปิดไฟ"],
      sellingAngles: ["ช่วยเลือกของ"],
      variant: 0,
    },
    {
      id: "pack-b",
      productId: expensiveLow.id,
      createdAt: "2026-08-01T00:00:00.000Z",
      disclosure: AFFILIATE_DISCLOSURE,
      hooks: [
        "ของแพงต้องคิดก่อน",
        "ใครกำลังลังเลอยู่",
        "เทียบความคุ้มก่อนซื้อ",
        "ถามก่อนว่าจำเป็นไหม",
        "ดูสเปกให้ครบ",
      ],
      ctas: [
        "อ่านสเปกในลิงก์ก่อน",
        "เช็กรีวิวก่อนตัดสินใจ",
        "ค่อย ๆ เลือกได้",
      ],
      hashtagsTh: ["#คิดก่อนซื้อ"],
      hashtagsEn: ["#compare"],
      tiktokScript: {
        durationSec: 25,
        scenes: [],
        voiceover: AFFILIATE_DISCLOSURE,
      },
      facebookCaption: AFFILIATE_DISCLOSURE,
      facebookGroupCaption: AFFILIATE_DISCLOSURE,
      reelsCaption: AFFILIATE_DISCLOSURE,
      videoPriorityNote: "โชว์สเปก",
      filmingChecklist: ["ถ่ายป้ายราคา"],
      sellingAngles: ["ช่วยตัดสินใจ"],
      variant: 1,
    },
  ];

  const creativeDb = {
    ...playbookDb,
    contentPacks: creativePacks,
    schedule: [
      {
        id: "sch-cr-1",
        date: "2026-08-05",
        suggestedTime: "10:30",
        channel: "tiktok" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `ดี ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 5000,
          clicks: 200,
          orders: 5,
          commissionEarned: 250,
          notes: "hook โต๊ะรกดี",
          recordedAt: "2026-08-05T20:00:00.000Z",
        },
      },
      {
        id: "sch-cr-2",
        date: "2026-08-06",
        suggestedTime: "13:00",
        channel: "facebook_reels" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 0,
        ctaIndex: 1,
        status: "posted" as const,
        captionPreview: `ดี2 ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 4000,
          clicks: 160,
          orders: 4,
          commissionEarned: 200,
          recordedAt: "2026-08-06T20:00:00.000Z",
        },
      },
      {
        id: "sch-cr-3",
        date: "2026-08-06",
        suggestedTime: "19:00",
        channel: "facebook_post" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `อ่อน ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 900,
          clicks: 5,
          orders: 0,
          commissionEarned: 0,
          recordedAt: "2026-08-06T21:00:00.000Z",
        },
      },
      {
        id: "sch-cr-4",
        date: "2026-08-07",
        suggestedTime: "11:00",
        channel: "tiktok" as const,
        productId: expensiveLow.id,
        contentPackId: "pack-b",
        hookIndex: 1,
        ctaIndex: 0,
        status: "posted" as const,
        captionPreview: `อ่อน2 ${AFFILIATE_DISCLOSURE}`,
        metrics: {
          views: 700,
          clicks: 3,
          orders: 0,
          commissionEarned: 0,
          recordedAt: "2026-08-07T21:00:00.000Z",
        },
      },
      {
        id: "sch-cr-draft",
        date: "2026-08-08",
        suggestedTime: "15:00",
        channel: "facebook_group" as const,
        productId: cheapHigh.id,
        contentPackId: "pack-a",
        hookIndex: 2,
        ctaIndex: 2,
        status: "draft" as const,
        captionPreview: `อย่านับ ${AFFILIATE_DISCLOSURE}`,
      },
    ],
  };

  const creative = buildCreativePerformance(creativeDb as never, "2026-08-08", 7);
  assert.equal(creative.windowDays, 7);
  assert.equal(creative.counts.withMetrics, 4);
  assert.ok(creative.counts.uniqueHooks >= 2);
  assert.ok(creative.counts.uniqueCtas >= 2);
  assert.ok(creative.hooks.some((h) => h.index === 0 && h.samples >= 2));
  assert.ok(
    creative.hooks.find((h) => h.index === 0)!.avgScore >
      creative.hooks.find((h) => h.index === 1)!.avgScore,
  );
  assert.ok(creative.hooks.some((h) => h.band === "leader" || h.band === "solid"));
  assert.ok(creative.hooks.some((h) => h.band === "weak"));
  assert.ok(creative.tryNext.length >= 1);
  assert.ok(creative.avoidReuse.length >= 1);
  assert.ok(creative.checklist.some((c) => /disclosure|Approve/.test(c)));
  assert.ok(creative.lines.some((l) => /Creative Performance/.test(l)));
  assert.ok(creativePerformanceLines(creative, 3).length <= 3);
  assert.ok(
    creative.disclaimer.includes("ไม่") || creative.disclaimer.includes("ทดลอง"),
  );
  const creativeMd = creativePerformanceToMarkdown(creative);
  assert.ok(creativeMd.includes("Creative Performance"));
  assert.ok(creativeMd.includes("Hook leaderboard") || creativeMd.includes("ลองต่อไป"));
  assert.ok(
    creativeMd.includes("ไม่โพสต์อัตโนมัติ") || creativeMd.includes("ทดลอง"),
  );

  // Manual Publish Queue — approved drafts waiting for human post
  const pubEmpty = buildPublishQueue(
    { products: [], contentPacks: [], schedule: [], briefs: [], automationLogs: [] } as never,
    "2026-08-23",
    new Date("2026-08-23T02:00:00.000Z"),
  );
  assert.equal(pubEmpty.counts.total, 0);
  assert.ok(pubEmpty.summary.includes("Approve") || pubEmpty.summary.includes("โพสต์"));
  assert.ok(pubEmpty.lines.some((l) => /Publish Queue/.test(l)));
  assert.ok(pubEmpty.disclaimer.includes("ทดลอง") || pubEmpty.disclaimer.includes("ไม่"));

  assert.ok(
    scorePublishPriority({
      band: "overdue",
      gateOk: true,
      packReady: true,
      needsFilm: true,
      videoEase: 5,
      expectedBahtScore: 50,
      suggestedTime: "09:00",
      nowMinutes: 10 * 60,
    }) >
      scorePublishPriority({
        band: "upcoming",
        gateOk: true,
        packReady: true,
        needsFilm: false,
        videoEase: 3,
        expectedBahtScore: 10,
        suggestedTime: "20:00",
        nowMinutes: 10 * 60,
      }),
  );

  const pubProduct = {
    id: "prod_pub",
    name: "พัดลมพกพา",
    platform: "shopee" as const,
    affiliateUrl: "https://s.shopee.co.th/pub1",
    price: 299,
    commissionRate: 12,
    category: "gadget",
    painPoints: ["ร้อนในรถ"],
    sellingPoints: ["พกง่าย", "เงียบ"],
    targetAudience: "คนขับรถ",
    videoEase: 4,
    seasonalScore: 3,
    notes: "",
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const pubDisclosure = AFFILIATE_DISCLOSURE;
  const pubPack = {
    id: "pack_pub",
    productId: "prod_pub",
    createdAt: "2026-08-23T01:00:00.000Z",
    disclosure: pubDisclosure,
    hooks: ["ร้อนในรถไหม"],
    ctas: ["ดูรายละเอียดในลิงก์ได้"],
    hashtagsTh: ["#รีวิวของใช้"],
    hashtagsEn: ["#shopee"],
    tiktokScript: {
      durationSec: 20,
      scenes: [{ time: "0-5", line: "เปิด", visual: "มือถือ" }],
      voiceover: pubDisclosure,
    },
    facebookCaption: `ลองของชิ้นนี้ดูนะ ${pubDisclosure}`,
    facebookGroupCaption: `แชร์ของใช้จริง ${pubDisclosure}`,
    reelsCaption: `คลิปสั้น ${pubDisclosure}`,
    videoPriorityNote: "โชว์พัดลม",
    filmingChecklist: ["โชว์พัดลม"],
    sellingAngles: ["พกง่าย"],
    variant: 1,
  };
  const pubSchedule = [
    {
      id: "sch_overdue",
      date: "2026-08-22",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_pub",
      contentPackId: "pack_pub",
      status: "approved" as const,
      captionPreview: `แคปชันค้าง ${pubDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
    {
      id: "sch_due",
      date: "2026-08-23",
      suggestedTime: "08:00",
      channel: "facebook_post" as const,
      productId: "prod_pub",
      contentPackId: "pack_pub",
      status: "approved" as const,
      captionPreview: `แคปชันถึงเวลา ${pubDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
    {
      id: "sch_later",
      date: "2026-08-23",
      suggestedTime: "18:00",
      channel: "facebook_reels" as const,
      productId: "prod_pub",
      contentPackId: "pack_pub",
      status: "approved" as const,
      captionPreview: `แคปชันเย็น ${pubDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
    {
      id: "sch_draft",
      date: "2026-08-23",
      suggestedTime: "09:00",
      channel: "tiktok" as const,
      productId: "prod_pub",
      contentPackId: "pack_pub",
      status: "draft" as const,
      captionPreview: `ยัง draft ${pubDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  // 02:00 UTC = 09:00 Bangkok on 2026-08-23
  const pubQueue = buildPublishQueue(
    {
      products: [pubProduct],
      contentPacks: [pubPack],
      schedule: pubSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    new Date("2026-08-23T02:00:00.000Z"),
  );
  assert.equal(pubQueue.counts.total, 3);
  assert.equal(pubQueue.counts.overdue, 1);
  assert.equal(pubQueue.counts.dueNow, 1);
  assert.equal(pubQueue.counts.today, 1);
  assert.equal(pubQueue.items[0].band, "overdue");
  assert.ok(pubQueue.counts.needsAttention >= 2);
  assert.ok(pubQueue.items.every((i) => i.steps.length >= 3));
  assert.ok(publishQueueLines(pubQueue, 3).length <= 3);
  const pubMd = publishQueueToMarkdown(pubQueue);
  assert.ok(pubMd.includes("Manual Publish Queue"));
  assert.ok(pubMd.includes("ไม่โพสต์อัตโนมัติ"));
  assert.ok(pubMd.includes("Checklist"));

  // --- Soft ROI Lab ---
  const roiDisclosure =
    "ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน";
  const roiProduct = {
    id: "prod_roi",
    name: "พัดลมตั้งโต๊ะมินิ",
    platform: "shopee" as const,
    affiliateUrl: "https://s.shopee.co.th/roi",
    price: 299,
    commissionRate: 12,
    category: "gadget",
    sellingPoints: ["เงียบ", "พกง่าย"],
    painPoints: ["ร้อนในห้อง"],
    targetAudience: "คนทำงานบ้าน",
    videoEase: 4,
    seasonalScore: 4,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const roiOther = {
    ...roiProduct,
    id: "prod_roi_cold",
    name: "สายชาร์จถูก",
    price: 39,
    commissionRate: 5,
  };
  const roiSchedule = [
    {
      id: "sch_roi_1",
      date: "2026-08-20",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_roi",
      contentPackId: "pack_roi",
      status: "posted" as const,
      captionPreview: `แคป1 ${roiDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2000,
        clicks: 80,
        orders: 4,
        commissionEarned: 60,
        promoSpend: 20,
      },
    },
    {
      id: "sch_roi_2",
      date: "2026-08-21",
      suggestedTime: "13:00",
      channel: "facebook_reels" as const,
      productId: "prod_roi",
      contentPackId: "pack_roi",
      status: "posted" as const,
      captionPreview: `แคป2 ${roiDisclosure}`,
      hookIndex: 1,
      ctaIndex: 1,
      metrics: {
        views: 1500,
        clicks: 50,
        orders: 3,
        commissionEarned: 45,
        promoSpend: 10,
      },
    },
    {
      id: "sch_roi_3",
      date: "2026-08-22",
      suggestedTime: "19:30",
      channel: "facebook_post" as const,
      productId: "prod_roi",
      contentPackId: "pack_roi",
      status: "posted" as const,
      captionPreview: `แคป3 ${roiDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 900,
        clicks: 30,
        orders: 2,
        commissionEarned: 30,
      },
    },
    {
      id: "sch_roi_today",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_roi",
      contentPackId: "pack_roi",
      status: "approved" as const,
      captionPreview: `วันนี้ ${roiDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const roiLab = buildSoftRoiLab(
    {
      products: [roiProduct, roiOther],
      contentPacks: [],
      schedule: roiSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(roiLab.counts.postsWithMetrics >= 3);
  assert.ok(roiLab.counts.spendTracked >= 2);
  assert.ok(roiLab.baseline.avgCommissionPerPost > 0);
  assert.ok(roiLab.baseline.avgRoi != null);
  const roiRow = roiLab.products.find((p) => p.productId === "prod_roi");
  assert.ok(roiRow);
  assert.equal(roiRow!.samples, 3);
  assert.ok(roiRow!.rangeHigh >= roiRow!.rangeMid);
  assert.ok(roiRow!.rangeMid >= roiRow!.rangeLow);
  assert.ok(["promising", "watch"].includes(roiRow!.band));
  assert.ok(roiLab.projections.length >= 1);
  assert.equal(roiLab.projections[0].productId, "prod_roi");
  assert.ok(roiLab.projections[0].projectedMid > 0);
  assert.ok(softRoiLabLines(roiLab, 3).length <= 3);
  const roiMd = softRoiLabToMarkdown(roiLab);
  assert.ok(roiMd.includes("Soft ROI Lab"));
  assert.ok(roiMd.includes("ทดลอง"));
  assert.ok(roiMd.includes("ไม่รับประกัน") || roiMd.includes(INCOME_DISCLAIMER.slice(0, 10)));

  // empty lab still safe
  const emptyLab = buildSoftRoiLab(
    {
      products: [roiOther],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyLab.counts.postsWithMetrics, 0);
  assert.ok(emptyLab.summary.includes("ยังไม่มีเมตริก") || emptyLab.score <= 50);

  // --- Channel Fit Lab ---
  const fitDisclosure =
    "ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน";
  const fitProduct = {
    id: "prod_fit",
    name: "กันแดดทาหน้าบางเบา",
    platform: "shopee" as const,
    affiliateUrl: "https://s.shopee.co.th/fit",
    price: 259,
    commissionRate: 15,
    category: "beauty",
    sellingPoints: ["บางเบา", "ไม่วอก"],
    painPoints: ["หน้ามันกลางวัน"],
    targetAudience: "คนทำงานออฟฟิศ",
    videoEase: 5,
    seasonalScore: 4,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const fitSchedule = [
    {
      id: "sch_fit_tt1",
      date: "2026-08-18",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_fit",
      contentPackId: "pack_fit",
      status: "posted" as const,
      captionPreview: `tt1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 3000,
        clicks: 120,
        orders: 6,
        commissionEarned: 90,
      },
    },
    {
      id: "sch_fit_tt2",
      date: "2026-08-19",
      suggestedTime: "11:00",
      channel: "tiktok" as const,
      productId: "prod_fit",
      contentPackId: "pack_fit",
      status: "posted" as const,
      captionPreview: `tt2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 2800,
        clicks: 100,
        orders: 5,
        commissionEarned: 75,
      },
    },
    {
      id: "sch_fit_tt3",
      date: "2026-08-20",
      suggestedTime: "12:00",
      channel: "tiktok" as const,
      productId: "prod_fit",
      contentPackId: "pack_fit",
      status: "posted" as const,
      captionPreview: `tt3 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 1,
      metrics: {
        views: 2500,
        clicks: 90,
        orders: 4,
        commissionEarned: 60,
      },
    },
    {
      id: "sch_fit_reels",
      date: "2026-08-21",
      suggestedTime: "13:00",
      channel: "facebook_reels" as const,
      productId: "prod_fit",
      contentPackId: "pack_fit",
      status: "posted" as const,
      captionPreview: `reels ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 800,
        clicks: 15,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_fit_today_weak",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "facebook_reels" as const,
      productId: "prod_fit",
      contentPackId: "pack_fit",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const fitLab = buildChannelFitLab(
    {
      products: [fitProduct],
      contentPacks: [],
      schedule: fitSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(fitLab.counts.postsWithMetrics >= 4);
  assert.ok(fitLab.counts.channelsWithData >= 2);
  const ttRow = fitLab.channels.find((c) => c.channel === "tiktok");
  const reelsRow = fitLab.channels.find((c) => c.channel === "facebook_reels");
  assert.ok(ttRow);
  assert.ok(reelsRow);
  assert.ok(ttRow!.score > reelsRow!.score);
  assert.ok(["strong", "ok"].includes(ttRow!.band));
  assert.ok(fitLab.counts.unbalanced === true || ttRow!.shareOfPosts >= 0.5);
  assert.ok(fitLab.suggestions.length >= 1);
  assert.equal(fitLab.suggestions[0].suggestedChannel, "tiktok");
  assert.ok(channelFitLabLines(fitLab, 3).length <= 3);
  const fitMd = channelFitLabToMarkdown(fitLab);
  assert.ok(fitMd.includes("Channel Fit Lab"));
  assert.ok(fitMd.includes("ทดลอง"));
  assert.ok(fitMd.includes("ไม่เปลี่ยนอัตโนมัติ") || fitMd.includes("Approve"));
  assert.ok(
    fitMd.includes("ไม่รับประกัน") ||
      fitMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyFit = buildChannelFitLab(
    {
      products: [fitProduct],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyFit.counts.postsWithMetrics, 0);
  assert.ok(
    emptyFit.summary.includes("ยังไม่มีเมตริก") || emptyFit.score <= 50,
  );

  // --- Category Fit Lab ---
  assert.equal(normalizeCategory("  Beauty / Skincare "), "beauty skincare");
  assert.equal(normalizeCategory(""), "uncategorized");
  assert.equal(normalizeCategory("แกเจ็ต"), "แกเจ็ต");
  assert.equal(normalizeCategory("สกินแคร์"), "สกินแคร์");

  const catBeauty = {
    ...fitProduct,
    id: "prod_cat_beauty",
    name: "กันแดดหมวดความงาม",
    category: "beauty",
  };
  const catHome = {
    ...fitProduct,
    id: "prod_cat_home",
    name: "กล่องเก็บสายไฟ",
    category: "home",
    price: 189,
    commissionRate: 12,
  };
  const catSchedule = [
    {
      id: "sch_cat_b1",
      date: "2026-08-18",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_cat_beauty",
      contentPackId: "pack_cat",
      status: "posted" as const,
      captionPreview: `b1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 3200,
        clicks: 130,
        orders: 7,
        commissionEarned: 95,
      },
    },
    {
      id: "sch_cat_b2",
      date: "2026-08-19",
      suggestedTime: "11:00",
      channel: "tiktok" as const,
      productId: "prod_cat_beauty",
      contentPackId: "pack_cat",
      status: "posted" as const,
      captionPreview: `b2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 2900,
        clicks: 110,
        orders: 5,
        commissionEarned: 80,
      },
    },
    {
      id: "sch_cat_b3",
      date: "2026-08-20",
      suggestedTime: "12:00",
      channel: "facebook_reels" as const,
      productId: "prod_cat_beauty",
      contentPackId: "pack_cat",
      status: "posted" as const,
      captionPreview: `b3 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 1,
      metrics: {
        views: 2600,
        clicks: 95,
        orders: 4,
        commissionEarned: 70,
      },
    },
    {
      id: "sch_cat_h1",
      date: "2026-08-21",
      suggestedTime: "13:00",
      channel: "facebook_post" as const,
      productId: "prod_cat_home",
      contentPackId: "pack_cat_h",
      status: "posted" as const,
      captionPreview: `h1 ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 700,
        clicks: 12,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_cat_today_cold",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_cat_home",
      contentPackId: "pack_cat_h",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const catLab = buildCategoryFitLab(
    {
      products: [catBeauty, catHome],
      contentPacks: [],
      schedule: catSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(catLab.counts.postsWithMetrics >= 4);
  assert.ok(catLab.counts.categoriesWithData >= 2);
  const beautyRow = catLab.categories.find((c) => c.category === "beauty");
  const homeRow = catLab.categories.find((c) => c.category === "home");
  assert.ok(beautyRow);
  assert.ok(homeRow);
  assert.ok(beautyRow!.score > homeRow!.score);
  assert.ok(["hot", "steady"].includes(beautyRow!.band));
  assert.ok(catLab.counts.unbalanced === true || beautyRow!.shareOfPosts >= 0.5);
  assert.ok(catLab.suggestions.length >= 1);
  assert.ok(
    catLab.suggestions[0].suggestedCategory.toLowerCase().includes("beauty"),
  );
  assert.ok(categoryFitLabLines(catLab, 3).length <= 3);
  const catMd = categoryFitLabToMarkdown(catLab);
  assert.ok(catMd.includes("Category Fit Lab"));
  assert.ok(catMd.includes("ทดลอง"));
  assert.ok(catMd.includes("ไม่เปลี่ยนอัตโนมัติ") || catMd.includes("Approve"));
  assert.ok(
    catMd.includes("ไม่รับประกัน") ||
      catMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyCat = buildCategoryFitLab(
    {
      products: [catBeauty, catHome],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyCat.counts.postsWithMetrics, 0);
  assert.ok(
    emptyCat.summary.includes("ยังไม่มีเมตริก") || emptyCat.score <= 50,
  );

  // --- Price Band Lab ---
  assert.equal(priceBandOf(50), "under99");
  assert.equal(priceBandOf(199), "impulse99_399");
  assert.equal(priceBandOf(500), "mid400_799");
  assert.equal(priceBandOf(1000), "mid800_1499");
  assert.equal(priceBandOf(2000), "premium1500");

  const bandImpulse: Product = {
    ...fitProduct,
    id: "prod_band_impulse",
    name: "ครีมทาแก้ม Impulse",
    price: 199,
    commissionRate: 15,
    category: "beauty",
    painPoints: ["ผิวแห้ง"],
    sellingPoints: ["ซึมเร็ว"],
    targetAudience: "คนงบไม่เกินสามร้อย",
    videoEase: 5,
    seasonalScore: 4,
  };
  const bandPremium: Product = {
    ...fitProduct,
    id: "prod_band_premium",
    name: "เครื่องนวดพรีเมียม",
    price: 1890,
    commissionRate: 8,
    category: "home",
    painPoints: ["ปวดไหล่"],
    sellingPoints: ["เงียบ"],
    targetAudience: "คนทำงานออฟฟิศ",
    videoEase: 3,
    seasonalScore: 3,
  };
  const bandSchedule = [
    {
      id: "sch_band_i1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_band_impulse",
      contentPackId: "pack_band_i",
      status: "posted" as const,
      captionPreview: `i1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2000,
        clicks: 120,
        orders: 8,
        commissionEarned: 240,
      },
    },
    {
      id: "sch_band_i2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_band_impulse",
      contentPackId: "pack_band_i",
      status: "posted" as const,
      captionPreview: `i2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 1800,
        clicks: 100,
        orders: 7,
        commissionEarned: 210,
      },
    },
    {
      id: "sch_band_i3",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_band_impulse",
      contentPackId: "pack_band_i",
      status: "posted" as const,
      captionPreview: `i3 ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 1600,
        clicks: 90,
        orders: 6,
        commissionEarned: 180,
      },
    },
    {
      id: "sch_band_p1",
      date: "2026-08-20",
      suggestedTime: "14:00",
      channel: "tiktok" as const,
      productId: "prod_band_premium",
      contentPackId: "pack_band_p",
      status: "posted" as const,
      captionPreview: `p1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 500,
        clicks: 8,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_band_today_cold",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_band_premium",
      contentPackId: "pack_band_p",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const bandLab = buildPriceBandFitLab(
    {
      products: [bandImpulse, bandPremium],
      contentPacks: [],
      schedule: bandSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(bandLab.counts.postsWithMetrics >= 4);
  assert.ok(bandLab.counts.bandsWithData >= 2);
  const impulseRow = bandLab.bands.find((b) => b.band === "impulse99_399");
  const premiumRow = bandLab.bands.find((b) => b.band === "premium1500");
  assert.ok(impulseRow);
  assert.ok(premiumRow);
  assert.ok(impulseRow!.score > premiumRow!.score);
  assert.ok(["hot", "steady"].includes(impulseRow!.status));
  assert.ok(
    bandLab.counts.unbalanced === true || impulseRow!.shareOfPosts >= 0.5,
  );
  assert.ok(bandLab.suggestions.length >= 1);
  assert.ok(
    bandLab.suggestions[0].suggestedLabel.toLowerCase().includes("impulse") ||
      bandLab.suggestions[0].suggestedBand === "impulse99_399",
  );
  assert.ok(priceBandFitLabLines(bandLab, 3).length <= 3);
  const bandMd = priceBandFitLabToMarkdown(bandLab);
  assert.ok(bandMd.includes("Price Band Lab"));
  assert.ok(bandMd.includes("ทดลอง"));
  assert.ok(bandMd.includes("ไม่เปลี่ยนอัตโนมัติ") || bandMd.includes("Approve"));
  assert.ok(
    bandMd.includes("ไม่รับประกัน") ||
      bandMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyBand = buildPriceBandFitLab(
    {
      products: [bandImpulse, bandPremium],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyBand.counts.postsWithMetrics, 0);
  assert.ok(
    emptyBand.summary.includes("ยังไม่มีเมตริก") || emptyBand.score <= 50,
  );

  // --- Commission Band Lab ---
  assert.equal(commissionBandOf(5), "under8");
  assert.equal(commissionBandOf(10), "mid8_11");
  assert.equal(commissionBandOf(15), "good12_19");
  assert.equal(commissionBandOf(25), "strong20_29");
  assert.equal(commissionBandOf(35), "high30");

  const rateGood: Product = {
    ...fitProduct,
    id: "prod_rate_good",
    name: "ครีมทาแก้ม คอมดี",
    price: 199,
    commissionRate: 15,
    category: "beauty",
    painPoints: ["ผิวแห้ง"],
    sellingPoints: ["ซึมเร็ว"],
    targetAudience: "คนงบไม่เกินสามร้อย",
    videoEase: 5,
    seasonalScore: 4,
  };
  const rateThin: Product = {
    ...fitProduct,
    id: "prod_rate_thin",
    name: "สายชาร์จ คอมต่ำ",
    price: 89,
    commissionRate: 4,
    category: "gadget",
    painPoints: ["สายพัน"],
    sellingPoints: ["สั้น"],
    targetAudience: "นักศึกษา",
    videoEase: 4,
    seasonalScore: 2,
  };
  const rateSchedule = [
    {
      id: "sch_rate_g1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_rate_good",
      contentPackId: "pack_rate_g",
      status: "posted" as const,
      captionPreview: `g1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2000,
        clicks: 120,
        orders: 8,
        commissionEarned: 240,
      },
    },
    {
      id: "sch_rate_g2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_rate_good",
      contentPackId: "pack_rate_g",
      status: "posted" as const,
      captionPreview: `g2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 1800,
        clicks: 100,
        orders: 7,
        commissionEarned: 210,
      },
    },
    {
      id: "sch_rate_g3",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_rate_good",
      contentPackId: "pack_rate_g",
      status: "posted" as const,
      captionPreview: `g3 ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 1600,
        clicks: 90,
        orders: 6,
        commissionEarned: 180,
      },
    },
    {
      id: "sch_rate_t1",
      date: "2026-08-20",
      suggestedTime: "14:00",
      channel: "tiktok" as const,
      productId: "prod_rate_thin",
      contentPackId: "pack_rate_t",
      status: "posted" as const,
      captionPreview: `t1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 500,
        clicks: 8,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_rate_today_cold",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_rate_thin",
      contentPackId: "pack_rate_t",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const rateLab = buildCommissionBandFitLab(
    {
      products: [rateGood, rateThin],
      contentPacks: [],
      schedule: rateSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(rateLab.counts.postsWithMetrics >= 4);
  assert.ok(rateLab.counts.bandsWithData >= 2);
  const goodRow = rateLab.bands.find((b) => b.band === "good12_19");
  const thinRow = rateLab.bands.find((b) => b.band === "under8");
  assert.ok(goodRow);
  assert.ok(thinRow);
  assert.ok(goodRow!.score > thinRow!.score);
  assert.ok(["hot", "steady"].includes(goodRow!.status));
  assert.ok(
    rateLab.counts.unbalanced === true || goodRow!.shareOfPosts >= 0.5,
  );
  assert.ok(rateLab.suggestions.length >= 1);
  assert.ok(
    rateLab.suggestions[0].suggestedLabel.includes("12") ||
      rateLab.suggestions[0].suggestedBand === "good12_19",
  );
  assert.ok(commissionBandFitLabLines(rateLab, 3).length <= 3);
  const rateMd = commissionBandFitLabToMarkdown(rateLab);
  assert.ok(rateMd.includes("Commission Band Lab"));
  assert.ok(rateMd.includes("ทดลอง"));
  assert.ok(rateMd.includes("ไม่เปลี่ยนอัตโนมัติ") || rateMd.includes("Approve"));
  assert.ok(
    rateMd.includes("ไม่รับประกัน") ||
      rateMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyRate = buildCommissionBandFitLab(
    {
      products: [rateGood, rateThin],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyRate.counts.postsWithMetrics, 0);
  assert.ok(
    emptyRate.summary.includes("ยังไม่มีเมตริก") || emptyRate.score <= 50,
  );

  // --- Pain Clarity Lab ---
  assert.equal(painClarityBandOf(0), "empty");
  assert.equal(painClarityBandOf(30), "thin");
  assert.equal(painClarityBandOf(50), "solid");
  assert.equal(painClarityBandOf(70), "clear");
  assert.equal(painClarityBandOf(90), "sharp");

  const painSharp: Product = {
    ...fitProduct,
    id: "prod_pain_sharp",
    name: "ที่แขวนผนัง แก้ปัญหาชัด",
    price: 199,
    commissionRate: 12,
    category: "home",
    painPoints: ["ของรกบนโต๊ะ", "หาของไม่เจอ", "เสียเวลาเก็บทุกเช้า"],
    sellingPoints: ["ติดง่าย", "ประหยัดพื้นที่", "ถอดล้างได้"],
    targetAudience: "คนอยู่คอนโดพื้นที่จำกัด",
    videoEase: 5,
    seasonalScore: 4,
  };
  assert.ok(painClarityScoreOf(painSharp) >= 85);
  assert.equal(painClarityBandOf(painClarityScoreOf(painSharp)), "sharp");

  const painEmpty: Product = {
    ...fitProduct,
    id: "prod_pain_empty",
    name: "สายชาร์จ ไม่มี brief",
    price: 89,
    commissionRate: 8,
    category: "gadget",
    painPoints: [],
    sellingPoints: [],
    targetAudience: "",
    videoEase: 3,
    seasonalScore: 2,
  };
  assert.equal(painClarityScoreOf(painEmpty), 0);
  assert.equal(painClarityBandOf(painClarityScoreOf(painEmpty)), "empty");

  const painSchedule = [
    {
      id: "sch_pain_s1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_pain_sharp",
      contentPackId: "pack_pain_s",
      status: "posted" as const,
      captionPreview: `s1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2200,
        clicks: 130,
        orders: 9,
        commissionEarned: 260,
      },
    },
    {
      id: "sch_pain_s2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_pain_sharp",
      contentPackId: "pack_pain_s",
      status: "posted" as const,
      captionPreview: `s2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 1900,
        clicks: 110,
        orders: 8,
        commissionEarned: 220,
      },
    },
    {
      id: "sch_pain_s3",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_pain_sharp",
      contentPackId: "pack_pain_s",
      status: "posted" as const,
      captionPreview: `s3 ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 1700,
        clicks: 95,
        orders: 7,
        commissionEarned: 190,
      },
    },
    {
      id: "sch_pain_e1",
      date: "2026-08-20",
      suggestedTime: "14:00",
      channel: "tiktok" as const,
      productId: "prod_pain_empty",
      contentPackId: "pack_pain_e",
      status: "posted" as const,
      captionPreview: `e1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 400,
        clicks: 5,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_pain_today_cold",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_pain_empty",
      contentPackId: "pack_pain_e",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const painLab = buildPainClarityFitLab(
    {
      products: [painSharp, painEmpty],
      contentPacks: [],
      schedule: painSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(painLab.counts.postsWithMetrics >= 4);
  assert.ok(painLab.counts.bandsWithData >= 2);
  const sharpRow = painLab.bands.find((b) => b.band === "sharp");
  const emptyRow = painLab.bands.find((b) => b.band === "empty");
  assert.ok(sharpRow);
  assert.ok(emptyRow);
  assert.ok(sharpRow!.score > emptyRow!.score);
  assert.ok(["hot", "steady"].includes(sharpRow!.status));
  assert.ok(
    painLab.counts.unbalanced === true || sharpRow!.shareOfPosts >= 0.5,
  );
  assert.ok(painLab.suggestions.length >= 1);
  assert.ok(
    painLab.suggestions[0].suggestedBand === "sharp" ||
      painLab.suggestions[0].suggestedLabel.includes("คม"),
  );
  assert.ok(painClarityFitLabLines(painLab, 3).length <= 3);
  const painMd = painClarityFitLabToMarkdown(painLab);
  assert.ok(painMd.includes("Pain Clarity Lab"));
  assert.ok(painMd.includes("ทดลอง"));
  assert.ok(painMd.includes("ไม่เปลี่ยนอัตโนมัติ") || painMd.includes("Approve"));
  assert.ok(
    painMd.includes("ไม่รับประกัน") ||
      painMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyPain = buildPainClarityFitLab(
    {
      products: [painSharp, painEmpty],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyPain.counts.postsWithMetrics, 0);
  assert.ok(
    emptyPain.summary.includes("ยังไม่มีเมตริก") || emptyPain.score <= 50,
  );

  // --- Video Ease Lab ---
  assert.equal(videoEaseBandOf(1), "hard1");
  assert.equal(videoEaseBandOf(2), "tough2");
  assert.equal(videoEaseBandOf(3), "ok3");
  assert.equal(videoEaseBandOf(4), "easy4");
  assert.equal(videoEaseBandOf(5), "snap5");

  const easeSnap: Product = {
    ...fitProduct,
    id: "prod_ease_snap",
    name: "ที่แขวนผนัง ถ่ายง่าย",
    price: 199,
    commissionRate: 12,
    category: "home",
    painPoints: ["ของรก"],
    sellingPoints: ["ติดง่าย"],
    targetAudience: "คนอยู่คอนโด",
    videoEase: 5,
    seasonalScore: 4,
  };
  assert.equal(videoEaseOf(easeSnap), 5);
  assert.equal(videoEaseBandOf(videoEaseOf(easeSnap)), "snap5");

  const easeHard: Product = {
    ...fitProduct,
    id: "prod_ease_hard",
    name: "ชุดติดตั้งซับซ้อน",
    price: 890,
    commissionRate: 8,
    category: "gadget",
    painPoints: ["ติดตั้งยาก"],
    sellingPoints: ["ครบชุด"],
    targetAudience: "ช่างมือใหม่",
    videoEase: 1,
    seasonalScore: 2,
  };
  assert.equal(videoEaseOf(easeHard), 1);
  assert.equal(videoEaseBandOf(videoEaseOf(easeHard)), "hard1");

  const easeSchedule = [
    {
      id: "sch_ease_s1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_ease_snap",
      contentPackId: "pack_ease_s",
      status: "posted" as const,
      captionPreview: `s1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2100,
        clicks: 120,
        orders: 8,
        commissionEarned: 240,
      },
    },
    {
      id: "sch_ease_s2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_ease_snap",
      contentPackId: "pack_ease_s",
      status: "posted" as const,
      captionPreview: `s2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 1800,
        clicks: 100,
        orders: 7,
        commissionEarned: 200,
      },
    },
    {
      id: "sch_ease_s3",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_ease_snap",
      contentPackId: "pack_ease_s",
      status: "posted" as const,
      captionPreview: `s3 ${fitDisclosure}`,
      hookIndex: 2,
      ctaIndex: 1,
      metrics: {
        views: 1600,
        clicks: 90,
        orders: 6,
        commissionEarned: 180,
      },
    },
    {
      id: "sch_ease_h1",
      date: "2026-08-20",
      suggestedTime: "14:00",
      channel: "tiktok" as const,
      productId: "prod_ease_hard",
      contentPackId: "pack_ease_h",
      status: "posted" as const,
      captionPreview: `h1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 350,
        clicks: 4,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_ease_today_cold",
      date: "2026-08-23",
      suggestedTime: "10:30",
      channel: "tiktok" as const,
      productId: "prod_ease_hard",
      contentPackId: "pack_ease_h",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];
  const easeLab = buildVideoEaseFitLab(
    {
      products: [easeSnap, easeHard],
      contentPacks: [],
      schedule: easeSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
    14,
  );
  assert.ok(easeLab.counts.postsWithMetrics >= 4);
  assert.ok(easeLab.counts.bandsWithData >= 2);
  const snapRow = easeLab.bands.find((b) => b.band === "snap5");
  const hardRow = easeLab.bands.find((b) => b.band === "hard1");
  assert.ok(snapRow);
  assert.ok(hardRow);
  assert.ok(snapRow!.score > hardRow!.score);
  assert.ok(["hot", "steady"].includes(snapRow!.status));
  assert.ok(
    easeLab.counts.unbalanced === true || snapRow!.shareOfPosts >= 0.5,
  );
  assert.ok(easeLab.suggestions.length >= 1);
  assert.ok(
    easeLab.suggestions[0].suggestedBand === "snap5" ||
      easeLab.suggestions[0].suggestedLabel.includes("ถ่ายเร็ว"),
  );
  assert.ok(videoEaseFitLabLines(easeLab, 3).length <= 3);
  const easeMd = videoEaseFitLabToMarkdown(easeLab);
  assert.ok(easeMd.includes("Video Ease Lab"));
  assert.ok(easeMd.includes("ทดลอง"));
  assert.ok(easeMd.includes("ไม่เปลี่ยนอัตโนมัติ") || easeMd.includes("Approve"));
  assert.ok(
    easeMd.includes("ไม่รับประกัน") ||
      easeMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyEase = buildVideoEaseFitLab(
    {
      products: [easeSnap, easeHard],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyEase.counts.postsWithMetrics, 0);
  assert.ok(
    emptyEase.summary.includes("ยังไม่มีเมตริก") || emptyEase.score <= 50,
  );

  // --- Seasonal Fit Lab ---
  assert.equal(seasonalBandOf(1), "cold1");
  assert.equal(seasonalBandOf(2), "soft2");
  assert.equal(seasonalBandOf(3), "mid3");
  assert.equal(seasonalBandOf(4), "trend4");
  assert.equal(seasonalBandOf(5), "peak5");

  const seasonPeak: Product = {
    ...fitProduct,
    id: "prod_season_peak",
    name: "ของขวัญตามซีซัน",
    price: 299,
    commissionRate: 15,
    category: "ของขวัญ",
    painPoints: ["หาของขวัญยาก"],
    sellingPoints: ["ห่อสวย"],
    targetAudience: "คนหาของขวัญด่วน",
    videoEase: 4,
    seasonalScore: 5,
  };
  assert.equal(seasonalScoreOf(seasonPeak), 5);
  assert.equal(seasonalBandOf(seasonalScoreOf(seasonPeak)), "peak5");

  const seasonCold: Product = {
    ...fitProduct,
    id: "prod_season_cold",
    name: "สินค้าออฟซีซัน",
    price: 450,
    commissionRate: 8,
    category: "ทั่วไป",
    painPoints: ["ไม่เร่ง"],
    sellingPoints: ["ใช้ได้"],
    targetAudience: "ผู้ใช้ทั่วไป",
    videoEase: 3,
    seasonalScore: 1,
  };
  assert.equal(seasonalScoreOf(seasonCold), 1);
  assert.equal(seasonalBandOf(seasonalScoreOf(seasonCold)), "cold1");

  const seasonSchedule = [
    {
      id: "sch_season_p1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_season_peak",
      contentPackId: "pack_season_p",
      status: "posted" as const,
      captionPreview: `s1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2400,
        clicks: 140,
        orders: 9,
        commissionEarned: 280,
      },
    },
    {
      id: "sch_season_p2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_season_peak",
      contentPackId: "pack_season_p",
      status: "posted" as const,
      captionPreview: `s2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 1900,
        clicks: 100,
        orders: 6,
        commissionEarned: 190,
      },
    },
    {
      id: "sch_season_c1",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_season_cold",
      contentPackId: "pack_season_c",
      status: "posted" as const,
      captionPreview: `c1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 1,
      metrics: {
        views: 400,
        clicks: 8,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_season_today",
      date: "2026-08-23",
      suggestedTime: "09:00",
      channel: "tiktok" as const,
      productId: "prod_season_cold",
      contentPackId: "pack_season_c",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];

  const seasonLab = buildSeasonalFitLab(
    {
      products: [seasonPeak, seasonCold],
      contentPacks: [],
      schedule: seasonSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.ok(seasonLab.seasonLabel.length > 0);
  assert.equal(seasonLab.counts.postsWithMetrics, 3);
  const peakRow = seasonLab.bands.find((b) => b.band === "peak5");
  const coldRow = seasonLab.bands.find((b) => b.band === "cold1");
  assert.ok(peakRow);
  assert.ok(coldRow);
  assert.ok(peakRow!.score > coldRow!.score);
  assert.ok(["hot", "steady"].includes(peakRow!.status));
  assert.ok(
    seasonLab.counts.unbalanced === true || peakRow!.shareOfPosts >= 0.5,
  );
  assert.ok(seasonLab.suggestions.length >= 1);
  assert.ok(
    seasonLab.suggestions[0].suggestedBand === "peak5" ||
      seasonLab.suggestions[0].suggestedLabel.includes("ซีซันแรง"),
  );
  assert.ok(seasonalFitLabLines(seasonLab, 3).length <= 3);
  const seasonMd = seasonalFitLabToMarkdown(seasonLab);
  assert.ok(seasonMd.includes("Seasonal Fit Lab"));
  assert.ok(seasonMd.includes("ปฏิทินไทย"));
  assert.ok(seasonMd.includes("ทดลอง"));
  assert.ok(seasonMd.includes("ไม่เปลี่ยนอัตโนมัติ") || seasonMd.includes("Approve"));
  assert.ok(
    seasonMd.includes("ไม่รับประกัน") ||
      seasonMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptySeason = buildSeasonalFitLab(
    {
      products: [seasonPeak, seasonCold],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptySeason.counts.postsWithMetrics, 0);
  assert.ok(
    emptySeason.summary.includes("ยังไม่มีเมตริก") || emptySeason.score <= 50,
  );

  // --- Audience Fit Lab ---
  assert.equal(audienceBandOf(0), "empty");
  assert.equal(audienceBandOf(20), "vague");
  assert.equal(audienceBandOf(40), "named");
  assert.equal(audienceBandOf(60), "specific");
  assert.equal(audienceBandOf(80), "sharp");

  const audSharp: Product = {
    ...fitProduct,
    id: "prod_aud_sharp",
    name: "ครีมมือสาวออฟฟิศ",
    price: 199,
    commissionRate: 18,
    category: "ความงาม",
    painPoints: ["มือแห้งตอนเช้า"],
    sellingPoints: ["ซึมไว"],
    targetAudience: "สาวออฟฟิศที่มือแห้งตอนเช้าและอยากประหยัดเวลา",
    videoEase: 4,
    seasonalScore: 3,
  };
  const sharpScore = audienceClarityScoreOf(audSharp);
  assert.ok(sharpScore >= 75, `expected sharp score, got ${sharpScore}`);
  assert.equal(audienceBandOf(sharpScore), "sharp");

  const audEmpty: Product = {
    ...fitProduct,
    id: "prod_aud_empty",
    name: "สินค้าไม่มีกลุ่ม",
    price: 450,
    commissionRate: 8,
    category: "ทั่วไป",
    painPoints: ["ไม่ชัด"],
    sellingPoints: ["ใช้ได้"],
    targetAudience: "",
    videoEase: 2,
    seasonalScore: 2,
  };
  assert.equal(audienceClarityScoreOf(audEmpty), 0);
  assert.equal(audienceBandOf(audienceClarityScoreOf(audEmpty)), "empty");

  const audVague: Product = {
    ...fitProduct,
    id: "prod_aud_vague",
    name: "สินค้ากลุ่มกว้าง",
    price: 299,
    commissionRate: 10,
    category: "ทั่วไป",
    painPoints: ["หาของยาก"],
    sellingPoints: ["คุ้ม"],
    targetAudience: "ทุกคน",
    videoEase: 3,
    seasonalScore: 2,
  };
  assert.equal(audienceBandOf(audienceClarityScoreOf(audVague)), "vague");

  const audSchedule = [
    {
      id: "sch_aud_s1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_aud_sharp",
      contentPackId: "pack_aud_s",
      status: "posted" as const,
      captionPreview: `a1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2600,
        clicks: 150,
        orders: 10,
        commissionEarned: 300,
      },
    },
    {
      id: "sch_aud_s2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_aud_sharp",
      contentPackId: "pack_aud_s",
      status: "posted" as const,
      captionPreview: `a2 ${fitDisclosure}`,
      hookIndex: 1,
      ctaIndex: 0,
      metrics: {
        views: 2000,
        clicks: 110,
        orders: 7,
        commissionEarned: 210,
      },
    },
    {
      id: "sch_aud_e1",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_aud_empty",
      contentPackId: "pack_aud_e",
      status: "posted" as const,
      captionPreview: `e1 ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 1,
      metrics: {
        views: 350,
        clicks: 6,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_aud_today",
      date: "2026-08-23",
      suggestedTime: "09:00",
      channel: "tiktok" as const,
      productId: "prod_aud_empty",
      contentPackId: "pack_aud_e",
      status: "draft" as const,
      captionPreview: `today ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];

  const audLab = buildAudienceFitLab(
    {
      products: [audSharp, audEmpty, audVague],
      contentPacks: [],
      schedule: audSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(audLab.counts.postsWithMetrics, 3);
  const audSharpRow = audLab.bands.find((b) => b.band === "sharp");
  const audEmptyRow = audLab.bands.find((b) => b.band === "empty");
  assert.ok(audSharpRow);
  assert.ok(audEmptyRow);
  assert.ok(audSharpRow!.score > audEmptyRow!.score);
  assert.ok(["hot", "steady"].includes(audSharpRow!.status));
  assert.ok(audLab.suggestions.length >= 1);
  assert.ok(
    audLab.suggestions[0].suggestedBand === "sharp" ||
      audLab.suggestions[0].suggestedLabel.includes("คม"),
  );
  assert.ok(audienceFitLabLines(audLab, 3).length <= 3);
  const audMd = audienceFitLabToMarkdown(audLab);
  assert.ok(audMd.includes("Audience Fit Lab"));
  assert.ok(audMd.includes("ทดลอง"));
  assert.ok(audMd.includes("ไม่เปลี่ยนอัตโนมัติ") || audMd.includes("Approve"));
  assert.ok(
    audMd.includes("ไม่รับประกัน") ||
      audMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyAud = buildAudienceFitLab(
    {
      products: [audSharp, audEmpty],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyAud.counts.postsWithMetrics, 0);
  assert.ok(
    emptyAud.summary.includes("ยังไม่มีเมตริก") || emptyAud.score <= 50,
  );

  // --- Hook Fit Lab ---
  assert.equal(classifyHookStyle("เคยเจอไหม… มือแห้งตอนเช้า"), "pain");
  assert.equal(
    classifyHookStyle("เปิดดูสเปก/รีวิวบน Shopee ก่อนตัดสินใจ"),
    "browse",
  );
  assert.equal(
    classifyHookStyle("ซึมไว — ราคาประมาณ ฿199"),
    "value",
  );
  assert.equal(
    classifyHookStyle("ของชิ้นเล็กที่คนสาวออฟฟิศพูดถึงบ่อย"),
    "social",
  );
  assert.equal(classifyHookStyle("ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้"), "soft");
  assert.equal(hookStyleFromIndex(0), "pain");
  assert.equal(hookStyleFromIndex(1), "browse");
  assert.equal(hookStyleFromIndex(3), "value");

  const packPain = {
    id: "pack_hook_pain",
    productId: "prod_hook_pain",
    createdAt: "2026-08-20T00:00:00.000Z",
    disclosure: fitDisclosure,
    hooks: [
      "เคยเจอไหม… มือแห้งตอนเช้า",
      "เปิดดูสเปกบน Shopee ก่อน",
      "ถ้ากำลังหาของช่วยเรื่องความงาม",
      "ซึมไว — ราคาประมาณ ฿199",
      "ของชิ้นเล็กที่คนสาวออฟฟิศพูดถึงบ่อย",
    ],
    ctas: ["ดูรายละเอียดได้ที่ลิงก์"],
    hashtagsTh: ["#รีวิว"],
    hashtagsEn: ["#AffiliateDisclosure"],
    tiktokScript: { durationSec: 25, scenes: [], voiceover: "" },
    facebookCaption: fitDisclosure,
    facebookGroupCaption: fitDisclosure,
    reelsCaption: fitDisclosure,
    videoPriorityNote: "ถ่ายง่าย",
    filmingChecklist: ["แสงพอ"],
    sellingAngles: ["มุมปัญหา"],
  };

  const packSoft = {
    ...packPain,
    id: "pack_hook_soft",
    productId: "prod_hook_soft",
    hooks: [
      "ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้",
      "สั้น ๆ ตรง ๆ — จุดที่ชอบคือ ใช้งานง่าย",
      "แชร์ตัวเลือก ไม่เร่งกดซื้อ",
      "ลองดูตัวเลือกนี้ก่อนได้",
      "ไม่เร่งซื้อ — เปิดดูรายละเอียดก่อน",
    ],
  };

  assert.equal(
    hookStyleOf(
      { hookIndex: 0, captionPreview: "", contentPackId: packPain.id },
      packPain as never,
    ),
    "pain",
  );
  assert.equal(
    hookStyleOf(
      { hookIndex: 0, captionPreview: "", contentPackId: packSoft.id },
      packSoft as never,
    ),
    "soft",
  );

  const hookPainProd: Product = {
    ...fitProduct,
    id: "prod_hook_pain",
    name: "ครีมมือ pain hook",
    price: 199,
    commissionRate: 18,
    category: "ความงาม",
    painPoints: ["มือแห้ง"],
    sellingPoints: ["ซึมไว"],
    targetAudience: "สาวออฟฟิศ",
    videoEase: 4,
    seasonalScore: 3,
  };
  const hookSoftProd: Product = {
    ...fitProduct,
    id: "prod_hook_soft",
    name: "ครีมมือ soft hook",
    price: 450,
    commissionRate: 8,
    category: "ความงาม",
    painPoints: ["มือแห้ง"],
    sellingPoints: ["ใช้ได้"],
    targetAudience: "ทั่วไป",
    videoEase: 2,
    seasonalScore: 2,
  };

  const hookSchedule = [
    {
      id: "sch_hook_p1",
      date: "2026-08-20",
      suggestedTime: "10:00",
      channel: "tiktok" as const,
      productId: "prod_hook_pain",
      contentPackId: "pack_hook_pain",
      status: "posted" as const,
      captionPreview: `เคยเจอไหม… มือแห้ง ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2800,
        clicks: 160,
        orders: 11,
        commissionEarned: 320,
      },
    },
    {
      id: "sch_hook_p2",
      date: "2026-08-21",
      suggestedTime: "11:00",
      channel: "facebook_reels" as const,
      productId: "prod_hook_pain",
      contentPackId: "pack_hook_pain",
      status: "posted" as const,
      captionPreview: `เคยเจอไหม… ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
      metrics: {
        views: 2100,
        clicks: 120,
        orders: 8,
        commissionEarned: 220,
      },
    },
    {
      id: "sch_hook_s1",
      date: "2026-08-22",
      suggestedTime: "12:00",
      channel: "facebook_post" as const,
      productId: "prod_hook_soft",
      contentPackId: "pack_hook_soft",
      status: "posted" as const,
      captionPreview: `ไม่ต้องซื้อแพง ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 1,
      metrics: {
        views: 400,
        clicks: 8,
        orders: 0,
        commissionEarned: 0,
      },
    },
    {
      id: "sch_hook_today",
      date: "2026-08-23",
      suggestedTime: "09:00",
      channel: "tiktok" as const,
      productId: "prod_hook_soft",
      contentPackId: "pack_hook_soft",
      status: "draft" as const,
      captionPreview: `today soft ${fitDisclosure}`,
      hookIndex: 0,
      ctaIndex: 0,
    },
  ];

  const hookLab = buildHookFitLab(
    {
      products: [hookPainProd, hookSoftProd],
      contentPacks: [packPain, packSoft] as never[],
      schedule: hookSchedule,
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(hookLab.counts.postsWithMetrics, 3);
  const painRow = hookLab.bands.find((b) => b.band === "pain");
  const softRow = hookLab.bands.find((b) => b.band === "soft");
  assert.ok(painRow);
  assert.ok(softRow);
  assert.ok(painRow!.score > softRow!.score);
  assert.ok(["hot", "steady"].includes(painRow!.status));
  assert.ok(hookLab.suggestions.length >= 1);
  assert.ok(
    hookLab.suggestions[0].suggestedBand === "pain" ||
      hookLab.suggestions[0].suggestedLabel.includes("ปัญหา"),
  );
  assert.ok(hookFitLabLines(hookLab, 3).length <= 3);
  const hookMd = hookFitLabToMarkdown(hookLab);
  assert.ok(hookMd.includes("Hook Fit Lab"));
  assert.ok(hookMd.includes("ทดลอง"));
  assert.ok(hookMd.includes("ไม่เปลี่ยนอัตโนมัติ") || hookMd.includes("Approve"));
  assert.ok(
    hookMd.includes("ไม่รับประกัน") ||
      hookMd.includes(INCOME_DISCLAIMER.slice(0, 10)),
  );

  const emptyHook = buildHookFitLab(
    {
      products: [hookPainProd],
      contentPacks: [],
      schedule: [],
      briefs: [],
      automationLogs: [],
    } as never,
    "2026-08-23",
  );
  assert.equal(emptyHook.counts.postsWithMetrics, 0);
  assert.ok(
    emptyHook.summary.includes("ยังไม่มีเมตริก") || emptyHook.score <= 50,
  );

  console.log("All unit tests passed");
}

run();
