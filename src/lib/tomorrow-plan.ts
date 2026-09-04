/**
 * Tomorrow Plan — evening counterpart to Daily Action Digest.
 * Turns today's metrics + ranking into an actionable Thai plan for the next day.
 * Never auto-publishes; never claims guaranteed income.
 */

import { analyzePosted } from "./analytics";
import { generateContentPack } from "./content";
import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { buildFilmingQueue } from "./filming";
import { channelLabel } from "./schedule";
import { rankProducts } from "./scoring";
import { resolveSettings } from "./settings";
import type {
  ContentChannel,
  ContentPack,
  Database,
  Product,
  ScheduledPost,
} from "./types";

export interface TomorrowPick {
  productId: string;
  productName: string;
  platform: Product["platform"];
  reason: string;
  suggestedAngle: string;
  suggestedHook: string;
  filmFirst: boolean;
  recentPostCount: number;
}

export interface TomorrowChannelTip {
  channel: ContentChannel;
  label: string;
  tip: string;
}

export interface TomorrowPlan {
  date: string;
  tomorrowDate: string;
  summary: string;
  picks: TomorrowPick[];
  channelTips: TomorrowChannelTip[];
  fatigueWarnings: string[];
  filmingOrder: string[];
  checklist: string[];
  lines: string[];
  disclaimer: string;
}

