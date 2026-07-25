import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Approve a draft for publishing.
 * Does NOT call external APIs — marks as approved so the user can post manually.
 * Optional action "mark_posted" after the user posts by hand.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const id = String(body.id ?? "");
  const action = String(body.action ?? "approve");

  if (!id) {
    return NextResponse.json({ error: "ต้องระบุ id ของโพสต์" }, { status: 400 });
  }

  const db = await readDb();
  const post = db.schedule.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "ไม่พบโพสต์" }, { status: 404 });
  }

  const now = new Date().toISOString();
  if (action === "approve") {
    if (post.status !== "draft" && post.status !== "skipped") {
      return NextResponse.json(
        { error: "อนุมัติได้เฉพาะสถานะ draft" },
        { status: 400 }
      );
    }
    post.status = "approved";
    post.approvedAt = now;
  } else if (action === "mark_posted") {
    if (post.status === "draft") post.approvedAt = now;
    post.status = "posted";
    post.postedAt = now;
  } else if (action === "skip") {
    post.status = "skipped";
  } else {
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  }

  await writeDb(db);
  return NextResponse.json({ post });
}
