import { NextResponse } from "next/server";
import { updateDb } from "@/lib/db";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { active?: boolean };
  let found = false;

  const db = await updateDb((db) => {
    const product = db.products.find((p) => p.id === id);
    if (!product) return db;
    found = true;
    if (typeof body.active === "boolean") {
      product.active = body.active;
      product.updatedAt = new Date().toISOString();
    }
    return db;
  });

  if (!found) {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  }

  const product = db.products.find((p) => p.id === id)!;
  return NextResponse.json({
    product,
    message:
      product.active === false
        ? "พักสินค้าแล้ว — จะไม่เข้า Morning ranking จนกว่าจะเปิดใหม่"
        : "เปิดโปรโมตสินค้าแล้ว",
  });
}

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
