import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";

/** Mark a draft as skipped — never posts. Free the slot for anti-spam rotation. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let found = false;
  let blocked = false;

  await updateDb((db) => {
    const post = db.schedule.find((s) => s.id === id);
    if (!post) return db;
    found = true;
    if (post.status === "posted") {
      blocked = true;
      return db;
    }
    post.status = "skipped";
    return db;
  });

  if (!found) {
    return NextResponse.json({ error: "ไม่พบโพสต์" }, { status: 404 });
  }
  if (blocked) {
    return NextResponse.json(
      { error: "โพสต์ที่บันทึกว่าโพสต์แล้วแล้ว ไม่สามารถข้ามได้" },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    message: "ข้าม draft แล้ว — จะไม่นับเป็นคิวซ้ำในกฎกันสแปม 3 วัน",
  });
}
