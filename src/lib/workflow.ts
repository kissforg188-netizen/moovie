import { analyzePosted } from "./analytics";
import {
  logAutomationFinish,
  logAutomationStart,
} from "./automation-log";
import { qualityBriefLines } from "./caption-quality";
import {
  auditDraftCaptions,
  productReadinessIssues,
} from "./compliance";
import { generateContentPack } from "./content";
import { dateFromYmd, newId, readDb, todayISO, updateDb } from "./db";
import { AFFILIATE_DISCLOSURE, INCOME_DISCLAIMER } from "./disclosure";
import { buildExperimentPlan } from "./experiments";
import { buildFilmingQueue, filmingQueueLines } from "./filming";
import { buildLearningState } from "./learning";
import {
  buildPauseSuggestions,
  pauseSuggestionLines,
} from "./pause-suggestions";
import { explainScore, rankProducts } from "./scoring";
import { buildDailySchedule, expireStaleDrafts } from "./schedule";
import { currentSeasonHint, eventProximityBoost } from "./seasonality";
import { resolveSettings } from "./settings";
import type { ContentPack, DailyBrief, Database } from "./types";
import { weeklyInsightLines, weeklyProductRollup } from "./weekly";
import {
  approveQueueLines,
  buildApproveQueue,
  type ApproveQueue,
} from "./approve-queue";
import { buildDailyDigest, type DailyDigest } from "./daily-digest";
import {
  buildTomorrowPlan,
  tomorrowPlanLines,
  type TomorrowPlan,
} from "./tomorrow-plan";
import {
  buildWinnerPlaybook,
  winnerPlaybookLines,
  type WinnerPlaybook,
} from "./winner-playbook";
import {
  buildWeeklyReview,
  weeklyReviewLines,
  type WeeklyReview,
} from "./weekly-review";
import {
  buildPostingHygiene,
  postingHygieneLines,
  type PostingHygiene,
} from "./posting-hygiene";
import {
  buildResultsIntake,
  resultsIntakeLines,
  type ResultsIntake,
} from "./results-intake";
import {
  buildCreativePerformance,
  creativePerformanceLines,
  type CreativePerformance,
} from "./creative-performance";
import {
  buildPublishQueue,
  publishQueueLines,
  type PublishQueue,
} from "./publish-queue";
import {
  buildSoftRoiLab,
  softRoiLabLines,
  type SoftRoiLab,
} from "./roi-lab";
import {
  buildChannelFitLab,
  channelFitLabLines,
  type ChannelFitLab,
} from "./channel-fit";
import {
  buildCategoryFitLab,
  categoryFitLabLines,
  type CategoryFitLab,
} from "./category-fit";
import {
  buildPriceBandFitLab,
  priceBandFitLabLines,
  type PriceBandFitLab,
} from "./price-band";
import {
  buildCommissionBandFitLab,
  commissionBandFitLabLines,
  type CommissionBandFitLab,
} from "./commission-band";

function dayNumber(date: string): number {
  const n = Number(date.replaceAll("-", ""));
  return Number.isFinite(n) ? n : 0;
}

function needsFreshPack(pack: ContentPack | undefined, date: string): boolean {
  if (!pack) return true;
  if (!pack.facebookGroupCaption) return true;
  if (!pack.filmingChecklist || pack.filmingChecklist.length === 0) return true;
  if (!pack.sellingAngles || pack.sellingAngles.length === 0) return true;
  const createdDay = pack.createdAt.slice(0, 10);
  return createdDay !== date;
}

