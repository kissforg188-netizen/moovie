import assert from "assert";
import { withDisclosure, AFFILIATE_DISCLOSURE } from "../src/lib/disclosure";
import { generateContentPack } from "../src/lib/content";
import { rankProducts, scoreProduct } from "../src/lib/scoring";
import { buildDailySchedule } from "../src/lib/schedule";
import type { Product } from "../src/lib/types";

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

  const pack = generateContentPack(cheapHigh);
  assert.equal(pack.hooks.length, 5);
  assert.equal(pack.ctas.length, 3);
  assert.ok(pack.facebookCaption.includes(AFFILIATE_DISCLOSURE));
  assert.ok(pack.reelsCaption.includes(AFFILIATE_DISCLOSURE));
  assert.ok(withDisclosure("ทดสอบ").includes(AFFILIATE_DISCLOSURE));

  const schedule = buildDailySchedule({
    date: "2026-07-25",
    ranked: [{ product: cheapHigh, pack }],
    existing: [],
  });
  assert.ok(schedule.length >= 1 && schedule.length <= 3);
  assert.ok(schedule.every((s) => s.status === "draft"));

  console.log("All unit tests passed");
}

run();
