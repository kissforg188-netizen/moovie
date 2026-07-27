import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let found = false;
  await updateDb((db) => {
    const post = db.schedule.find((s) => s.id === id);
    if (!post) return db;
    if (post.status === "posted") {
      found = true;
      return db;
    }
    post.status = "approved";
    post.approvedAt = new Date().toISOString();
    found = true;
    return db;
  });
  if (!found) {
    return NextResponse.json({ error: "ไม่พบโพสต์" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    message: "อนุมัติแล้ว — โพสต์ด้วยมือตาม caption (ระบบไม่โพสต์อัตโนมัติ)",
  });
}
