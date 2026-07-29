import { NextResponse } from "next/server";
import { getManualAdapter } from "@/lib/adapters";
import { newId, readDb, updateDb } from "@/lib/db";
import { scoreProduct } from "@/lib/scoring";
import type { Platform, Product } from "@/lib/types";

function normalizeUrlKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

export async function GET() {
  const db = await readDb();
  const items = db.products.map((p) => ({
    ...p,
    score: scoreProduct(p),
  }));
  items.sort((a, b) => b.score.total - a.score.total);
  return NextResponse.json({ products: items });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Product>;
  if (!body.name?.trim() || !body.affiliateUrl?.trim()) {
    return NextResponse.json(
      { error: "ต้องมีชื่อสินค้าและลิงก์ affiliate" },
      { status: 400 },
    );
  }

  const platform = (body.platform ?? "shopee") as Platform;
  const adapterPlatform =
    platform === "tiktok_shop" ? "tiktok_shop" : "shopee";
  const adapter = getManualAdapter(adapterPlatform);
  const url = adapter.normalizeLink
    ? adapter.normalizeLink(body.affiliateUrl)
    : body.affiliateUrl.trim();

  const existing = await readDb();
  const dup = existing.products.find(
    (p) => normalizeUrlKey(p.affiliateUrl) === normalizeUrlKey(url),
  );
  if (dup) {
    return NextResponse.json(
      {
        error: `ลิงก์นี้ซ้ำกับสินค้าที่มีอยู่แล้ว: ${dup.name} (ลดสแปม — ใช้สินค้าเดิมหรือแก้ลิงก์)`,
        duplicateProductId: dup.id,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const product: Product = {
    id: newId("prod"),
    name: body.name.trim(),
    platform,
    affiliateUrl: url,
    price: Number(body.price) || 0,
    commissionRate: Number(body.commissionRate) || 0,
    category: (body.category ?? "").trim() || "ทั่วไป",
    sellingPoints: Array.isArray(body.sellingPoints)
      ? body.sellingPoints.map(String).filter(Boolean)
      : String(body.sellingPoints ?? "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
    painPoints: Array.isArray(body.painPoints)
      ? body.painPoints.map(String).filter(Boolean)
      : String(body.painPoints ?? "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
    targetAudience: (body.targetAudience ?? "").trim(),
    videoEase: Math.max(1, Math.min(5, Number(body.videoEase) || 3)),
    seasonalScore: Math.max(1, Math.min(5, Number(body.seasonalScore) || 3)),
    notes: body.notes?.trim(),
    active: body.active === false ? false : true,
    createdAt: now,
    updatedAt: now,
  };

  await updateDb((db) => {
    db.products.push(product);
    return db;
  });

  return NextResponse.json({
    product: { ...product, score: scoreProduct(product) },
  });
}
