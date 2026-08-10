import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const md = await readFile(
      path.join(process.cwd(), "docs", "คู่มือการใช้งาน.md"),
      "utf8",
    );
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="lueakdee-user-guide.md"',
      },
    });
  } catch {
    return NextResponse.json({ error: "ไม่พบคู่มือ" }, { status: 404 });
  }
}
