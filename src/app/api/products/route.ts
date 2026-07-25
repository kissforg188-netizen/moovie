import { NextResponse } from "next/server";
import { newId, readDb, updateDb } from "@/lib/db";
import type { Platform, Product } from "@/lib/types";

export const runtime = "nodejs";

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ products: db.products });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const affiliateUrl = String(body.affiliateUrl ?? "").trim();
  const platform = String(body.platform ?? "shopee") as Platform;

  if (!name || !affiliateUrl) {
    return NextResponse.json(
      { error: "ต้องมีชื่อสินค้าและลิงก์ affiliate" },
      { status: 400 }
    );
  }
  if (!["shopee", "tiktok_shop", "facebook"].includes(platform)) {
    return NextResponse.json({ error: "platform ไม่ถูกต้อง" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const product: Product = {
    id: newId("prod"),
    name,
    platform,
    affiliateUrl,
    price: Number(body.price) || 0,
    commissionRate: Number(body.commissionRate) || 0,
    commissionAmount:
      body.commissionAmount === "" || body.commissionAmount == null
        ? undefined
        : Number(body.commissionAmount),
    category: String(body.category ?? "").trim() || "ทั่วไป",
    sellingPoints: splitList(body.sellingPoints),
    painPoints: splitList(body.painPoints),
    targetAudience: String(body.targetAudience ?? "").trim(),
    seasonalTags: splitList(body.seasonalTags),
    videoFriendly: Boolean(body.videoFriendly),
    notes: String(body.notes ?? "").trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await updateDb((db) => {
    db.products.push(product);
  });

  return NextResponse.json({ product }, { status: 201 });
}
