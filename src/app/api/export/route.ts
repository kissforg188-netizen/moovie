import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import {
  briefsToCsv,
  dbToJson,
  productsToCsv,
  scheduleToCsv,
} from "@/lib/export";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const scope = searchParams.get("scope") ?? "all";
  const db = await readDb();

  if (format === "csv") {
    const csv =
      scope === "schedule"
        ? scheduleToCsv(db)
        : scope === "briefs"
          ? briefsToCsv(db)
          : productsToCsv(db);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="affiliate-${scope}.csv"`,
      },
    });
  }

  return new NextResponse(dbToJson(db), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="affiliate-db.json"',
    },
  });
}
