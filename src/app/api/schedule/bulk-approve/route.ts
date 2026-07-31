import { NextResponse } from "next/server";
import {
  logAutomationFinish,
  logAutomationStart,
} from "@/lib/automation-log";
import { todayISO, updateDb } from "@/lib/db";

/**
 * Approve draft posts for a date (default: today).
 * Never publishes — user still posts manually after approval.
 */
export async function POST(request: Request) {
  const jobId = await logAutomationStart(
    "bulk_approve",
    "อนุมัติ draft เป็นชุด",
  );
  try {
    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      ids?: string[];
    };
    const date = body.date || todayISO();
    const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
    const now = new Date().toISOString();
    let approved = 0;

    await updateDb((db) => {
      for (const post of db.schedule) {
        if (post.date !== date) continue;
        if (post.status !== "draft") continue;
        if (ids && !ids.has(post.id)) continue;
        post.status = "approved";
        post.approvedAt = now;
        approved += 1;
      }
      return db;
    });

    const message = `อนุมัติ ${approved} draft ของ ${date} — โพสต์ด้วยมือเท่านั้น ระบบไม่โพสต์อัตโนมัติ`;
    await logAutomationFinish(jobId, "success", message, { date, approved });
    return NextResponse.json({ ok: true, approved, date, message });
  } catch (err) {
    await logAutomationFinish(
      jobId,
      "failed",
      err instanceof Error ? err.message : "bulk approve failed",
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
