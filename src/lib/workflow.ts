import { analyzeEvening } from "./analytics";
import { generateContentPack } from "./content";
import { INCOME_DISCLAIMER } from "./disclosure";
import { newId, readDb, todayISO, updateDb } from "./db";
import { rankProducts } from "./scoring";
import { buildDailyDrafts } from "./schedule";
import type { DailyBrief, Database } from "./types";

export async function runMorningWorkflow(date = todayISO()): Promise<{
  brief: DailyBrief;
  rankedCount: number;
  draftCount: number;
  db: Database;
}> {
  let brief!: DailyBrief;
  let rankedCount = 0;
  let draftCount = 0;

  const db = await updateDb((state) => {
    const ranked = rankProducts(state.products, 5);
    rankedCount = ranked.length;

    const packsByProductId = new Map<string, ReturnType<typeof generateContentPack>>();
    for (const item of ranked) {
      const existing = state.contentPacks.find(
        (p) => p.productId === item.product.id && p.createdAt.slice(0, 10) === date
      );
      if (existing) {
        packsByProductId.set(item.product.id, existing);
      } else {
        const pack = generateContentPack(item.product);
        state.contentPacks.push(pack);
        packsByProductId.set(item.product.id, pack);
      }
    }

    // Replace today's drafts only (keep approved/posted)
    state.schedule = state.schedule.filter(
      (p) => !(p.date === date && p.status === "draft")
    );
    const drafts = buildDailyDrafts(ranked, packsByProductId, date);
    state.schedule.push(...drafts);
    draftCount = drafts.length;

    const videoPriority = ranked.slice(0, 3).map((r) => {
      const pack = packsByProductId.get(r.product.id);
      return `${r.product.name}: ${pack?.videoAngleSuggestion ?? "ทำคลิปสั้นเล่า pain point"}`;
    });

    brief = {
      id: newId("brief"),
      date,
      type: "morning",
      topProductIds: ranked.map((r) => r.product.id),
      summary: [
        `เช้านี้คัด ${ranked.length} สินค้าเด่นจากคะแนนทดลอง`,
        `สร้าง draft โพสต์ ${drafts.length} ชิ้น (ยังไม่เผยแพร่ — ต้อง approve ก่อน)`,
        INCOME_DISCLAIMER,
      ].join(" · "),
      videoPriority,
      recommendations: ranked.slice(0, 3).flatMap((r) => r.reasons.slice(0, 1)),
      createdAt: new Date().toISOString(),
    };
    state.briefs = state.briefs.filter((b) => !(b.date === date && b.type === "morning"));
    state.briefs.push(brief);
  });

  return { brief, rankedCount, draftCount, db };
}

export async function runEveningWorkflow(date = todayISO()): Promise<{
  brief: DailyBrief;
  analysis: ReturnType<typeof analyzeEvening>;
  db: Database;
}> {
  const current = await readDb();
  const todaysPosts = current.schedule.filter((p) => p.date === date);
  const analysis = analyzeEvening({
    posts: todaysPosts,
    metrics: current.metrics.filter((m) => m.date === date),
    products: current.products,
    packs: current.contentPacks,
  });

  const brief: DailyBrief = {
    id: newId("brief"),
    date,
    type: "evening",
    topProductIds: analysis.winners.map((w) => w.productId),
    summary: analysis.summary,
    videoPriority: analysis.nextDayAngles,
    recommendations: analysis.recommendations,
    createdAt: new Date().toISOString(),
  };

  const db = await updateDb((state) => {
    state.briefs = state.briefs.filter((b) => !(b.date === date && b.type === "evening"));
    state.briefs.push(brief);
  });

  return { brief, analysis, db };
}
