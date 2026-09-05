import { NextResponse } from "next/server";
import {
  logAutomationFinish,
  logAutomationStart,
} from "@/lib/automation-log";
import { updateDb } from "@/lib/db";
import { regenerateScheduledDraft } from "@/lib/regenerate";

/**
 * Rebuild caption/script for a draft (or revive skipped → draft).
 * Never publishes — still requires Approve.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const jobId = await logAutomationStart(
    "regenerate_draft",
    `สร้างแคปชันใหม่สำหรับ ${id}`,
  );

  try {
    let resultMessage = "";
    let packId = "";
    let error: string | undefined;

    await updateDb((db) => {
      const result = regenerateScheduledDraft(db, id);
      if (!result.ok) {
        error = result.error;
        return db;
      }
      resultMessage = result.message ?? "สร้างแคปชันใหม่แล้ว";
      packId = result.pack?.id ?? "";
      return db;
    });

    if (error) {
      await logAutomationFinish(jobId, "failed", error, { id });
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    await logAutomationFinish(jobId, "success", resultMessage, {
      id,
      packId,
    });
    return NextResponse.json({
      ok: true,
      message: resultMessage,
      packId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "regenerate failed";
    await logAutomationFinish(jobId, "failed", msg, { id });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
