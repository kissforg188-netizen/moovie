import assert from "assert";
import { sanitizeMarketingText } from "../src/lib/compliance";
import { withDisclosure, AFFILIATE_DISCLOSURE } from "../src/lib/disclosure";
import { generateContentPack } from "../src/lib/content";
import {
  approvedTodayToMarkdown,
  briefsToCsv,
  contentPackToMarkdown,
} from "../src/lib/export";
import { normalizeImportRow, parseCsv, rowsToProducts } from "../src/lib/import";
import { analyzePosted } from "../src/lib/analytics";
import { bangkokParts, todayISO } from "../src/lib/db";
import { buildExperimentPlan, experimentPlanToMarkdown } from "../src/lib/experiments";
import { buildLearningState, learningRankBoost } from "../src/lib/learning";
import { rankProducts, scoreProduct } from "../src/lib/scoring";
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

  console.log("All unit tests passed");
}

run();
