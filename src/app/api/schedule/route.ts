import { NextResponse } from "next/server";
import { readDb, todayISO } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayISO();
  const db = await readDb();
  const schedule = db.schedule
    .filter((p) => p.date === date)
    .sort((a, b) => a.slot.localeCompare(b.slot));
  return NextResponse.json({ date, schedule });
}
