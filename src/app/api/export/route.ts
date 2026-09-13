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
import { postingHygieneToMarkdown } from "@/lib/posting-hygiene";
import { resultsIntakeToMarkdown } from "@/lib/results-intake";
import { creativePerformanceToMarkdown } from "@/lib/creative-performance";
import { publishQueueToMarkdown } from "@/lib/publish-queue";
import { softRoiLabToMarkdown } from "@/lib/roi-lab";
import { channelFitLabToMarkdown } from "@/lib/channel-fit";
import { categoryFitLabToMarkdown } from "@/lib/category-fit";
import { priceBandFitLabToMarkdown } from "@/lib/price-band";
import { commissionBandFitLabToMarkdown } from "@/lib/commission-band";
import { painClarityFitLabToMarkdown } from "@/lib/pain-clarity";
import { videoEaseFitLabToMarkdown } from "@/lib/video-ease";
import { seasonalFitLabToMarkdown } from "@/lib/seasonal-fit";
import { audienceFitLabToMarkdown } from "@/lib/audience-fit";
import { hookFitLabToMarkdown } from "@/lib/hook-fit";
import { ctaFitLabToMarkdown } from "@/lib/cta-fit";
import { hashtagFitLabToMarkdown } from "@/lib/hashtag-fit";
import { toneFitLabToMarkdown } from "@/lib/tone-fit";
import { angleFitLabToMarkdown } from "@/lib/angle-fit";
import { lengthFitLabToMarkdown } from "@/lib/length-fit";
import { scriptFitLabToMarkdown } from "@/lib/script-fit";
import { proofFitLabToMarkdown } from "@/lib/proof-fit";
import { offerFitLabToMarkdown } from "@/lib/offer-fit";
import { benefitFitLabToMarkdown } from "@/lib/benefit-fit";
import { trustFitLabToMarkdown } from "@/lib/trust-fit";
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
    } else if (
      scope === "hygiene" ||
      scope === "posting-hygiene" ||
      scope === "anti-spam"
    ) {
      const snap = await getDashboardSnapshot();
      md = postingHygieneToMarkdown(snap.postingHygiene);
      filename = `affiliate-posting-hygiene-${todayISO()}.md`;
    } else if (
      scope === "intake" ||
      scope === "results-intake" ||
      scope === "metrics-queue"
    ) {
      const snap = await getDashboardSnapshot();
      md = resultsIntakeToMarkdown(snap.resultsIntake);
      filename = `affiliate-results-intake-${todayISO()}.md`;
    } else if (
      scope === "creative" ||
      scope === "creative-performance" ||
      scope === "hooks"
    ) {
      const snap = await getDashboardSnapshot();
      md = creativePerformanceToMarkdown(snap.creativePerformance);
      filename = `affiliate-creative-performance-${todayISO()}.md`;
    } else if (
      scope === "publish" ||
      scope === "publish-queue" ||
      scope === "manual-publish"
    ) {
      const snap = await getDashboardSnapshot();
      md = publishQueueToMarkdown(snap.publishQueue);
      filename = `affiliate-publish-queue-${todayISO()}.md`;
    } else if (
      scope === "roi" ||
      scope === "roi-lab" ||
      scope === "soft-roi"
    ) {
      const snap = await getDashboardSnapshot();
      md = softRoiLabToMarkdown(snap.softRoiLab);
      filename = `affiliate-soft-roi-lab-${todayISO()}.md`;
    } else if (
      scope === "channel-fit" ||
      scope === "channel" ||
      scope === "channels"
    ) {
      const snap = await getDashboardSnapshot();
      md = channelFitLabToMarkdown(snap.channelFitLab);
      filename = `affiliate-channel-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "category-fit" ||
      scope === "category" ||
      scope === "categories"
    ) {
      const snap = await getDashboardSnapshot();
      md = categoryFitLabToMarkdown(snap.categoryFitLab);
      filename = `affiliate-category-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "price-band" ||
      scope === "price-band-fit" ||
      scope === "impulse" ||
      scope === "price"
    ) {
      const snap = await getDashboardSnapshot();
      md = priceBandFitLabToMarkdown(snap.priceBandFitLab);
      filename = `affiliate-price-band-lab-${todayISO()}.md`;
    } else if (
      scope === "commission-band" ||
      scope === "commission-band-fit" ||
      scope === "commission" ||
      scope === "rate-band"
    ) {
      const snap = await getDashboardSnapshot();
      md = commissionBandFitLabToMarkdown(snap.commissionBandFitLab);
      filename = `affiliate-commission-band-lab-${todayISO()}.md`;
    } else if (
      scope === "pain-clarity" ||
      scope === "pain-clarity-fit" ||
      scope === "pain" ||
      scope === "pain-band"
    ) {
      const snap = await getDashboardSnapshot();
      md = painClarityFitLabToMarkdown(snap.painClarityFitLab);
      filename = `affiliate-pain-clarity-lab-${todayISO()}.md`;
    } else if (
      scope === "video-ease" ||
      scope === "video-ease-fit" ||
      scope === "video" ||
      scope === "filming-ease"
    ) {
      const snap = await getDashboardSnapshot();
      md = videoEaseFitLabToMarkdown(snap.videoEaseFitLab);
      filename = `affiliate-video-ease-lab-${todayISO()}.md`;
    } else if (
      scope === "seasonal-fit" ||
      scope === "seasonal" ||
      scope === "season" ||
      scope === "trend-season"
    ) {
      const snap = await getDashboardSnapshot();
      md = seasonalFitLabToMarkdown(snap.seasonalFitLab);
      filename = `affiliate-seasonal-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "audience-fit" ||
      scope === "audience" ||
      scope === "audience-band" ||
      scope === "target-audience"
    ) {
      const snap = await getDashboardSnapshot();
      md = audienceFitLabToMarkdown(snap.audienceFitLab);
      filename = `affiliate-audience-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "hook-fit" ||
      scope === "hook" ||
      scope === "hook-style" ||
      scope === "hooks"
    ) {
      const snap = await getDashboardSnapshot();
      md = hookFitLabToMarkdown(snap.hookFitLab);
      filename = `affiliate-hook-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "cta-fit" ||
      scope === "cta" ||
      scope === "cta-style" ||
      scope === "ctas"
    ) {
      const snap = await getDashboardSnapshot();
      md = ctaFitLabToMarkdown(snap.ctaFitLab);
      filename = `affiliate-cta-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "hashtag-fit" ||
      scope === "hashtag" ||
      scope === "hashtags" ||
      scope === "tag-fit" ||
      scope === "tags"
    ) {
      const snap = await getDashboardSnapshot();
      md = hashtagFitLabToMarkdown(snap.hashtagFitLab);
      filename = `affiliate-hashtag-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "tone-fit" ||
      scope === "tone" ||
      scope === "voice" ||
      scope === "voice-fit" ||
      scope === "tones"
    ) {
      const snap = await getDashboardSnapshot();
      md = toneFitLabToMarkdown(snap.toneFitLab);
      filename = `affiliate-tone-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "angle-fit" ||
      scope === "angle" ||
      scope === "angles" ||
      scope === "selling-angle" ||
      scope === "selling-angles"
    ) {
      const snap = await getDashboardSnapshot();
      md = angleFitLabToMarkdown(snap.angleFitLab);
      filename = `affiliate-angle-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "length-fit" ||
      scope === "length" ||
      scope === "caption-length" ||
      scope === "lengths" ||
      scope === "body-length"
    ) {
      const snap = await getDashboardSnapshot();
      md = lengthFitLabToMarkdown(snap.lengthFitLab);
      filename = `affiliate-length-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "script-fit" ||
      scope === "script" ||
      scope === "scripts" ||
      scope === "video-script" ||
      scope === "tiktok-script"
    ) {
      const snap = await getDashboardSnapshot();
      md = scriptFitLabToMarkdown(snap.scriptFitLab);
      filename = `affiliate-script-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "proof-fit" ||
      scope === "proof" ||
      scope === "proofs" ||
      scope === "social-proof" ||
      scope === "credibility"
    ) {
      const snap = await getDashboardSnapshot();
      md = proofFitLabToMarkdown(snap.proofFitLab);
      filename = `affiliate-proof-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "offer-fit" ||
      scope === "offer" ||
      scope === "offers" ||
      scope === "value-offer" ||
      scope === "value-fit"
    ) {
      const snap = await getDashboardSnapshot();
      md = offerFitLabToMarkdown(snap.offerFitLab);
      filename = `affiliate-offer-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "benefit-fit" ||
      scope === "benefit" ||
      scope === "benefits" ||
      scope === "value-benefit" ||
      scope === "benefit-framing"
    ) {
      const snap = await getDashboardSnapshot();
      md = benefitFitLabToMarkdown(snap.benefitFitLab);
      filename = `affiliate-benefit-fit-lab-${todayISO()}.md`;
    } else if (
      scope === "trust-fit" ||
      scope === "trust" ||
      scope === "trusts" ||
      scope === "sincerity" ||
      scope === "trust-framing"
    ) {
      const snap = await getDashboardSnapshot();
      md = trustFitLabToMarkdown(snap.trustFitLab);
      filename = `affiliate-trust-fit-lab-${todayISO()}.md`;
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
