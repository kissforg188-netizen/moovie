import { NextResponse } from "next/server";
import { canApproveStatus, evaluateApproveGate } from "@/lib/approve";
import {
  logAutomationFinish,
  logAutomationStart,
} from "@/lib/automation-log";
import { AFFILIATE_DISCLOSURE } from "@/lib/disclosure";
import { todayISO, updateDb } from "@/lib/db";

/**
 * Approve draft posts for a date (default: today).
 * Skips drafts that fail compliance gate. Never publishes.
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
    let skippedGate = 0;
    const blockedSamples: string[] = [];

    await updateDb((db) => {
      for (const post of db.schedule) {
        if (post.date !== date) continue;
        if (!canApproveStatus(post.status)) continue;
        if (ids && !ids.has(post.id)) continue;

        const gate = evaluateApproveGate(
          post.captionPreview,
          AFFILIATE_DISCLOSURE,
        );
        if (!gate.ok) {
          skippedGate += 1;
          if (blockedSamples.length < 3) {
            blockedSamples.push(gate.errors[0] ?? "ไม่ผ่าน compliance");
          }
          continue;
        }

        post.status = "approved";
        post.approvedAt = now;
        approved += 1;
      }
      return db;
    });

    const message =
      skippedGate > 0
        ? `อนุมัติ ${approved} draft ของ ${date} · ข้าม ${skippedGate} ชิ้นที่ไม่ผ่าน disclosure/คำโฆษณา — โพสต์ด้วยมือเท่านั้น`
        : `อนุมัติ ${approved} draft ของ ${date} — โพสต์ด้วยมือเท่านั้น ระบบไม่โพสต์อัตโนมัติ`;
    await logAutomationFinish(jobId, "success", message, {
      date,
      approved,
      skippedGate,
      blockedSamples,
    });
    return NextResponse.json({
      ok: true,
      approved,
      skippedGate,
      blockedSamples,
      date,
      message,
    });
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
