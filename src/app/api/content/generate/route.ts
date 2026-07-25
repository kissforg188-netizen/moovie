import { NextResponse } from "next/server";
import { generateContentPack } from "@/lib/content";
import { readDb, updateDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const productId = String(body.productId ?? "");
  const db = await readDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  }
  const pack = generateContentPack(product);
  await updateDb((state) => {
    state.contentPacks.push(pack);
  });
  return NextResponse.json({ contentPack: pack }, { status: 201 });
}
