import { NextResponse } from "next/server";
import { canApproveStatus, evaluateApproveGate } from "@/lib/approve";
import { AFFILIATE_DISCLOSURE } from "@/lib/disclosure";
import { updateDb } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let found = false;
  let blockedErrors: string[] = [];
  let alreadyPosted = false;
  let approved = false;

  await updateDb((db) => {
    const post = db.schedule.find((s) => s.id === id);
    if (!post) return db;
    found = true;
    if (post.status === "posted") {
      alreadyPosted = true;
      return db;
    }
    if (!canApproveStatus(post.status)) {
      blockedErrors = [
        post.status === "approved"
          ? "อนุมัติไปแล้ว — โพสต์ด้วยมือแล้วกดยืนยันว่าโพสต์แล้ว"
          : `สถานะ ${post.status} อนุมัติไม่ได้ — สร้างแคปชันใหม่หรือเลือก draft`,
      ];
      return db;
    }

    const gate = evaluateApproveGate(post.captionPreview, AFFILIATE_DISCLOSURE);
    if (!gate.ok) {
      blockedErrors = gate.errors;
      return db;
    }

    post.status = "approved";
    post.approvedAt = new Date().toISOString();
    approved = true;
    return db;
  });

  if (!found) {
    return NextResponse.json({ error: "ไม่พบโพสต์" }, { status: 404 });
  }
  if (alreadyPosted) {
    return NextResponse.json({
      ok: true,
      message: "โพสต์นี้ถูกบันทึกว่าโพสต์แล้วแล้ว",
    });
  }
  if (!approved) {
    return NextResponse.json(
      {
        ok: false,
        error: "ยัง Approve ไม่ได้ — แก้แคปชันหรือกดสร้างใหม่ก่อน",
        errors: blockedErrors,
        message: blockedErrors.join(" · ") || "ยัง Approve ไม่ได้",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    message: "อนุมัติแล้ว — โพสต์ด้วยมือตาม caption (ระบบไม่โพสต์อัตโนมัติ)",
  });
}
