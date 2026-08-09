import { NextResponse } from "next/server";
import { readDb, updateDb } from "@/lib/db";
import {
  normalizeCooldownDays,
  normalizeMaxPosts,
  normalizeStaleDraftDays,
  resolveSettings,
} from "@/lib/settings";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ settings: resolveSettings(db) });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    maxPostsPerDay?: unknown;
    cooldownDays?: unknown;
    staleDraftDays?: unknown;
  };

  const current = resolveSettings(await readDb());
  const maxPostsPerDay =
    body.maxPostsPerDay !== undefined
      ? normalizeMaxPosts(body.maxPostsPerDay)
      : current.maxPostsPerDay;
  const cooldownDays =
    body.cooldownDays !== undefined
      ? normalizeCooldownDays(body.cooldownDays)
      : current.cooldownDays;
  const staleDraftDays =
    body.staleDraftDays !== undefined
      ? normalizeStaleDraftDays(body.staleDraftDays)
      : current.staleDraftDays;

  const db = await updateDb((db) => {
    db.settings = {
      maxPostsPerDay,
      cooldownDays,
      staleDraftDays,
      updatedAt: new Date().toISOString(),
    };
    return db;
  });

  return NextResponse.json({
    settings: resolveSettings(db),
    message: `ตั้งค่าแล้ว: ${maxPostsPerDay} draft/วัน · cooldown ${cooldownDays} วัน · ข้าม draft ค้าง ${staleDraftDays} วัน (ยังต้อง Approve ก่อนโพสต์จริง)`,
  });
}
