import { NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { runMorningWorkflow } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let date = todayISO();
  try {
    const body = await request.json();
    if (body?.date) date = String(body.date);
  } catch {
    /* empty body ok */
  }
  const result = await runMorningWorkflow(date);
  return NextResponse.json({
    brief: result.brief,
    rankedCount: result.rankedCount,
    draftCount: result.draftCount,
  });
}
