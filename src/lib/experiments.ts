import type {
  ContentPack,
  LearningState,
  Product,
  RankedProduct,
  ScheduledPost,
} from "./types";
import { INCOME_DISCLAIMER } from "./disclosure";
import { channelLabel } from "./schedule";

export interface ExperimentPlan {
  date: string;
  lines: string[];
  /** Soft A/B suggestions — never auto-run. */
  abTests: {
    productName: string;
    channel: string;
    primaryHook: string;
    alternateHook: string;
    note: string;
  }[];
  dataGaps: string[];
}

/**
 * Build a morning experiment checklist: what to A/B test and which
 * products still need metrics. Soft guidance only — no income claims.
 */
export function buildExperimentPlan(params: {
  date: string;
  ranked: RankedProduct[];
  packs: ContentPack[];
  schedule: ScheduledPost[];
  products: Product[];
  learning?: LearningState | null;
}): ExperimentPlan {
  const { date, ranked, packs, schedule, products, learning } = params;
  const productById = new Map(products.map((p) => [p.id, p]));
  const packByProduct = new Map<string, ContentPack>();
  for (const pack of packs) {
    const prev = packByProduct.get(pack.productId);
    if (!prev || pack.createdAt >= prev.createdAt) {
      packByProduct.set(pack.productId, pack);
    }
  }

  const todayPosts = schedule
    .filter((s) => s.date === date && s.status !== "skipped")
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

  const abTests: ExperimentPlan["abTests"] = [];
  for (const post of todayPosts.slice(0, 2)) {
    const product = productById.get(post.productId);
    const pack = packByProduct.get(post.productId);
    if (!product || !pack || pack.hooks.length < 2) continue;
    const primary =
      pack.hooks[post.hookIndex] ??
      pack.hooks[learning?.preferredHookIndex ?? 0] ??
      pack.hooks[0];
    const altIdx =
      (post.hookIndex + 1 + (learning?.preferredHookIndex ?? 0)) %
      pack.hooks.length;
    const alternate = pack.hooks[altIdx] ?? pack.hooks[1];
    if (primary === alternate) continue;
    abTests.push({
      productName: product.name,
      channel: channelLabel(post.channel),
      primaryHook: primary,
      alternateHook: alternate,
      note: "ถ่าย 1 คลิปหลัก + เก็บ alternate hook ไว้ทดสอบวันถัดไป — อย่าโพสต์ซ้ำวันเดียวกัน",
    });
  }

  const dataGaps: string[] = [];
  const postedNoMetrics = schedule.filter(
    (s) =>
      s.status === "posted" &&
      !s.metrics &&
      s.date <= date,
  );
  for (const s of postedNoMetrics.slice(0, 3)) {
    const name = productById.get(s.productId)?.name ?? s.productId;
    dataGaps.push(
      `โพสต์ ${s.date} · ${name} (${channelLabel(s.channel)}) ยังไม่มีเมตริก — กรอก views/clicks/orders คืนนี้`,
    );
  }

  const testedIds = new Set(
    schedule
      .filter((s) => s.metrics)
      .map((s) => s.productId),
  );
  for (const r of ranked) {
    if (!testedIds.has(r.product.id)) {
      dataGaps.push(
        `“${r.product.name}” อยู่ใน Top แต่ยังไม่มีผลทดลอง — ถ้า Approve แล้ว โพสต์ 1 ชิ้นแล้วกรอกผล`,
      );
    }
  }

  if (
    learning?.underperformerProductIds?.length &&
    learning.underperformerProductIds.length > 0
  ) {
    const names = learning.underperformerProductIds
      .map((id) => productById.get(id)?.name)
      .filter(Boolean);
    if (names.length) {
      dataGaps.push(
        `สินค้าที่อ่อนในรอบก่อน (ทดลอง): ${names.join(", ")} — เปลี่ยนมุมขายหรือพักไว้ ไม่โพสต์ซ้ำข้อความเดิม`,
      );
    }
  }

  const lines: string[] = [
    `แผนทดลอง ${date} (ไม่การันตีผล · draft ต้อง Approve ก่อนโพสต์)`,
  ];
  if (abTests.length) {
    lines.push(
      `A/B วันนี้: ${abTests
        .map((t) => `${t.productName}/${t.channel}`)
        .join(" · ")}`,
    );
  } else {
    lines.push("ยังไม่มีคิว draft สำหรับ A/B — รัน Morning เพื่อสร้างตาราง");
  }
  if (dataGaps.length) {
    lines.push(...dataGaps.slice(0, 4));
  } else {
    lines.push("ช่องว่างข้อมูลน้อย — คงคุณภาพโพสต์และกรอกผลทุกเย็น");
  }
  lines.push(INCOME_DISCLAIMER);

  return { date, lines, abTests, dataGaps };
}

export function experimentPlanToMarkdown(plan: ExperimentPlan): string {
  const blocks = plan.abTests.map((t, i) =>
    [
      `## A/B ${i + 1}: ${t.productName} · ${t.channel}`,
      "",
      `**Hook หลัก:** ${t.primaryHook}`,
      "",
      `**Hook สำรอง (วันถัดไป):** ${t.alternateHook}`,
      "",
      `_${t.note}_`,
    ].join("\n"),
  );

  return [
    `# แผนทดลองคอนเทนต์ · ${plan.date}`,
    "",
    `> ${INCOME_DISCLAIMER}`,
    "",
    "## สรุป",
    ...plan.lines.map((l) => `- ${l}`),
    "",
    blocks.length ? blocks.join("\n\n---\n\n") : "_ยังไม่มี A/B ที่แนะนำ_",
    "",
    "## ช่องว่างข้อมูล",
    plan.dataGaps.length
      ? plan.dataGaps.map((g) => `- ${g}`).join("\n")
      : "- ไม่มีช่องว่างชัดเจนในตอนนี้",
    "",
  ].join("\n");
}
