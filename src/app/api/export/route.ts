import { NextResponse } from "next/server";
import { todayISO, readDb } from "@/lib/db";
import {
  briefsToCsv,
  dbToJson,
  productsToCsv,
  scheduleToCsv,
  weeklyToCsv,
} from "@/lib/export";
import { weeklyProductRollup } from "@/lib/weekly";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const scope = searchParams.get("scope") ?? "all";
  const db = await readDb();

  if (format === "csv") {
    let csv: string;
    let filename = `affiliate-${scope}.csv`;
    if (scope === "schedule") {
      csv = scheduleToCsv(db);
    } else if (scope === "briefs") {
      csv = briefsToCsv(db);
    } else if (scope === "weekly") {
      csv = weeklyToCsv(weeklyProductRollup(db.products, db.schedule, todayISO(), 7));
      filename = "affiliate-weekly.csv";
    } else {
      csv = productsToCsv(db);
    }
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
