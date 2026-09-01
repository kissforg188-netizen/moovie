import { NextResponse } from "next/server";
import { readDb, todayISO } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayISO();
  const db = await readDb();
  const schedule = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const products = Object.fromEntries(db.products.map((p) => [p.id, p]));
  const packs = Object.fromEntries(db.contentPacks.map((p) => [p.id, p]));
  return NextResponse.json({ date, schedule, products, packs });
}
