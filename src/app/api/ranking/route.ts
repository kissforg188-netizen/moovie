import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { rankProducts } from "@/lib/scoring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 5);
  const db = await readDb();
  const ranked = rankProducts(db.products, Number.isFinite(limit) ? limit : 5);
  return NextResponse.json({ ranked });
}
