import { NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { runEveningWorkflow } from "@/lib/workflow";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    force?: boolean;
  };
  const date = body.date ?? todayISO();
  const db = await runEveningWorkflow(date, { force: Boolean(body.force) });
  const brief = [...db.briefs]
    .filter((b) => b.type === "evening" && b.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return NextResponse.json({ ok: true, brief, idempotent: !body.force });
}
