import { analyzePosted } from "./analytics";
import { generateContentPack } from "./content";
import { newId, readDb, todayISO, updateDb } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { rankProducts } from "./scoring";
import { buildDailySchedule } from "./schedule";
import type { ContentPack, DailyBrief, Database } from "./types";

function dayNumber(date: string): number {
  const n = Number(date.replaceAll("-", ""));
  return Number.isFinite(n) ? n : 0;
}

function needsFreshPack(pack: ContentPack | undefined, date: string): boolean {
  if (!pack) return true;
  if (!pack.facebookGroupCaption) return true;
  const createdDay = pack.createdAt.slice(0, 10);
  return createdDay !== date;
}

export async function runMorningWorkflow(date = todayISO()) {
  return updateDb((db) => {
    const ranked = rankProducts(db.products, 5, db.schedule);
    const packs: ContentPack[] = [];
    const pairs: { product: (typeof ranked)[0]["product"]; pack: ContentPack }[] =
      [];

    for (const item of ranked) {
      const existing = db.contentPacks
        .filter((p) => p.productId === item.product.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      let pack = existing;
      if (needsFreshPack(existing, date)) {
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
      maxPosts: 3,
    });
    db.schedule.push(...newPosts);

    const videoFirst = pairs
      .slice()
      .sort((a, b) => b.product.videoEase - a.product.videoEase)[0];

    const recommendations = [
      ranked.length
        ? `Top โปรโมตวันนี้: ${ranked.map((r) => r.product.name).join(", ")}`
        : "ยังไม่มีสินค้า — เพิ่มสินค้าในแดชบอร์ดก่อน",
      videoFirst
        ? `ควรทำวิดีโอก่อน: ${videoFirst.product.name} — ${videoFirst.pack.videoPriorityNote}`
        : "ยังไม่มีคิววิดีโอ",
      `สร้าง draft โพสต์ ${newPosts.length} ชิ้น (ต้อง Approve ก่อนโพสต์จริง)`,
      "ห้ามโพสต์ซ้ำข้อความเดิม และต้องมี disclosure ทุกครั้ง",
      "ระบบหลีกเลี่ยง product+channel ที่เพิ่งใช้ใน 3 วันล่าสุด เพื่อลดสแปม",
    ];

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
}

export async function runEveningWorkflow(date = todayISO()) {
  return updateDb((db) => {
    const todays = db.schedule.filter((s) => s.date === date);
    const analysis = analyzePosted(todays, db.products);

    const nextFocus = rankProducts(db.products, 3, db.schedule).map(
      (r) => r.product.name,
    );

    const recommendations = [
      ...analysis.recommendations,
      nextFocus.length
        ? `สินค้าแนะนำวันถัดไป (จากคะแนน+ผลที่บันทึก): ${nextFocus.join(", ")}`
        : "เพิ่มสินค้าเพิ่มเติมเพื่อให้จัดอันดับได้แม่นขึ้น",
    ];

    const brief: DailyBrief = {
      id: newId("brief"),
      date,
      type: "evening",
      topProductIds: analysis.winners.map((w) => w.post.productId),
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
}

export async function getDashboardSnapshot(): Promise<{
  db: Database;
  ranked: ReturnType<typeof rankProducts>;
  todaySchedule: Database["schedule"];
  latestMorning?: DailyBrief;
  latestEvening?: DailyBrief;
}> {
  const db = await readDb();
  const date = todayISO();
  const ranked = rankProducts(db.products, 5, db.schedule);
  const todaySchedule = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const latestMorning = [...db.briefs]
    .filter((b) => b.type === "morning")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestEvening = [...db.briefs]
    .filter((b) => b.type === "evening")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { db, ranked, todaySchedule, latestMorning, latestEvening };
}
