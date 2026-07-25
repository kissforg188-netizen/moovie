import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const db = await readDb();
  const packs = productId
    ? db.contentPacks.filter((p) => p.productId === productId)
    : db.contentPacks;
  return NextResponse.json({
    contentPacks: packs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}
