import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { rankProducts } from "@/lib/scoring";

export async function GET() {
  const db = await readDb();
  const ranked = rankProducts(db.products, 20);
  return NextResponse.json({ ranked });
}
