/**
 * Posting Hygiene Brief — anti-spam health check from schedule + settings.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 */

import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { captionFingerprint, channelLabel } from "./schedule";
import { resolveSettings } from "./settings";
import type {
  ContentChannel,
  Database,
  Product,
  ScheduledPost,
} from "./types";

export type HygieneGrade = "A" | "B" | "C" | "D";

export interface HygieneCooldownRow {
  productId: string;
  productName: string;
  channel: ContentChannel;
  channelLabel: string;
  lastDate: string;
  daysAgo: number;
  daysLeft: number;
  tip: string;
}

export interface HygieneDuplicateCluster {
  fingerprint: string;
  count: number;
  sampleCaption: string;
  dates: string[];
  productNames: string[];
  tip: string;
}

export interface HygieneChannelMixRow {
  channel: ContentChannel;
  label: string;
  posts: number;
  share: number;
  tip: string;
}

export interface HygieneAction {
  id: string;
  title: string;
  detail: string;
}

export interface PostingHygiene {
  date: string;
  fromDate: string;
  windowDays: number;
  grade: HygieneGrade;
  score: number;
  summary: string;
  cooldownDays: number;
  maxPostsPerDay: number;
  staleDraftDays: number;
  todayActive: number;
  todayRoomLeft: number;
  staleDraftCount: number;
  coolingPairs: HygieneCooldownRow[];
  hotProducts: Array<{
    productId: string;
    productName: string;
    recentPosts: number;
    tip: string;
  }>;
  channelMix: HygieneChannelMixRow[];
  nearDuplicates: HygieneDuplicateCluster[];
  doNotPost: string[];
  actions: HygieneAction[];
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

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function productName(products: Product[], id: string): string {
  return products.find((p) => p.id === id)?.name ?? id;
}

function activePosts(schedule: ScheduledPost[]): ScheduledPost[] {
  return schedule.filter((s) => s.status !== "skipped");
}

function gradeFromScore(score: number): HygieneGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * Build anti-spam / posting hygiene brief for a calendar day (Asia/Bangkok YMD).
 */
export function buildPostingHygiene(
  db: Database,
  date: string,
  windowDays = 7,
): PostingHygiene {
  const settings = resolveSettings(db);
  const window = Math.max(3, Math.min(14, windowDays));
  const fromDate = ymdOffset(date, -(window - 1));
  const cooldownDays = settings.cooldownDays;
  const maxPosts = settings.maxPostsPerDay;
  const staleDraftDays = settings.staleDraftDays;

  const inWindow = activePosts(db.schedule).filter(
    (s) => s.date >= fromDate && s.date <= date,
  );
  const todayActive = activePosts(db.schedule).filter((s) => s.date === date);
  const todayRoomLeft = Math.max(0, maxPosts - todayActive.length);

  const staleDraftCount = db.schedule.filter((s) => {
    if (s.status !== "draft") return false;
    return daysBetween(s.date, date) > staleDraftDays;
  }).length;

  // Cooldown pairs still "hot" relative to today
  const lastByPair = new Map<string, ScheduledPost>();
  for (const s of activePosts(db.schedule)) {
    if (s.date > date) continue;
    const gap = daysBetween(s.date, date);
    if (gap < 0 || gap > cooldownDays) continue;
    const key = `${s.productId}:${s.channel}`;
    const prev = lastByPair.get(key);
    if (!prev || s.date > prev.date) lastByPair.set(key, s);
  }

  const coolingPairs: HygieneCooldownRow[] = [];
  for (const [, post] of lastByPair) {
    const gap = daysBetween(post.date, date);
    // schedule anti-spam blocks when gap <= cooldownDays
    if (gap < 0 || gap > cooldownDays) continue;
    const daysLeft = cooldownDays - gap + 1;
    coolingPairs.push({
      productId: post.productId,
      productName: productName(db.products, post.productId),
      channel: post.channel,
      channelLabel: channelLabel(post.channel),
      lastDate: post.date,
      daysAgo: gap,
      daysLeft,
      tip:
        gap === 0
          ? "ใช้คิววันนี้แล้ว — อย่าอนุมัติซ้ำช่องทางเดิม"
          : `พักอีก ~${daysLeft} วันก่อนหมุน ${channelLabel(post.channel)} คู่เดิม`,
    });
  }
  coolingPairs.sort(
    (a, b) => b.daysLeft - a.daysLeft || a.productName.localeCompare(b.productName, "th"),
  );

  // Hot products: many active slots in cooldown window
  const byProduct = new Map<string, number>();
  const cooldownFrom = ymdOffset(date, -(cooldownDays - 1));
  for (const s of activePosts(db.schedule)) {
    if (s.date < cooldownFrom || s.date > date) continue;
    byProduct.set(s.productId, (byProduct.get(s.productId) ?? 0) + 1);
  }
  const hotProducts = [...byProduct.entries()]
    .filter(([, n]) => n >= 3)
    .map(([productId, recentPosts]) => ({
      productId,
      productName: productName(db.products, productId),
      recentPosts,
      tip: `ถูกจัดคิว/โพสต์ ${recentPosts} ครั้งใน ${cooldownDays} วัน — หมุนสินค้าอื่นก่อน (กันสแปม)`,
    }))
    .sort((a, b) => b.recentPosts - a.recentPosts)
    .slice(0, 5);

  // Channel mix in window
  const channelCounts = new Map<ContentChannel, number>();
  for (const s of inWindow) {
    channelCounts.set(s.channel, (channelCounts.get(s.channel) ?? 0) + 1);
  }
  const mixTotal = inWindow.length || 1;
  const channelMix: HygieneChannelMixRow[] = (
    [
      "tiktok",
      "facebook_reels",
      "facebook_post",
      "facebook_group",
    ] as ContentChannel[]
  )
    .map((channel) => {
      const posts = channelCounts.get(channel) ?? 0;
      const share = posts / mixTotal;
      let tip = "กระจายพอใช้";
      if (inWindow.length === 0) tip = "ยังไม่มีโพสต์ในหน้าต่าง";
      else if (share >= 0.55) tip = "หนาแน่นเกินไป — สลับช่องทางอื่น";
      else if (posts === 0) tip = "ยังว่าง — เหมาะสำหรับทดลองกระจาย";
      return {
        channel,
        label: channelLabel(channel),
        posts,
        share,
        tip,
      };
    });

  // Near-duplicate captions (same fingerprint, 2+)
  const fpMap = new Map<
    string,
    { count: number; sample: string; dates: Set<string>; names: Set<string> }
  >();
  for (const s of inWindow) {
    const fp = captionFingerprint(s.captionPreview || "");
    if (!fp || fp.length < 24) continue;
    const cur = fpMap.get(fp) ?? {
      count: 0,
      sample: s.captionPreview.slice(0, 120),
      dates: new Set<string>(),
      names: new Set<string>(),
    };
    cur.count += 1;
    cur.dates.add(s.date);
    cur.names.add(productName(db.products, s.productId));
    fpMap.set(fp, cur);
  }
  const nearDuplicates: HygieneDuplicateCluster[] = [...fpMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([fingerprint, v]) => ({
      fingerprint,
      count: v.count,
      sampleCaption: v.sample,
      dates: [...v.dates].sort(),
      productNames: [...v.names],
      tip: "แคปชันคล้ายกัน — กดสร้างแคปชันใหม่หรือเปลี่ยน hook/มุมขายก่อน Approve",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const doNotPost: string[] = [];
  for (const h of hotProducts.slice(0, 3)) {
    doNotPost.push(`${h.productName}: ลดความถี่ — ${h.tip}`);
  }
  for (const d of nearDuplicates.slice(0, 2)) {
    doNotPost.push(
      `แคปชันซ้ำ (${d.count} ชิ้น · ${d.productNames.join(", ")}): อย่า Approve จนกว่าจะ regenerate`,
    );
  }
  if (todayRoomLeft === 0 && todayActive.length >= maxPosts) {
    doNotPost.push(
      `คิววันนี้เต็มแล้ว (${todayActive.length}/${maxPosts}) — อย่า force Morning เพื่อเพิ่ม draft`,
    );
  }
  if (doNotPost.length === 0) {
    doNotPost.push("ยังไม่พบสัญญาณสแปมชัด — คงคุณภาพ + disclosure ทุกชิ้น");
  }

  // Score: start 100, soft penalties
  let score = 100;
  score -= Math.min(30, hotProducts.length * 10);
  score -= Math.min(25, nearDuplicates.length * 12);
  if (todayActive.length > maxPosts) score -= 20;
  else if (todayRoomLeft === 0 && todayActive.length >= maxPosts) score -= 5;
  score -= Math.min(15, staleDraftCount * 5);
  const dominant = channelMix.reduce(
    (best, row) => (row.share > best.share ? row : best),
    channelMix[0] ?? { share: 0, label: "", posts: 0, tip: "", channel: "tiktok" as ContentChannel },
  );
  if (dominant.share >= 0.55 && inWindow.length >= 3) score -= 10;
  if (coolingPairs.length >= maxPosts * 2) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);

  const actions: HygieneAction[] = [];
  if (hotProducts.length) {
    actions.push({
      id: "rotate-hot",
      title: "หมุนสินค้าที่ถูกใช้บ่อย",
      detail: hotProducts
        .slice(0, 2)
        .map((h) => h.productName)
        .join(", "),
    });
  }
  if (nearDuplicates.length) {
    actions.push({
      id: "regen-dupes",
      title: "สร้างแคปชันใหม่ให้ชิ้นที่คล้ายกัน",
      detail: "ใช้ปุ่ม regenerate บนตารางโพสต์ — ยังเป็น draft ต้อง Approve",
    });
  }
  if (staleDraftCount > 0) {
    actions.push({
      id: "expire-stale",
      title: "เคลียร์ draft ค้าง",
      detail: `มี ${staleDraftCount} draft เก่ากว่า ${staleDraftDays} วัน — Morning จะข้ามให้อัตโนมัติ`,
    });
  }
  if (dominant.share >= 0.55 && inWindow.length >= 3) {
    actions.push({
      id: "mix-channels",
      title: "กระจายช่องทาง",
      detail: `${dominant.label} หนาแน่น (~${Math.round(dominant.share * 100)}%) — สลับ Reels/Group/Page`,
    });
  }
  if (todayRoomLeft > 0) {
    actions.push({
      id: "fill-quality",
      title: "เติมคิวอย่างมีคุณภาพ",
      detail: `เหลือที่ว่าง ${todayRoomLeft}/${maxPosts} — รัน Morning แล้ว Approve เฉพาะชิ้นที่ผ่าน disclosure`,
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "keep-clean",
      title: "รักษาสุขอนามัย",
      detail: "คูลดาวน์โอเค · ไม่มีแคปชันซ้ำชัด — Approve ทีละชิ้นหลังตรวจ disclosure",
    });
  }

  const checklist = [
    "ตรวจ disclosure ทุก caption ก่อน Approve",
    "ไม่ Approve ชิ้นที่แคปชันคล้ายกันในหน้าต่างล่าสุด",
    `เคารพคูลดาวน์ product+channel ${cooldownDays} วัน`,
    `ไม่เกิน ${maxPosts} โพสต์คุณภาพ/วัน`,
    "ห้ามโพสต์อัตโนมัติ — Approve แล้วคัดลอกไปโพสต์ด้วยมือ",
  ];

  const summary =
    grade === "A" || grade === "B"
      ? `สุขอนามัยการโพสต์เกรด ${grade} (${score}/100) — คิวค่อนข้างสะอาด ยังต้อง Approve เอง`
      : `สุขอนามัยการโพสต์เกรด ${grade} (${score}/100) — พบสัญญาณซ้ำ/คิวหนา แนะนำหมุนก่อน Approve`;

  const lines = [
    `Posting Hygiene · ${date}: เกรด ${grade} (${score}/100)`,
    summary,
    `คิววันนี้ ${todayActive.length}/${maxPosts} · เหลือที่ว่าง ${todayRoomLeft} · draft ค้าง ${staleDraftCount}`,
    coolingPairs.length
      ? `คู่ที่ยังคูลดาวน์: ${coolingPairs
          .slice(0, 3)
          .map((c) => `${c.productName}/${c.channelLabel}`)
          .join(", ")}`
      : "ยังไม่มีคู่ product+channel ในคูลดาวน์",
    hotProducts.length
      ? `สินค้าใช้บ่อย: ${hotProducts.map((h) => h.productName).join(", ")}`
      : null,
    nearDuplicates.length
      ? `แคปชันใกล้ซ้ำ ${nearDuplicates.length} กลุ่ม — regenerate ก่อน Approve`
      : "ไม่พบแคปชันใกล้ซ้ำในหน้าต่าง",
    actions[0] ? `ทำก่อน: ${actions[0].title} — ${actions[0].detail}` : null,
    "ไม่โพสต์อัตโนมัติ · ไม่การันตีรายได้ · ทดลองจากข้อมูลจริง",
  ].filter(Boolean) as string[];

  return {
    date,
    fromDate,
    windowDays: window,
    grade,
    score,
    summary,
    cooldownDays,
    maxPostsPerDay: maxPosts,
    staleDraftDays,
    todayActive: todayActive.length,
    todayRoomLeft,
    staleDraftCount,
    coolingPairs: coolingPairs.slice(0, 8),
    hotProducts,
    channelMix,
    nearDuplicates,
    doNotPost: doNotPost.slice(0, 6),
    actions: actions.slice(0, 5),
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function postingHygieneLines(
  hygiene: PostingHygiene,
  limit = 6,
): string[] {
  return hygiene.lines.slice(0, limit);
}

export function postingHygieneToMarkdown(hygiene: PostingHygiene): string {
  const cooling =
    hygiene.coolingPairs.length === 0
      ? "- ไม่มีคู่ในคูลดาวน์"
      : hygiene.coolingPairs
          .map(
            (c) =>
              `- **${c.productName}** · ${c.channelLabel} · ล่าสุด ${c.lastDate} (${c.daysAgo} วันก่อน) — ${c.tip}`,
          )
          .join("\n");
  const hot =
    hygiene.hotProducts.length === 0
      ? "- ยังไม่มีสินค้าใช้บ่อยผิดปกติ"
      : hygiene.hotProducts
          .map(
            (h, i) =>
              `${i + 1}. **${h.productName}** · ${h.recentPosts} ครั้ง — ${h.tip}`,
          )
          .join("\n");
  const mix = hygiene.channelMix
    .map(
      (c) =>
        `- **${c.label}** · n=${c.posts} · ~${Math.round(c.share * 100)}% — ${c.tip}`,
    )
    .join("\n");
  const dupes =
    hygiene.nearDuplicates.length === 0
      ? "- ไม่พบแคปชันใกล้ซ้ำ"
      : hygiene.nearDuplicates
          .map(
            (d, i) =>
              `${i + 1}. ×${d.count} · ${d.productNames.join(", ")} · วัน ${d.dates.join(", ")} — ${d.tip}\n   > ${d.sampleCaption.replace(/\n/g, " ")}`,
          )
          .join("\n");
  const avoid = hygiene.doNotPost.map((d) => `- ${d}`).join("\n");
  const actions = hygiene.actions
    .map((a, i) => `${i + 1}. **${a.title}** — ${a.detail}`)
    .join("\n");
  const checklist = hygiene.checklist.map((c) => `- [ ] ${c}`).join("\n");

  return (
    `# Posting Hygiene · ${hygiene.date}\n\n` +
    `เกรด **${hygiene.grade}** (${hygiene.score}/100)\n\n` +
    `${hygiene.summary}\n\n` +
    `หน้าต่าง: ${hygiene.fromDate} → ${hygiene.date} (${hygiene.windowDays} วัน)\n` +
    `คูลดาวน์ ${hygiene.cooldownDays} วัน · เป้า ${hygiene.maxPostsPerDay}/วัน · stale ${hygiene.staleDraftDays} วัน\n\n` +
    `## คิววันนี้\n` +
    `- ใช้งานแล้ว: ${hygiene.todayActive}/${hygiene.maxPostsPerDay}\n` +
    `- เหลือที่ว่าง: ${hygiene.todayRoomLeft}\n` +
    `- draft ค้าง (เก่าเกิน stale): ${hygiene.staleDraftCount}\n\n` +
    `## คู่ที่ยังคูลดาวน์\n${cooling}\n\n` +
    `## สินค้าใช้บ่อย\n${hot}\n\n` +
    `## สัดส่วนช่องทาง\n${mix}\n\n` +
    `## แคปชันใกล้ซ้ำ\n${dupes}\n\n` +
    `## อย่าโพสต์ / ชะลอ\n${avoid}\n\n` +
    `## ทำก่อน\n${actions}\n\n` +
    `## Checklist\n${checklist}\n\n` +
    `${hygiene.disclaimer}\n` +
    `> ไม่โพสต์อัตโนมัติ — ต้อง Approve แล้วโพสต์ด้วยมือ\n`
  );
}
