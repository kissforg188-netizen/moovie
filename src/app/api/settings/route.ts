import { NextResponse } from "next/server";
import { readDb, updateDb } from "@/lib/db";
import { normalizeMaxPosts, resolveSettings } from "@/lib/settings";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ settings: resolveSettings(db) });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { maxPostsPerDay?: unknown };
  const maxPostsPerDay = normalizeMaxPosts(body.maxPostsPerDay);

  const db = await updateDb((db) => {
    db.settings = {
      maxPostsPerDay,
      updatedAt: new Date().toISOString(),
    };
    return db;
  });

  return NextResponse.json({
    settings: resolveSettings(db),
    message: `ตั้งเป้า draft ${maxPostsPerDay} ชิ้น/วันแล้ว (ยังต้อง Approve ก่อนโพสต์จริง)`,
  });
}
