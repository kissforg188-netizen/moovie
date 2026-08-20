import { NextResponse } from "next/server";
import { todayISO, readDb } from "@/lib/db";
import {
  approvedTodayToMarkdown,
  briefsToCsv,
  contentPacksToMarkdown,
  dbToJson,
  experimentsToMarkdown,
  filmingPlanFromDb,
  productsToCsv,
  scheduleToCsv,
  todayDraftsToMarkdown,
  weeklyToCsv,
} from "@/lib/export";
import {
  postingPacksForDate,
  postingPacksToMarkdown,
} from "@/lib/posting-pack";
import { approveQueueToMarkdown } from "@/lib/approve-queue";
import { dailyDigestToMarkdown } from "@/lib/daily-digest";
import { tomorrowPlanToMarkdown } from "@/lib/tomorrow-plan";
import { winnerPlaybookToMarkdown } from "@/lib/winner-playbook";
import { weeklyReviewToMarkdown } from "@/lib/weekly-review";
import { getDashboardSnapshot } from "@/lib/workflow";
import { weeklyProductRollup } from "@/lib/weekly";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const scope = searchParams.get("scope") ?? "all";
  const db = await readDb();

  if (format === "md" || format === "markdown") {
    let md: string;
    let filename = "affiliate-packs.md";
    if (scope === "approved") {
      md = approvedTodayToMarkdown(db, todayISO());
      filename = `affiliate-approved-${todayISO()}.md`;
    } else if (scope === "today" || scope === "drafts") {
      md = todayDraftsToMarkdown(db, todayISO());
      filename = `affiliate-drafts-${todayISO()}.md`;
    } else if (scope === "experiments" || scope === "experiment") {
      const snap = await getDashboardSnapshot();
      md = experimentsToMarkdown(snap.experiment);
      filename = `affiliate-experiments-${todayISO()}.md`;
    } else if (scope === "filming" || scope === "film") {
      md = filmingPlanFromDb(db, todayISO());
      filename = `affiliate-filming-${todayISO()}.md`;
    } else if (scope === "posting" || scope === "posting-packs") {
      const packs = postingPacksForDate(db, todayISO());
      md = postingPacksToMarkdown(packs, todayISO());
      filename = `affiliate-posting-packs-${todayISO()}.md`;
    } else if (scope === "digest" || scope === "actions") {
      const snap = await getDashboardSnapshot();
      md = dailyDigestToMarkdown(snap.digest);
      filename = `affiliate-digest-${todayISO()}.md`;
    } else if (scope === "tomorrow" || scope === "tomorrow-plan") {
      const snap = await getDashboardSnapshot();
      md = tomorrowPlanToMarkdown(snap.tomorrowPlan);
      filename = `affiliate-tomorrow-${snap.tomorrowPlan.tomorrowDate}.md`;
    } else if (
      scope === "approve-queue" ||
      scope === "approve" ||
      scope === "queue"
    ) {
      const snap = await getDashboardSnapshot();
      md = approveQueueToMarkdown(snap.approveQueue);
      filename = `affiliate-approve-queue-${todayISO()}.md`;
    } else if (
      scope === "playbook" ||
      scope === "winner-playbook" ||
      scope === "winners"
    ) {
      const snap = await getDashboardSnapshot();
      md = winnerPlaybookToMarkdown(snap.winnerPlaybook);
      filename = `affiliate-winner-playbook-${todayISO()}.md`;
    } else if (
      scope === "weekly-review" ||
      scope === "week-review" ||
      scope === "review"
    ) {
      const snap = await getDashboardSnapshot();
      md = weeklyReviewToMarkdown(snap.weeklyReview);
      filename = `affiliate-weekly-review-${todayISO()}.md`;
    } else {
      md = contentPacksToMarkdown(db);
    }
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

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
