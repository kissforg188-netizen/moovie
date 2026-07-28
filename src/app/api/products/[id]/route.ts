import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await updateDb((db) => {
    db.products = db.products.filter((p) => p.id !== id);
    return db;
  });
  return NextResponse.json({ ok: true });
}
