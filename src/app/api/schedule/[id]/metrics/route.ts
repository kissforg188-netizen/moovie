import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";
import type { PostMetrics } from "@/lib/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as Partial<PostMetrics>;
  let error: string | null = null;

  await updateDb((db) => {
    const post = db.schedule.find((s) => s.id === id);
    if (!post) {
      error = "ไม่พบโพสต์";
      return db;
    }
    post.metrics = {
      views: Number(body.views) || 0,
      clicks: Number(body.clicks) || 0,
      orders: Number(body.orders) || 0,
      commissionEarned: Number(body.commissionEarned) || 0,
      notes: body.notes?.trim(),
      recordedAt: new Date().toISOString(),
    };
    if (post.status === "approved") {
      post.status = "posted";
      post.postedAt = post.postedAt ?? new Date().toISOString();
    }
    return db;
  });

  if (error) {
    return NextResponse.json({ error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
