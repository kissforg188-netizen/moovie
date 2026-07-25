import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import {
  exportAllJson,
  exportMetricsCsv,
  exportProductsCsv,
  exportScheduleCsv,
} from "@/lib/export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "json";
  const db = await readDb();

  if (type === "products.csv") {
    return new NextResponse(exportProductsCsv(db), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=products.csv",
      },
    });
  }
  if (type === "schedule.csv") {
    return new NextResponse(exportScheduleCsv(db), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=schedule.csv",
      },
    });
  }
  if (type === "metrics.csv") {
    return new NextResponse(exportMetricsCsv(db), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=metrics.csv",
      },
    });
  }

  return new NextResponse(exportAllJson(db), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=lueakdee-export.json",
    },
  });
}
