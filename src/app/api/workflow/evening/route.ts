import { NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { runEveningWorkflow } from "@/lib/workflow";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const db = await runEveningWorkflow(body.date ?? todayISO());
  const brief = [...db.briefs]
    .filter((b) => b.type === "evening")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return NextResponse.json({ ok: true, brief });
}