function latestBrief(
  db: Database,
  type: "morning" | "evening",
  date: string,
): DailyBrief | undefined {
  return [...db.briefs]
    .filter((b) => b.type === type && b.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function runMorningWorkflow(
  date = todayISO(),
  options?: { force?: boolean },
) {
  const force = options?.force ?? false;

  // Idempotent: if morning already ran and we already have drafts today, reuse
  if (!force) {
    const existing = await readDb();
    const prior = latestBrief(existing, "morning", date);
    const todayDrafts = existing.schedule.filter((s) => s.date === date);
    if (prior && todayDrafts.length > 0) {
      const jobId = await logAutomationStart(
        "morning",
        `ข้าม Morning ซ้ำ ${date} (มี brief + draft แล้ว — ส่ง force=true เพื่อรันใหม่)`,
        { date, idempotent: true },
      );
      await logAutomationFinish(
        jobId,
        "success",
        `ใช้ brief เช้าที่มีอยู่แล้ว: ${prior.summary}`,
        { date, reusedBriefId: prior.id, drafts: todayDrafts.length },
      );
      return existing;
    }
  }

  const jobId = await logAutomationStart("morning", `เริ่ม Morning workflow ${date}`, {
    date,
    force,
  });
  try {
    const db = await updateDb((db) => {
      const settings = resolveSettings(db);
      const { expiredIds } = expireStaleDrafts(
        db.schedule,
        date,
        settings.staleDraftDays,
      );
      const learning = db.learning;
      const seasonDate = dateFromYmd(date);
      const ranked = rankProducts(
        db.products,
        5,
        db.schedule,
        learning,
        seasonDate,
      );
      const packs: ContentPack[] = [];
      const pairs: {
        product: (typeof ranked)[0]["product"];
        pack: ContentPack;
      }[] = [];

      for (const item of ranked) {
        const existing = db.contentPacks
          .filter((p) => p.productId === item.product.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

        let pack = existing;
        if (force || needsFreshPack(existing, date)) {
          const variant = dayNumber(date) + ranked.indexOf(item);
          pack = generateContentPack(item.product, { variant });
          packs.push(pack);
          db.contentPacks.push(pack);
        }

        pairs.push({ product: item.product, pack: pack! });
      }

      const newPosts = buildDailySchedule({
        date,
        ranked: pairs,
        existing: db.schedule,
        maxPosts: settings.maxPostsPerDay,
        cooldownDays: settings.cooldownDays,
        learning,
      });
      db.schedule.push(...newPosts);

      const season = currentSeasonHint(seasonDate);
      const eventBoost = eventProximityBoost(
        ranked[0]?.product.category ?? "",
        seasonDate,
      );
      const platforms = [...new Set(ranked.map((r) => r.product.platform))];
      const categories = [
        ...new Set(ranked.map((r) => r.product.category || "ทั่วไป")),
      ];
      const paused = db.products.filter((p) => p.active === false).length;

      const filmingQueue = buildFilmingQueue(
        ranked,
        pairs.map((p) => p.pack),
        [...db.schedule],
        date,
      );
      const filmLines = filmingQueueLines(filmingQueue, 3);
      const shootFirst = filmingQueue[0];

      const todayForAudit = db.schedule.filter((s) => s.date === date);
      const compliance = auditDraftCaptions(todayForAudit, AFFILIATE_DISCLOSURE);
      const readiness = productReadinessIssues(db.products);

      const experiment = buildExperimentPlan({
        date,
        ranked,
        packs: pairs.map((p) => p.pack),
        schedule: db.schedule,
        products: db.products,
        learning,
      });

      const rankExplain = ranked.slice(0, 3).map((r, i) => {
        return `#${i + 1} ${r.product.name}: ${explainScore(r.product, r.score)}`;
      });

      const recommendations = [
        ranked.length
          ? `Top โปรโมตวันนี้: ${ranked.map((r) => r.product.name).join(", ")}`
          : "ยังไม่มีสินค้า — เพิ่มสินค้าในแดชบอร์ดก่อน",
        ...rankExplain,
        paused > 0 ? `ข้ามสินค้าที่พักไว้ ${paused} ชิ้น (ไม่เข้า ranking)` : null,
        expiredIds.length > 0
          ? `ข้าม draft ค้าง ${expiredIds.length} ชิ้น (เก่ากว่า ${settings.staleDraftDays} วัน)`
          : null,
        `กระจายแพลตฟอร์มใน Top: ${platforms.join(", ") || "—"}`,
        `กระจายหมวดใน Top: ${categories.join(", ") || "—"}`,
        learning?.sourceDate
          ? `ใช้ learning จากเย็น ${learning.sourceDate} (ทดลอง ไม่การันตี)`
          : null,
        ...(learning?.notes?.slice(0, 2) ?? []),
        `ช่วงฤดูกาล: ${season.label} — หมวดที่สอดคล้องมีโอกาสถูกจัดอันดับสูงขึ้นเล็กน้อย (ทดลอง)`,
        eventBoost.label
          ? `อีเวนต์ใกล้ถึง: ${eventBoost.label} — หมวดของขวัญ/ดูแลได้ soft boost เพิ่ม`
          : null,
        ...filmLines,
        shootFirst?.firstChecklist
          ? `Checklist ถ่ายวิดีโอ (ตัวแรก): ${shootFirst.firstChecklist}`
          : null,
        shootFirst?.sellingAngle
          ? `มุมขายแนะนำตัวแรก: ${shootFirst.sellingAngle}`
          : null,
        ...compliance.summaryLines,
        ...qualityBriefLines(todayForAudit, db.products),
        ...readiness.slice(0, 2),
        ...experiment.lines.slice(0, 3),
        ...buildDailyDigest(db, date).lines.slice(0, 6),
        ...approveQueueLines(buildApproveQueue(db, date), 5),
        ...winnerPlaybookLines(buildWinnerPlaybook(db, date), 4),
        ...weeklyReviewLines(buildWeeklyReview(db, date), 4),
        ...postingHygieneLines(buildPostingHygiene(db, date), 5),
        ...resultsIntakeLines(buildResultsIntake(db, date), 4),
        ...creativePerformanceLines(buildCreativePerformance(db, date), 4),
        ...publishQueueLines(buildPublishQueue(db, date), 5),
        ...softRoiLabLines(buildSoftRoiLab(db, date), 4),
        ...channelFitLabLines(buildChannelFitLab(db, date), 4),
        ...categoryFitLabLines(buildCategoryFitLab(db, date), 4),
        ...priceBandFitLabLines(buildPriceBandFitLab(db, date), 4),
        ...commissionBandFitLabLines(buildCommissionBandFitLab(db, date), 4),
        `สร้าง draft โพสต์ ${newPosts.length} ชิ้น (เป้า ${settings.maxPostsPerDay}/วัน · ต้อง Approve ก่อนโพสต์จริง)`,
        "ห้ามโพสต์ซ้ำข้อความเดิม และต้องมี disclosure ทุกครั้ง",
        `ระบบหลีกเลี่ยง product+channel ที่เพิ่งใช้ใน ${settings.cooldownDays} วันล่าสุด และกระจายช่องทางในวันเดียวกัน`,
      ].filter(Boolean) as string[];

      const brief: DailyBrief = {
        id: newId("brief"),
        date,
        type: "morning",
        topProductIds: ranked.map((r) => r.product.id),
        contentPackIds: pairs.map((p) => p.pack.id),
        scheduleIds: newPosts.map((p) => p.id),
        summary: `เช้านี้คัด ${ranked.length} สินค้า และเตรียม draft ${newPosts.length} โพสต์สำหรับ ${date}`,
        recommendations,
        disclaimer: INCOME_DISCLAIMER,
        createdAt: new Date().toISOString(),
      };
      db.briefs.push(brief);

      return db;
    });

    const brief = latestBrief(db, "morning", date);

    await logAutomationFinish(jobId, "success", brief?.summary ?? "morning ok", {
      date,
      drafts: brief?.scheduleIds.length ?? 0,
    });
    return db;
  } catch (err) {
    await logAutomationFinish(
      jobId,
      "failed",
      err instanceof Error ? err.message : "morning failed",
    );
    throw err;
  }
}

export async function runEveningWorkflow(
  date = todayISO(),
  options?: { force?: boolean },
) {
  const force = options?.force ?? false;

  if (!force) {
    const existing = await readDb();
    const prior = latestBrief(existing, "evening", date);
    if (prior) {
      const jobId = await logAutomationStart(
        "evening",
        `ข้าม Evening ซ้ำ ${date} (มี brief แล้ว — ส่ง force=true เพื่อรันใหม่หลังกรอกผลเพิ่ม)`,
        { date, idempotent: true },
      );
      await logAutomationFinish(
        jobId,
        "success",
        `ใช้ brief เย็นที่มีอยู่แล้ว: ${prior.summary}`,
        { date, reusedBriefId: prior.id },
      );
      return existing;
    }
  }

  const jobId = await logAutomationStart("evening", `เริ่ม Evening workflow ${date}`, {
    date,
    force,
  });
  try {
    const db = await updateDb((db) => {
      const todays = db.schedule.filter((s) => s.date === date);
      const analysis = analyzePosted(todays, db.products);
      const weekly = weeklyProductRollup(db.products, db.schedule, date, 7);
      const weeklyLines = weeklyInsightLines(weekly);
      const learning = buildLearningState(analysis.performances, date);
      db.learning = learning;

      const pauseSuggestions = buildPauseSuggestions({
        products: db.products,
        schedule: db.schedule,
        learning,
      });
      const pauseLines = pauseSuggestionLines(pauseSuggestions);

      const nextFocus = rankProducts(
        db.products,
        3,
        db.schedule,
        learning,
        dateFromYmd(date),
      ).map((r) => r.product.name);

      const tomorrowPlan = buildTomorrowPlan(db, date);
      const playbook = buildWinnerPlaybook(db, date);
      const weeklyReview = buildWeeklyReview(db, date);
      const postingHygiene = buildPostingHygiene(db, date);
      const resultsIntake = buildResultsIntake(db, date);
      const creativePerformance = buildCreativePerformance(db, date);
      const publishQueue = buildPublishQueue(db, date);
      const softRoiLab = buildSoftRoiLab(db, date);
      const channelFitLab = buildChannelFitLab(db, date);
      const categoryFitLab = buildCategoryFitLab(db, date);
      const priceBandFitLab = buildPriceBandFitLab(db, date);
      const commissionBandFitLab = buildCommissionBandFitLab(db, date);

      const recommendations = [
        ...analysis.recommendations,
        ...weeklyLines,
        ...learning.notes,
        ...pauseLines,
        ...tomorrowPlanLines(tomorrowPlan, 6),
        ...winnerPlaybookLines(playbook, 6),
        ...weeklyReviewLines(weeklyReview, 6),
        ...postingHygieneLines(postingHygiene, 5),
        ...resultsIntakeLines(resultsIntake, 6),
        ...creativePerformanceLines(creativePerformance, 6),
        ...publishQueueLines(publishQueue, 6),
        ...softRoiLabLines(softRoiLab, 5),
        ...channelFitLabLines(channelFitLab, 5),
        ...categoryFitLabLines(categoryFitLab, 5),
        ...priceBandFitLabLines(priceBandFitLab, 5),
        ...commissionBandFitLabLines(commissionBandFitLab, 5),
        nextFocus.length
          ? `สินค้าแนะนำวันถัดไป (จากคะแนน+ผลที่บันทึก): ${nextFocus.join(", ")}`
          : "เพิ่มสินค้าเพิ่มเติมเพื่อให้จัดอันดับได้แม่นขึ้น",
        "Learning ถูกบันทึกเพื่อ bias อ่อน ๆ ใน Morning วันถัดไป — ยังเป็น draft และต้อง Approve ก่อนโพสต์",
        "แคปชันที่ไม่ผ่าน disclosure/คำโฆษณาจะ Approve ไม่ได้ — กดสร้างแคปชันใหม่ที่ตารางโพสต์",
        resultsIntake.counts.needsAttention > 0
          ? `ยังมีผลไม่ครบ ${resultsIntake.counts.needsAttention} ชิ้น — กรอกที่ /results ก่อนรัน Evening ซ้ำ (force)`
          : null,
        creativePerformance.counts.leaders > 0
          ? `มีมุมขายเด่น ${creativePerformance.counts.leaders} แบบในบอร์ด Creative — ใช้เป็นสมมติฐานทดลอง ไม่การันตี`
          : null,
        publishQueue.counts.needsAttention > 0
          ? `ยังมี approved รอโพสต์มือ ${publishQueue.counts.needsAttention} ชิ้นที่ควรสนใจ — ดู Publish Queue ที่ /calendar`
          : null,
        softRoiLab.counts.promising > 0
          ? `Soft ROI Lab มี ${softRoiLab.counts.promising} สินค้ากลุ่มน่าลอง — ใช้ช่วงค่าคอมเป็นสมมติฐานทดลอง ไม่การันตีรายได้`
          : null,
        channelFitLab.counts.strong > 0 || channelFitLab.counts.unbalanced
          ? `Channel Fit: ช่องแข็งแรง ${channelFitLab.counts.strong} · ${channelFitLab.mixTip}`
          : null,
        categoryFitLab.counts.hot > 0 || categoryFitLab.counts.unbalanced
          ? `Category Fit: หมวดร้อน ${categoryFitLab.counts.hot} · ${categoryFitLab.mixTip}`
          : null,
        priceBandFitLab.counts.hot > 0 || priceBandFitLab.counts.unbalanced
          ? `Price Band: ช่วงร้อน ${priceBandFitLab.counts.hot} · ${priceBandFitLab.mixTip}`
          : null,
        commissionBandFitLab.counts.hot > 0 ||
          commissionBandFitLab.counts.unbalanced
          ? `Commission Band: ช่วงร้อน ${commissionBandFitLab.counts.hot} · ${commissionBandFitLab.mixTip}`
          : null,
      ].filter(Boolean) as string[];

      const brief: DailyBrief = {
        id: newId("brief"),
        date,
        type: "evening",
        topProductIds:
          weekly[0]?.productId
            ? [weekly[0].productId, ...analysis.winners.map((w) => w.post.productId)]
            : analysis.winners.map((w) => w.post.productId),
        contentPackIds: [],
        scheduleIds: todays.map((t) => t.id),
        summary: analysis.summary,
        recommendations,
        disclaimer: analysis.disclaimer,
        createdAt: new Date().toISOString(),
      };
      db.briefs.push(brief);
      return db;
    });

    const brief = latestBrief(db, "evening", date);
    await logAutomationFinish(jobId, "success", brief?.summary ?? "evening ok", {
      date,
    });
    return db;
  } catch (err) {
    await logAutomationFinish(
      jobId,
      "failed",
      err instanceof Error ? err.message : "evening failed",
    );
    throw err;
  }
}

export async function getDashboardSnapshot(): Promise<{
  db: Database;
  ranked: ReturnType<typeof rankProducts>;
  todaySchedule: Database["schedule"];
  latestMorning?: DailyBrief;
  latestEvening?: DailyBrief;
  weekly: ReturnType<typeof weeklyProductRollup>;
  experiment: ReturnType<typeof buildExperimentPlan>;
  digest: DailyDigest;
  tomorrowPlan: TomorrowPlan;
  approveQueue: ApproveQueue;
  winnerPlaybook: WinnerPlaybook;
  weeklyReview: WeeklyReview;
  postingHygiene: PostingHygiene;
  resultsIntake: ResultsIntake;
  creativePerformance: CreativePerformance;
  publishQueue: PublishQueue;
  softRoiLab: SoftRoiLab;
  channelFitLab: ChannelFitLab;
  categoryFitLab: CategoryFitLab;
  priceBandFitLab: PriceBandFitLab;
  commissionBandFitLab: CommissionBandFitLab;
}> {
  const db = await readDb();
  const date = todayISO();
  const ranked = rankProducts(
    db.products,
    5,
    db.schedule,
    db.learning,
    dateFromYmd(date),
  );
  const todaySchedule = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const latestMorning = [...db.briefs]
    .filter((b) => b.type === "morning")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestEvening = [...db.briefs]
    .filter((b) => b.type === "evening")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const weekly = weeklyProductRollup(db.products, db.schedule, date, 7);
  const latestPacks = ranked.map((r) => {
    const existing = db.contentPacks
      .filter((p) => p.productId === r.product.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return existing ?? generateContentPack(r.product, { variant: 0 });
  });
  const experiment = buildExperimentPlan({
    date,
    ranked,
    packs: latestPacks,
    schedule: db.schedule,
    products: db.products,
    learning: db.learning,
  });
  const digest = buildDailyDigest(db, date);
  const tomorrowPlan = buildTomorrowPlan(db, date);
  const approveQueue = buildApproveQueue(db, date);
  const winnerPlaybook = buildWinnerPlaybook(db, date);
  const weeklyReview = buildWeeklyReview(db, date);
  const postingHygiene = buildPostingHygiene(db, date);
  const resultsIntake = buildResultsIntake(db, date);
  const creativePerformance = buildCreativePerformance(db, date);
  const publishQueue = buildPublishQueue(db, date);
  const softRoiLab = buildSoftRoiLab(db, date);
  const channelFitLab = buildChannelFitLab(db, date);
  const categoryFitLab = buildCategoryFitLab(db, date);
  const priceBandFitLab = buildPriceBandFitLab(db, date);
  const commissionBandFitLab = buildCommissionBandFitLab(db, date);
  return {
    db,
    ranked,
    todaySchedule,
    latestMorning,
    latestEvening,
    weekly,
    experiment,
    digest,
    tomorrowPlan,
    approveQueue,
    winnerPlaybook,
    weeklyReview,
    postingHygiene,
    resultsIntake,
    creativePerformance,
    publishQueue,
    softRoiLab,
    channelFitLab,
    categoryFitLab,
    priceBandFitLab,
    commissionBandFitLab,
  };
}
