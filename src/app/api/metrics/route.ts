import { NextResponse } from "next/server";
import { newId, readDb, todayISO, updateDb } from "@/lib/db";
import type { PerformanceMetric } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const db = await readDb();
  const metrics = date
    ? db.metrics.filter((m) => m.date === date)
    : db.metrics;
  return NextResponse.json({ metrics });
}

export async function POST(request: Request) {
  const body = await request.json();
  const scheduledPostId = String(body.scheduledPostId ?? "");
  if (!scheduledPostId) {
    return NextResponse.json(
      { error: "ต้องระบุ scheduledPostId" },
      { status: 400 }
    );
  }

  const db = await readDb();
  const post = db.schedule.find((p) => p.id === scheduledPostId);
  if (!post) {
    return NextResponse.json({ error: "ไม่พบโพสต์ในตาราง" }, { status: 404 });
  }

  const metric: PerformanceMetric = {
    id: newId("metric"),
    scheduledPostId,
    productId: post.productId,
    date: String(body.date ?? post.date ?? todayISO()),
    views: Number(body.views) || 0,
    clicks: Number(body.clicks) || 0,
    orders: Number(body.orders) || 0,
    commissionEarned: Number(body.commissionEarned) || 0,
    notes: String(body.notes ?? "").trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  await updateDb((state) => {
    state.metrics.push(metric);
  });

  return NextResponse.json({ metric }, { status: 201 });
}
