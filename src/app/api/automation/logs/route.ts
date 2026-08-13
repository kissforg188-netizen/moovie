import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";

export async function GET() {
  const db = await readDb();
  const logs = (db.automationLogs ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  return NextResponse.json({ logs });
}
