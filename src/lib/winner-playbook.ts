/**
 * Winner Playbook — turn posted metrics into a Thai keep/stop/try guide.
 * Soft experimental insights only; never auto-publishes or claims guaranteed income.
 */

import { analyzePosted } from "./analytics";
import { dateFromYmd } from "./db";
import { INCOME_DISCLAIMER } from "./disclosure";
import { buildPauseSuggestions } from "./pause-suggestions";
import { channelLabel } from "./schedule";
import type {
  ContentChannel,
  Database,
  Product,
  ScheduledPost,
} from "./types";
import { weeklyProductRollup } from "./weekly";

export interface PlaybookWinner {
  productId: string;
  productName: string;
  why: string;
  sampleSize: number;
  commission: number;
  orders: number;
  avgCtr: number;
}

export interface PlaybookStop {
  productId: string;
  productName: string;
  why: string;
}

export interface PlaybookChannelTip {
  channel: ContentChannel;
  label: string;
  tip: string;
}

export interface PlaybookExperiment {
  title: string;
  detail: string;
}

export interface WinnerPlaybook {
  date: string;
  windowDays: number;
  samplePosts: number;
  summary: string;
  keepDoing: PlaybookWinner[];
  stopOrPause: PlaybookStop[];
  channelTips: PlaybookChannelTip[];
  hookTips: string[];
  ctaTips: string[];
  timeTips: string[];
  experiments: PlaybookExperiment[];
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

function postsInWindow(
  schedule: ScheduledPost[],
  date: string,
  windowDays: number,
): ScheduledPost[] {
  const from = ymdOffset(date, -(windowDays - 1));
  return schedule.filter(
    (s) =>
      s.date >= from &&
      s.date <= date &&
      (s.status === "posted" || s.metrics != null) &&
      s.metrics != null,
  );
}

function avgIndexInsight(
  posts: ScheduledPost[],
  kind: "hook" | "cta",
): string | null {
  if (posts.length < 2) return null;
  const buckets = new Map<number, { n: number; score: number }>();
  const analysis = analyzePosted(posts, []);
  const byId = new Map(analysis.performances.map((p) => [p.post.id, p.score]));
  for (const post of posts) {
    const idx = kind === "hook" ? post.hookIndex : post.ctaIndex;
    const score = byId.get(post.id) ?? 0;
    const cur = buckets.get(idx) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += score;
    buckets.set(idx, cur);
  }
  if (buckets.size < 2) return null;
  const ranked = [...buckets.entries()].sort(
    (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
  );
  const [bestIdx, best] = ranked[0];
  const label = kind === "hook" ? "hook" : "CTA";
  return `ในหน้าต่างนี้ ${label} #${bestIdx + 1} คะแนนเฉลี่ยดีกว่า (n=${best.n}) — ใช้เป็นสมมติฐานทดสอบ ไม่ใช่การันตี`;
}

/**
 * Build a keep/stop/try playbook from recent posted metrics + learning.
 */
export function buildWinnerPlaybook(
  db: Database,
  date: string,
  windowDays = 14,
): WinnerPlaybook {
  const window = Math.max(7, Math.min(30, windowDays));
  const posts = postsInWindow(db.schedule, date, window);
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const analysis = analyzePosted(posts, db.products);
  const weekly = weeklyProductRollup(db.products, db.schedule, date, 7);
  const pauses = buildPauseSuggestions({
    products: db.products,
    schedule: db.schedule,
    learning: db.learning,
  });

  const keepDoing: PlaybookWinner[] = [];
  for (const row of weekly.slice(0, 3)) {
    if (row.posts < 1) continue;
    const parts = [
      `โพสต์ ${row.posts} ชิ้นใน 7 วัน`,
      row.orders > 0 ? `ออเดอร์ ${row.orders}` : "ยังไม่มีออเดอร์",
      `ค่าคอมที่กรอก ฿${row.commission.toLocaleString("th-TH")}`,
      `CTR เฉลี่ย ~${(row.avgCtr * 100).toFixed(1)}%`,
    ];
    keepDoing.push({
      productId: row.productId,
      productName: row.productName,
      why: parts.join(" · "),
      sampleSize: row.posts,
      commission: row.commission,
      orders: row.orders,
      avgCtr: row.avgCtr,
    });
  }

  // Also surface learning winners not already in weekly top
  for (const id of db.learning?.winnerProductIds ?? []) {
    if (keepDoing.some((k) => k.productId === id)) continue;
    const product = byId.get(id);
    if (!product || product.active === false) continue;
    const related = analysis.performances.filter((p) => p.post.productId === id);
    if (related.length === 0) continue;
    keepDoing.push({
      productId: id,
      productName: product.name,
      why: `Learning เย็นล่าสุดจัดเป็น winner (n=${related.length}) — ทดลองต่อด้วย hook ใหม่`,
      sampleSize: related.length,
      commission: related.reduce((n, p) => n + p.commission, 0),
      orders: related.reduce(
        (n, p) => n + (p.post.metrics?.orders ?? 0),
        0,
      ),
      avgCtr:
        related.reduce((n, p) => n + p.ctr, 0) / Math.max(related.length, 1),
    });
    if (keepDoing.length >= 4) break;
  }

  const stopOrPause: PlaybookStop[] = pauses.map((p) => ({
    productId: p.productId,
    productName: p.productName,
    why: p.reason,
  }));

  // Vanity / underperformers not already listed
  for (const id of [
    ...(db.learning?.vanityProductIds ?? []),
    ...(db.learning?.underperformerProductIds ?? []),
  ]) {
    if (stopOrPause.some((s) => s.productId === id)) continue;
    const product = byId.get(id);
    if (!product || product.active === false) continue;
    const vanity = db.learning?.vanityProductIds?.includes(id);
    stopOrPause.push({
      productId: id,
      productName: product.name,
      why: vanity
        ? "วิวสูงแต่ยังไม่แปลง — พักหรือเปลี่ยนมุมขายก่อนสแปมซ้ำ"
        : "คะแนนอ่อนใน Learning — ลดความถี่หรือเปลี่ยน pain point",
    });
  }

  const channelTips: PlaybookChannelTip[] = [];
  const byChannel = new Map<ContentChannel, { n: number; score: number }>();
  for (const p of analysis.performances) {
    const cur = byChannel.get(p.post.channel) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    byChannel.set(p.post.channel, cur);
  }
  const rankedChannels = [...byChannel.entries()].sort(
    (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
  );
  if (rankedChannels.length > 0) {
    const [bestCh, best] = rankedChannels[0];
    channelTips.push({
      channel: bestCh,
      label: channelLabel(bestCh),
      tip: `คะแนนเฉลี่ยดีกว่าในชุดข้อมูลนี้ (n=${best.n}) — ลองจัดสล็อตคุณภาพที่ ${channelLabel(bestCh)} ก่อน`,
    });
    if (rankedChannels.length > 1) {
      const [weakCh, weak] = rankedChannels[rankedChannels.length - 1];
      if (weakCh !== bestCh) {
        channelTips.push({
          channel: weakCh,
          label: channelLabel(weakCh),
          tip: `อ่อนกว่าช่องอื่น (n=${weak.n}) — อย่าถี่ขึ้น ให้ปรับ hook/CTA ก่อนเพิ่มรอบ`,
        });
      }
    }
  } else if (db.learning?.preferredChannel) {
    channelTips.push({
      channel: db.learning.preferredChannel,
      label: channelLabel(db.learning.preferredChannel),
      tip: "จาก Learning เย็นล่าสุด — ใช้เป็น bias อ่อน ๆ ไม่การันตี",
    });
  }

  const hookTips: string[] = [];
  const ctaTips: string[] = [];
  const hookInsight = avgIndexInsight(posts, "hook");
  const ctaInsight = avgIndexInsight(posts, "cta");
  if (hookInsight) hookTips.push(hookInsight);
  if (db.learning?.preferredHookIndex != null) {
    hookTips.push(
      `Learning แนะนำทดลอง hook #${db.learning.preferredHookIndex + 1} ต่อ (soft bias)`,
    );
  }
  if (hookTips.length === 0) {
    hookTips.push(
      "ยังไม่พอข้อมูลเปรียบเทียบ hook — อนุมัติ draft แล้วลองคนละ hook 1–2 ชิ้น",
    );
  }
  if (ctaInsight) ctaTips.push(ctaInsight);
  if (db.learning?.preferredCtaIndex != null) {
    ctaTips.push(
      `Learning แนะนำทดลอง CTA #${db.learning.preferredCtaIndex + 1} ต่อ (soft bias)`,
    );
  }
  if (ctaTips.length === 0) {
    ctaTips.push(
      "ยังไม่พอข้อมูล CTA — ใช้ CTA อ่อนโยน + disclosure ทุกครั้ง",
    );
  }

  const timeTips: string[] = [];
  if (db.learning?.preferredTime) {
    timeTips.push(
      `ช่วงเวลาที่คะแนนดีกว่าใน Learning: ${db.learning.preferredTime} — ทดลองไม่บังคับ`,
    );
  }
  const byTime = new Map<string, { n: number; score: number }>();
  for (const p of analysis.performances) {
    const t = p.post.suggestedTime;
    if (!t) continue;
    const cur = byTime.get(t) ?? { n: 0, score: 0 };
    cur.n += 1;
    cur.score += p.score;
    byTime.set(t, cur);
  }
  if (byTime.size >= 2) {
    const [bestTime, best] = [...byTime.entries()].sort(
      (a, b) => b[1].score / b[1].n - a[1].score / a[1].n,
    )[0];
    if (!timeTips.some((t) => t.includes(bestTime))) {
      timeTips.push(
        `ในหน้าต่าง ${window} วัน สล็อต ${bestTime} คะแนนเฉลี่ยดีกว่า (n=${best.n})`,
      );
    }
  }
  if (timeTips.length === 0) {
    timeTips.push(
      "ยังไม่พอข้อมูลช่วงเวลา — โพสต์ตามตาราง draft 2–3 ชิ้น/วันพอ",
    );
  }

  const experiments: PlaybookExperiment[] = [];
  if (keepDoing[0]) {
    const winner = keepDoing[0];
    const product = byId.get(winner.productId);
    experiments.push({
      title: `ต่อยอด “${winner.productName}” ด้วย hook ใหม่`,
      detail:
        "Approve draft ที่ใช้ hook คนละแบบจากเดิม 1 ชิ้น แล้วกรอกผลเย็น — อย่าโพสต์ซ้ำแคปชันเดิม",
    });
    if (product && rankedChannels[0]?.[0]) {
      const alt = (
        ["tiktok", "facebook_reels", "facebook_post", "facebook_group"] as ContentChannel[]
      ).find((c) => c !== rankedChannels[0][0]);
      if (alt) {
        experiments.push({
          title: `ย้ายมุมขายไป ${channelLabel(alt)}`,
          detail: `สินค้าที่เวิร์กบนช่องเดิม ลองคุณภาพ 1 ชิ้นบน ${channelLabel(alt)} (draft → Approve → โพสต์มือ)`,
        });
      }
    }
  }
  if (stopOrPause[0]) {
    experiments.push({
      title: `พัก “${stopOrPause[0].productName}” แล้วสบันงบประมาณความสนใจ`,
      detail:
        "กดพักที่ /products เอง (ระบบไม่พักอัตโนมัติ) แล้วโฟกัสสินค้า keepDoing แทน",
    });
  }
  if (experiments.length === 0) {
    experiments.push({
      title: "เก็บข้อมูลคุณภาพก่อนขยาย",
      detail:
        "รัน Morning → Approve 1–2 draft → โพสต์มือ → กรอกผลเย็น แล้วค่อยอ่าน Playbook ใหม่",
    });
  }

  const checklist = [
    "ตรวจ disclosure ทุกแคปชันก่อน Approve",
    "โพสต์ด้วยมือหลัง Approve เท่านั้น — ระบบไม่โพสต์ให้อัตโนมัติ",
    "อย่าโพสต์ซ้ำข้อความเดิมในวันเดียว",
    "กรอก views/clicks/orders/ค่าคอมเย็นนี้เพื่ออัปเดต Playbook",
    "ถ้าสินค้าอ่อนต่อเนื่อง ให้พักเอง ไม่ต้องเพิ่มรอบ",
  ];

  const summary =
    posts.length === 0
      ? `Winner Playbook ${date}: ยังไม่มีเมตริกใน ${window} วัน — เก็บผลจริงก่อนสรุป keep/stop`
      : `Winner Playbook ${date}: จาก ${posts.length} โพสต์/${window} วัน · keep ${keepDoing.length} · พิจารณาพัก ${stopOrPause.length} (ทดลอง ไม่การันตีรายได้)`;

  const lines = [
    `Winner Playbook ${date}: ${summary}`,
    ...keepDoing
      .slice(0, 3)
      .map(
        (k, i) =>
          `Keep ${i + 1}) ${k.productName} — ${k.why}`,
      ),
    ...stopOrPause
      .slice(0, 2)
      .map((s) => `Stop/พัก: ${s.productName} — ${s.why}`),
    ...channelTips.slice(0, 1).map((c) => `ช่องทาง: ${c.label} — ${c.tip}`),
    ...experiments
      .slice(0, 2)
      .map((e) => `ทดลอง: ${e.title}`),
    "Playbook เป็นสมมติฐานจากข้อมูลที่กรอก — ไม่โพสต์อัตโนมัติและไม่การันตีรายได้",
  ];

  return {
    date,
    windowDays: window,
    samplePosts: posts.length,
    summary,
    keepDoing,
    stopOrPause: stopOrPause.slice(0, 5),
    channelTips,
    hookTips,
    ctaTips,
    timeTips,
    experiments,
    checklist,
    lines,
    disclaimer: INCOME_DISCLAIMER,
  };
}

export function winnerPlaybookLines(
  playbook: WinnerPlaybook,
  limit = 8,
): string[] {
  return playbook.lines.slice(0, limit);
}

export function winnerPlaybookToMarkdown(playbook: WinnerPlaybook): string {
  const keep =
    playbook.keepDoing.length === 0
      ? "_(ยังไม่มีสินค้า keep — เก็บเมตริกต่อ)_"
      : playbook.keepDoing
          .map(
            (k, i) =>
              `${i + 1}. **${k.productName}**\n   ${k.why}\n   ออเดอร์ ${k.orders} · ค่าคอม ฿${k.commission.toLocaleString("th-TH")} · CTR ~${(k.avgCtr * 100).toFixed(1)}%`,
          )
          .join("\n");
  const stop =
    playbook.stopOrPause.length === 0
      ? "_(ยังไม่มีคำแนะนำพัก)_"
      : playbook.stopOrPause
          .map((s, i) => `${i + 1}. **${s.productName}** — ${s.why}`)
          .join("\n");
  const channels =
    playbook.channelTips.length === 0
      ? "_(ยังไม่พอข้อมูลช่องทาง)_"
      : playbook.channelTips
          .map((c) => `- **${c.label}**: ${c.tip}`)
          .join("\n");
  const experiments = playbook.experiments
    .map((e, i) => `${i + 1}. **${e.title}**\n   ${e.detail}`)
    .join("\n");
  const checklist = playbook.checklist.map((c) => `- ${c}`).join("\n");

  return (
    `# Winner Playbook · ${playbook.date}\n\n` +
    `${playbook.summary}\n\n` +
    `หน้าต่างข้อมูล: ${playbook.windowDays} วัน · โพสต์ที่มีเมตริก: ${playbook.samplePosts}\n\n` +
    `## Keep doing\n${keep}\n\n` +
    `## Stop / พักชั่วคราว\n${stop}\n\n` +
    `## ช่องทาง\n${channels}\n\n` +
    `## Hook\n${playbook.hookTips.map((t) => `- ${t}`).join("\n")}\n\n` +
    `## CTA\n${playbook.ctaTips.map((t) => `- ${t}`).join("\n")}\n\n` +
    `## ช่วงเวลา\n${playbook.timeTips.map((t) => `- ${t}`).join("\n")}\n\n` +
    `## ทดลองถัดไป\n${experiments}\n\n` +
    `## Checklist\n${checklist}\n\n` +
    `> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ\n\n` +
    `${playbook.disclaimer}\n`
  );
}

/** Tiny helper for tests — score a product bucket without I/O. */
export function scorePlaybookProduct(input: {
  posts: number;
  orders: number;
  commission: number;
  avgCtr: number;
}): number {
  return (
    Math.min(input.posts, 5) * 8 +
    input.orders * 20 +
    Math.min(input.commission / 200, 1) * 25 +
    Math.min(input.avgCtr, 0.2) * 100
  );
}

export function productNameOrId(
  products: Product[],
  productId: string,
): string {
  return products.find((p) => p.id === productId)?.name ?? productId;
}