function ymdOffset(date: string, days: number): string {
  const d = dateFromYmd(date);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function recentActivePosts(
  schedule: ScheduledPost[],
  productId: string,
  fromDate: string,
  toDate: string,
): ScheduledPost[] {
  return schedule.filter(
    (s) =>
      s.productId === productId &&
      s.date >= fromDate &&
      s.date <= toDate &&
      (s.status === "posted" || s.status === "approved" || s.status === "draft"),
  );
}

function latestPack(db: Database, productId: string): ContentPack {
  const existing = db.contentPacks
    .filter((p) => p.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (existing) return existing;
  const product = db.products.find((p) => p.id === productId);
  return generateContentPack(
    product ?? {
      id: productId,
      name: productId,
      platform: "shopee",
      affiliateUrl: "",
      price: 0,
      commissionRate: 0,
      category: "",
      sellingPoints: [],
      painPoints: [],
      targetAudience: "",
      videoEase: 3,
      seasonalScore: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { variant: 0 },
  );
}

function preferredChannels(db: Database): ContentChannel[] {
  const preferred = db.learning?.preferredChannel;
  const base: ContentChannel[] = [
    "tiktok",
    "facebook_reels",
    "facebook_post",
    "facebook_group",
  ];
  if (preferred && base.includes(preferred)) {
    return [preferred, ...base.filter((c) => c !== preferred)];
  }
  return base;
}

/**
 * Build an actionable plan for the calendar day after `date` (Bangkok YMD).
 */
export function buildTomorrowPlan(db: Database, date: string): TomorrowPlan {
  const tomorrowDate = ymdOffset(date, 1);
  const settings = resolveSettings(db);
  const windowStart = ymdOffset(date, -(settings.cooldownDays - 1));
  const analysis = analyzePosted(
    db.schedule.filter((s) => s.date === date || Boolean(s.metrics)),
    db.products,
  );

  const ranked = rankProducts(
    db.products,
    8,
    db.schedule,
    db.learning,
    dateFromYmd(tomorrowDate),
  );

  const fatigueWarnings: string[] = [];
  const fatiguedIds = new Set<string>();
  for (const product of db.products) {
    if (product.active === false) continue;
    const recent = recentActivePosts(
      db.schedule,
      product.id,
      windowStart,
      date,
    );
    if (recent.length >= 3) {
      fatiguedIds.add(product.id);
      fatigueWarnings.push(
        `${product.name}: ถูกจัดคิว/โพสต์ ${recent.length} ครั้งใน ${settings.cooldownDays} วัน — แนะนำพักหมุนของชิ้นอื่น (กันสแปม)`,
      );
    }
  }

  const winnerIds = new Set(
    (db.learning?.winnerProductIds ?? []).concat(
      analysis.winners.map((w) => w.post.productId),
    ),
  );
  const underIds = new Set(db.learning?.underperformerProductIds ?? []);

  const picks: TomorrowPick[] = [];
  for (const row of ranked) {
    if (picks.length >= 3) break;
    const { product } = row;
    if (fatiguedIds.has(product.id) && picks.length > 0) continue;

    const recent = recentActivePosts(
      db.schedule,
      product.id,
      windowStart,
      date,
    );
    const pack = latestPack(db, product.id);
    const hookIdx = db.learning?.preferredHookIndex ?? 0;
    const angle =
      pack.sellingAngles[hookIdx % Math.max(pack.sellingAngles.length, 1)] ??
      product.sellingPoints[0] ??
      "ช่วยเปรียบเทียบสเปกให้เลือกของที่เหมาะ";
    const hook =
      pack.hooks[hookIdx % Math.max(pack.hooks.length, 1)] ??
      pack.hooks[0] ??
      `เคยเจอไหม… ${product.painPoints[0] || "ปัญหาจุกจิก"}`;

    const reasons: string[] = [];
    if (winnerIds.has(product.id)) {
      reasons.push("มีสัญญาณผลดีในข้อมูลที่กรอก (ทดลอง)");
    }
    if (underIds.has(product.id)) {
      reasons.push("คะแนนอ่อนก่อนหน้า — ลองมุมใหม่ ไม่ใช่ห้ามถาวร");
    }
    if (product.videoEase >= 4) reasons.push("ถ่ายคลิปสั้นง่าย");
    if (product.price > 0 && product.price <= 499) {
      reasons.push("ราคาใกล้ impulse buy");
    }
    if (product.painPoints.length > 0) reasons.push("pain point ชัด");
    if (fatiguedIds.has(product.id)) {
      reasons.push("ใกล้ล้า — ใช้มุมใหม่หรือพักถ้ามีตัวเลือกอื่น");
    }
    if (reasons.length === 0) {
      reasons.push(`คะแนนจัดอันดับ ${row.score.total.toFixed(0)}`);
    }

    picks.push({
      productId: product.id,
      productName: product.name,
      platform: product.platform,
      reason: reasons.join(" · "),
      suggestedAngle: angle,
      suggestedHook: hook,
      filmFirst: picks.length === 0,
      recentPostCount: recent.length,
    });
  }

  const channelTips: TomorrowChannelTip[] = preferredChannels(db)
    .slice(0, 3)
    .map((channel, i) => {
      const label = channelLabel(channel);
      if (i === 0 && db.learning?.preferredChannel === channel) {
        return {
          channel,
          label,
          tip: "ช่องทางที่คะแนนเฉลี่ยดีกว่าในชุดข้อมูลล่าสุด — ทดลองต่อได้ แต่ยังต้อง Approve ก่อนโพสต์",
        };
      }
      if (channel === "tiktok") {
        return {
          channel,
          label,
          tip: "คลิป 15–30 วินาที โชว์ของจริง + เปิดด้วย hook แล้วปิดด้วย disclosure",
        };
      }
      if (channel === "facebook_reels") {
        return {
          channel,
          label,
          tip: "แนวช่วยเลือกของ สั้น กระชับ ไม่ขายแข็ง",
        };
      }
      if (channel === "facebook_group") {
        return {
          channel,
          label,
          tip: "โทนชุมชน แชร์ประสบการณ์ — ห้ามสแปมลิงก์ซ้ำในกลุ่มเดิม",
        };
      }
      return {
        channel,
        label,
        tip: "แคปชันยาวขึ้นได้เล็กน้อย แต่ต้องมี disclosure ทุกครั้ง",
      };
    });

  const packsForFilm = picks.map((p) => latestPack(db, p.productId));
  const rankedForFilm = ranked.filter((r) =>
    picks.some((p) => p.productId === r.product.id),
  );
  const filmQueue = buildFilmingQueue(
    rankedForFilm,
    packsForFilm,
    db.schedule,
    tomorrowDate,
  );
  const filmingOrder = filmQueue.map(
    (item, i) =>
      `${i + 1}. ${item.productName} — ${item.reason}${
        item.sellingAngle ? ` · มุม: ${item.sellingAngle}` : ""
      }`,
  );

  const missingMetrics = db.schedule.filter((s) => {
    if (s.status !== "posted") return false;
    if (s.date !== date && s.date !== ymdOffset(date, -1)) return false;
    const m = s.metrics;
    if (!m) return true;
    return (
      (m.views ?? 0) === 0 &&
      (m.clicks ?? 0) === 0 &&
      (m.orders ?? 0) === 0 &&
      (m.commissionEarned ?? 0) === 0 &&
      !m.notes
    );
  });

  const checklist: string[] = [];
  if (missingMetrics.length) {
    checklist.push(
      `กรอกผลโพสต์ที่ยังว่าง ${missingMetrics.length} ชิ้นก่อนนอน — learning วันถัดไปจะแม่นกว่า`,
    );
  }
  if (picks.length) {
    checklist.push(
      `เตรียมถ่าย/ตัดคลิปสำหรับ: ${picks.map((p) => p.productName).join(", ")}`,
    );
    checklist.push(
      `เช้าวันถัดไปรัน Morning (หรือกดที่ /automation) เพื่อสร้าง draft ใหม่ — ยังไม่โพสต์จริง`,
    );
  } else {
    checklist.push("เพิ่มสินค้า affiliate อย่างน้อย 1 ชิ้นก่อนรัน Morning");
  }
  checklist.push(
    `เป้าโพสต์วันถัดไปไม่เกิน ${settings.maxPostsPerDay} ชิ้น · คูลดาวน์ product+channel ${settings.cooldownDays} วัน`,
  );
  checklist.push(
    "ตรวจ disclosure + ไม่ใช้คำโฆษณาเกินจริง ก่อนกด Approve ทุกชิ้น",
  );
  if (fatigueWarnings.length) {
    checklist.push("มีสินค้าใกล้ล้า — หมุนหมวด/มุมขาย อย่าโพสต์ซ้ำไร้คุณภาพ");
  }

  const summary = picks.length
    ? `แผน ${tomorrowDate}: โฟกัส ${picks.length} สินค้า · ถ่ายก่อน ${picks[0].productName}`
    : `แผน ${tomorrowDate}: ยังไม่มีสินค้าพอจัดแผน — เพิ่มของแล้วรัน Morning`;

  const lines = [
    `Tomorrow Plan ${date} → ${tomorrowDate}: ${summary}`,
    ...picks.map(
      (p, i) =>
        `${i + 1}. ${p.productName} (${p.platform}) — ${p.reason} · hook: ${p.suggestedHook}`,
    ),
    ...fatigueWarnings.map((w) => `พักหมุน: ${w}`),
    ...channelTips.map((c) => `ช่องทาง ${c.label}: ${c.tip}`),
    ...filmingOrder.map((f) => `ถ่าย: ${f}`),
    ...checklist.map((c) => `เช็ค: ${c}`),
    INCOME_DISCLAIMER,
  ];

  return {
    date,
    tomorrowDate,
    summary,
    picks,
    channelTips,
    fatigueWarnings,
    filmingOrder,
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function tomorrowPlanLines(plan: TomorrowPlan, limit = 8): string[] {
  return plan.lines.slice(0, limit);
}

export function tomorrowPlanToMarkdown(plan: TomorrowPlan): string {
  const lines: string[] = [
    `# Tomorrow Plan · ${plan.tomorrowDate}`,
    "",
    `> สร้างจากข้อมูลเย็นวันที่ ${plan.date} — เป็นแผนทดลอง ไม่การันตีรายได้ และไม่โพสต์อัตโนมัติ`,
    "",
    plan.summary,
    "",
    "## สินค้าที่ควรโฟกัส",
  ];

  if (!plan.picks.length) {
    lines.push("- (ยังไม่มีสินค้า) เพิ่ม affiliate product ก่อน");
  } else {
    for (const [i, p] of plan.picks.entries()) {
      lines.push(
        `### ${i + 1}. ${p.productName}`,
        `- แพลตฟอร์ม: ${p.platform}`,
        `- เหตุผล: ${p.reason}`,
        `- มุมขายแนะนำ: ${p.suggestedAngle}`,
        `- Hook แนะนำ: ${p.suggestedHook}`,
        `- คิว/โพสต์ล่าสุดในหน้าต่างคูลดาวน์: ${p.recentPostCount}`,
        p.filmFirst ? "- **ถ่ายก่อน**" : "",
        "",
      );
    }
  }

  lines.push("## ช่องทางแนะนำ", "");
  for (const c of plan.channelTips) {
    lines.push(`- **${c.label}**: ${c.tip}`);
  }

  if (plan.fatigueWarnings.length) {
    lines.push("", "## กันสแปม / สินค้าใกล้ล้า", "");
    for (const w of plan.fatigueWarnings) lines.push(`- ${w}`);
  }

  if (plan.filmingOrder.length) {
    lines.push("", "## ลำดับถ่ายคลิป", "");
    for (const f of plan.filmingOrder) lines.push(`- ${f}`);
  }

  lines.push("", "## Checklist ก่อนนอน / เช้าวันถัดไป", "");
  for (const c of plan.checklist) lines.push(`- [ ] ${c}`);

  lines.push(
    "",
    "## กฎที่ต้องจำ",
    "- สร้างได้แค่ draft — ต้อง Approve แล้วโพสต์ด้วยมือ",
    "- ทุกโพสต์ต้องมี disclosure affiliate",
    `- ${plan.disclaimer}`,
    "",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}
