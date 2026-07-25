import { NextResponse } from "next/server";
import { readDb, updateDb } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const db = await readDb();
  const product = db.products.find((p) => p.id === id);
  if (!product) {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function DELETE(_request: Request, context: Ctx) {
  const { id } = await context.params;
  await updateDb((db) => {
    db.products = db.products.filter((p) => p.id !== id);
  });
  return NextResponse.json({ ok: true });
}
