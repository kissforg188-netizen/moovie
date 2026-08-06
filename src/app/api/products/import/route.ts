import { NextResponse } from "next/server";
import {
  logAutomationFinish,
  logAutomationStart,
} from "@/lib/automation-log";
import { readDb, updateDb } from "@/lib/db";
import { parseImportPayload, rowsToProducts } from "@/lib/import";

export async function POST(request: Request) {
  const jobId = await logAutomationStart("import", "นำเข้าสินค้า");
  try {
    const contentType = request.headers.get("content-type");
    const body = await request.text();
    const rows = parseImportPayload(body, contentType);
    const current = await readDb();
    const { products, skipped, duplicates } = rowsToProducts(
      rows,
      current.products.map((p) => p.affiliateUrl),
    );

    if (products.length === 0) {
      await logAutomationFinish(jobId, "failed", "ไม่มีแถวที่นำเข้าได้", {
        skipped,
        duplicates,
      });
      return NextResponse.json(
        {
          error:
            duplicates > 0
              ? `ข้ามลิงก์ซ้ำ ${duplicates} รายการ และไม่มีสินค้าใหม่ให้นำเข้า`
              : "ไม่พบสินค้าที่นำเข้าได้ — ต้องมีอย่างน้อย name และ affiliateUrl/url",
          skipped,
          duplicates,
        },
        { status: 400 },
      );
    }

    await updateDb((db) => {
      db.products.push(...products);
      return db;
    });

    await logAutomationFinish(
      jobId,
      "success",
      `นำเข้า ${products.length} สินค้า (ข้ามแถวเสีย ${skipped}, ลิงก์ซ้ำ ${duplicates})`,
      { imported: products.length, skipped, duplicates },
    );

    return NextResponse.json({
      ok: true,
      imported: products.length,
      skipped,
      duplicates,
      products,
    });
  } catch (err) {
    await logAutomationFinish(
      jobId,
      "failed",
      err instanceof Error ? err.message : "import failed",
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
