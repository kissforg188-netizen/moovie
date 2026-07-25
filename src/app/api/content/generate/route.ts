import { NextResponse } from "next/server";
import { generateContentPack } from "@/lib/content";
import { readDb, updateDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as { productId?: string };
  if (!body.productId) {
    return NextResponse.json({ error: "ต้องระบุ productId" }, { status: 400 });
  }
  const db = await readDb();
  const product = db.products.find((p) => p.id === body.productId);
  if (!product) {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  }
  const pack = generateContentPack(product);
  await updateDb((current) => {
    current.contentPacks.push(pack);
    return current;
  });
  return NextResponse.json({ pack });
}
