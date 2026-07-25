import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankProducts, scoreProduct } from "./scoring";
import type { Product } from "./types";

function sample(partial: Partial<Product>): Product {
  return {
    id: "p1",
    name: "กล่องจัดเก็บพับได้",
    platform: "shopee",
    affiliateUrl: "https://example.com/a",
    price: 199,
    commissionRate: 12,
    category: "จัดเก็บ",
    sellingPoints: ["พับเก็บได้", "กันฝุ่น"],
    painPoints: ["ของรกหาไม่เจอ"],
    targetAudience: "คนอยู่คอนโดพื้นที่น้อย",
    seasonalTags: ["เทรนด์"],
    videoFriendly: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("scoreProduct", () => {
  it("scores impulse-friendly commission products higher", () => {
    const good = scoreProduct(sample({}));
    const weak = scoreProduct(
      sample({
        id: "p2",
        price: 8900,
        commissionRate: 2,
        painPoints: [],
        sellingPoints: [],
        videoFriendly: false,
        seasonalTags: [],
      })
    );
    assert.ok(good.score.total > weak.score.total);
  });
});

describe("rankProducts", () => {
  it("returns top N sorted by total score", () => {
    const ranked = rankProducts(
      [
        sample({ id: "a", commissionRate: 20 }),
        sample({ id: "b", commissionRate: 5, price: 5000, videoFriendly: false }),
        sample({ id: "c", commissionRate: 15 }),
      ],
      2
    );
    assert.equal(ranked.length, 2);
    assert.ok(ranked[0].score.total >= ranked[1].score.total);
  });
});
