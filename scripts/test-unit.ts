import assert from "assert";
import { sanitizeMarketingText } from "../src/lib/compliance";
import { withDisclosure, AFFILIATE_DISCLOSURE } from "../src/lib/disclosure";
import { generateContentPack } from "../src/lib/content";
import { briefsToCsv } from "../src/lib/export";
import { normalizeImportRow, parseCsv, rowsToProducts } from "../src/lib/import";
import { rankProducts, scoreProduct } from "../src/lib/scoring";
import {
  buildDailySchedule,
  captionFingerprint,
  channelLabel,
} from "../src/lib/schedule";
import { effectiveSeasonalScore, thaiSeasonBoost } from "../src/lib/seasonality";
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

  console.log("All unit tests passed");
}

run();
