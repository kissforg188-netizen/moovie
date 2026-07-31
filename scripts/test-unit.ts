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
import { buildLearningState, learningRankBoost } from "../src/lib/learning";
import { rankProducts, scoreProduct } from "../src/lib/scoring";
import {
  buildDailySchedule,
  captionFingerprint,
  channelLabel,
  expireStaleDrafts,
} from "../src/lib/schedule";
import { effectiveSeasonalScore, thaiSeasonBoost } from "../src/lib/seasonality";
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
        roiPerClick: 2,
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
        roiPerClick: 0,
        score: 5,
      },
    ],
    "2026-07-30",
  );
  assert.equal(learning.preferredChannel, "tiktok");
  assert.ok(learning.winnerProductIds.includes("a"));
  assert.ok(learningRankBoost("a", learning) > learningRankBoost("b", learning));
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

  console.log("All unit tests passed");
}

run();
