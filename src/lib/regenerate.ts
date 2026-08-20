import { generateContentPack } from "./content";
import { newId } from "./db";
import { captionForChannel, captionFingerprint } from "./schedule";
import type { ContentPack, Database, ScheduledPost } from "./types";

export interface RegenerateResult {
  ok: boolean;
  error?: string;
  post?: ScheduledPost;
  pack?: ContentPack;
  message?: string;
}

/**
 * Rebuild a draft's content pack with a new variant (fresh hooks/angles).
 * Keeps status as draft — never publishes. Skipped posts can be revived as draft.
 */
export function regenerateScheduledDraft(
  db: Database,
  postId: string,
): RegenerateResult {
  const post = db.schedule.find((s) => s.id === postId);
  if (!post) {
    return { ok: false, error: "ไม่พบโพสต์ในตาราง" };
  }
  if (post.status === "posted") {
    return { ok: false, error: "โพสต์แล้ว — ไม่สร้างแคปชันทับของเก่า" };
  }
  if (post.status === "approved") {
    return {
      ok: false,
      error: "อนุมัติแล้ว — ข้ามก่อนถ้าต้องการสร้างแคปชันใหม่",
    };
  }

  const product = db.products.find((p) => p.id === post.productId);
  if (!product) {
    return { ok: false, error: "ไม่พบสินค้าของโพสต์นี้" };
  }
  if (product.active === false) {
    return {
      ok: false,
      error: "สินค้าถูกพักไว้ — เปิดใช้งานก่อนสร้างแคปชันใหม่",
    };
  }

  const priorCount = db.contentPacks.filter(
    (p) => p.productId === product.id,
  ).length;
  const oldPack = db.contentPacks.find((p) => p.id === post.contentPackId);
  const variant = (oldPack?.variant ?? 0) + priorCount + 1;
  const pack = generateContentPack(product, { variant });

  const usedFingerprints = new Set(
    db.schedule
      .filter(
        (s) =>
          s.id !== post.id &&
          s.date === post.date &&
          s.status !== "skipped",
      )
      .map((s) => captionFingerprint(s.captionPreview)),
  );

  let hookIndex = post.hookIndex % Math.max(1, pack.hooks.length);
  let ctaIndex = post.ctaIndex % Math.max(1, pack.ctas.length);
  let caption = captionForChannel(pack, post.channel, hookIndex, ctaIndex);

  for (let attempt = 0; attempt < pack.hooks.length; attempt++) {
    hookIndex = (variant + attempt) % pack.hooks.length;
    ctaIndex = (variant + attempt) % pack.ctas.length;
    caption = captionForChannel(pack, post.channel, hookIndex, ctaIndex);
    if (!usedFingerprints.has(captionFingerprint(caption))) break;
  }

  db.contentPacks.push(pack);
  post.contentPackId = pack.id;
  post.hookIndex = hookIndex;
  post.ctaIndex = ctaIndex;
  post.captionPreview = caption;
  post.status = "draft";
  // clear prior approval if somehow present
  delete post.approvedAt;

  return {
    ok: true,
    post,
    pack,
    message: `สร้างแคปชันใหม่แล้ว (variant ${variant}) — ยังเป็น draft ต้อง Approve ก่อนโพสต์ด้วยมือ`,
  };
}

/** Convenience for tests — clone-safe id helper unused externally. */
export function nextPackId(): string {
  return newId("pack");
}
