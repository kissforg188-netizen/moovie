import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";

/** User confirms they posted manually after approval. Never auto-posts. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let error: string | null = null;
  await updateDb((db) => {
    const post = db.schedule.find((s) => s.id === id);
    if (!post) {
      error = "ไม่พบโพสต์";
      return db;
    }
    if (post.status !== "approved" && post.status !== "posted") {
      error = "ต้อง Approve ก่อน จึงจะยืนยันว่าโพสต์แล้วได้";
      return db;
    }
    post.status = "posted";
    post.postedAt = new Date().toISOString();
    return db;
  });
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
