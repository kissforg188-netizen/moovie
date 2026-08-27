import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { buildPostingPack } from "@/lib/posting-pack";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = await readDb();
  const post = db.schedule.find((s) => s.id === id);
  if (!post) {
    return NextResponse.json({ error: "ไม่พบตารางโพสต์" }, { status: 404 });
  }
  const product = db.products.find((p) => p.id === post.productId);
  const pack = db.contentPacks.find((p) => p.id === post.contentPackId);
  const postingPack = buildPostingPack(post, product, pack);

  const { searchParams } = new URL(_request.url);
  const format = searchParams.get("format") ?? "json";

  if (format === "text" || format === "txt") {
    return new NextResponse(postingPack.text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="posting-pack-${id}.txt"`,
      },
    });
  }

  return NextResponse.json({ pack: postingPack });
}
