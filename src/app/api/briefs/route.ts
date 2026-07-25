import { NextResponse } from "next/server";
import { readDb, todayISO } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayISO();
  const db = await readDb();
  const briefs = db.briefs.filter((b) => b.date === date);
  return NextResponse.json({ date, briefs });
}
