import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { rankProducts } from "@/lib/scoring";

export async function GET() {
  const db = await readDb();
  const ranked = rankProducts(db.products, 20, db.schedule, db.learning);
  return NextResponse.json({ ranked, learning: db.learning ?? null });
}
