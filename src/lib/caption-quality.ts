/**
 * Soft caption quality score for draft review — helps humans Approve wisely.
 * Not a guarantee of reach/sales; never auto-publishes.
 */

import { hasAffiliateDisclosure, sanitizeMarketingText } from "./compliance";
import { AFFILIATE_DISCLOSURE } from "./disclosure";
import type { ContentChannel } from "./types";

export type QualityGrade = "A" | "B" | "C" | "D";

export interface CaptionQualityResult {
  score: number; // 0–100
  grade: QualityGrade;
  tips: string[];
  strengths: string[];
  channel: ContentChannel | "unknown";
  length: number;
}

const SOFT_TONE =
  /ช่วยเลือก|ลองดู|เหมาะกับ|ถ้าสนใจ|อาจช่วย|สำหรับคนที่|จากประสบการณ์|รีวิวสั้น|เช็คราคา|ดูรายละเอียด/;
const HARD_SELL = /รีบซื้อ|ต้องซื้อ|ด่วน|หมดแล้ว|โอกาสสุดท้าย|รวย|การันตี|รับประกันรายได้/;
const CTA_HINT =
  /ลิงก์ใน|ลิงก์ใต้|ดูรายละเอียด|เปิดดู|ลองเทียบ|เช็คราคา|bio|ตะกร้า|โปรไฟล์/;

function gradeFromScore(score: number): QualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function idealLength(channel: ContentChannel | "unknown"): { min: number; max: number } {
  switch (channel) {
    case "tiktok":
      return { min: 80, max: 500 };
    case "facebook_reels":
      return { min: 60, max: 400 };
    case "facebook_group":
      return { min: 120, max: 900 };
    case "facebook_post":
      return { min: 100, max: 800 };
    default:
      return { min: 80, max: 700 };
  }
}

/**
 * Score a caption for human review before Approve.
 * Deducts for missing disclosure / overclaim; rewards soft-help tone + CTA + length fit.
 */
export function scoreCaptionQuality(
  caption: string,
  channel: ContentChannel | "unknown" = "unknown",
  disclosure = AFFILIATE_DISCLOSURE,
): CaptionQualityResult {
  const text = (caption || "").trim();
  const tips: string[] = [];
  const strengths: string[] = [];
  let score = 40; // baseline for having text

  if (!text) {
    return {
      score: 0,
      grade: "D",
      tips: ["ยังไม่มีแคปชัน — สร้างคอนเทนต์หรือกดสร้างแคปชันใหม่"],
      strengths: [],
      channel,
      length: 0,
    };
  }

  const length = text.length;
  const { min, max } = idealLength(channel);

  if (hasAffiliateDisclosure(text, disclosure)) {
    score += 22;
    strengths.push("มี affiliate disclosure");
  } else {
    score -= 25;
    tips.push("เพิ่ม disclosure ก่อน Approve");
  }

  const sanitized = sanitizeMarketingText(text);
  if (sanitized.issues.length === 0) {
    score += 12;
    strengths.push("ไม่พบคำโฆษณาเกินจริง");
  } else {
    score -= Math.min(30, sanitized.issues.length * 12);
    tips.push(
      `ลดถ้อยคำเสี่ยง: ${sanitized.issues.map((i) => i.label).join(", ")}`,
    );
  }

  if (SOFT_TONE.test(text)) {
    score += 10;
    strengths.push("น้ำเสียงช่วยเลือกของ");
  } else {
    tips.push("เติมน้ำเสียงช่วยเลือกของ (เช่น “ช่วยเลือก / ลองดู / เหมาะกับ”)");
  }

  if (HARD_SELL.test(text)) {
    score -= 15;
    tips.push("เลี่ยงคำเร่งซื้อ/สแปม — ขายแบบช่วยตัดสินใจ");
  }

  if (CTA_HINT.test(text)) {
    score += 8;
    strengths.push("มี CTA อ่อน ๆ");
  } else {
    tips.push("เพิ่ม CTA อ่อน ๆ เช่น “ลองเปิดดูรายละเอียดก่อนตัดสินใจ”");
  }

  if (length >= min && length <= max) {
    score += 10;
    strengths.push("ความยาวเหมาะกับช่องทาง");
  } else if (length < min) {
    score -= 8;
    tips.push(`แคปชันสั้นไปสำหรับ ${channel} (เป้าประมาณ ${min}–${max} ตัวอักษร)`);
  } else {
    score -= 6;
    tips.push(`แคปชันยาวไป — ตัดให้กระชับเหลือประมาณ ${max} ตัวอักษร`);
  }

  const hashtagCount = (text.match(/#[\w\u0E00-\u0E7F]+/g) || []).length;
  if (channel === "tiktok" || channel === "facebook_reels") {
    if (hashtagCount >= 3 && hashtagCount <= 12) {
      score += 6;
      strengths.push(`มี hashtag ${hashtagCount} ตัว`);
    } else if (hashtagCount === 0) {
      tips.push("เพิ่ม hashtag ไทย/อังกฤษ 3–8 ตัวสำหรับวิดีโอสั้น");
    } else if (hashtagCount > 12) {
      score -= 4;
      tips.push("hashtag เยอะเกิน — เหลือ 3–8 ตัวที่เกี่ยวกับสินค้า");
    }
  }

  // Bang / emoji spam soft penalty
  if (/!{3,}/.test(text) || /(.)\1{5,}/.test(text)) {
    score -= 8;
    tips.push("ลดเครื่องหมาย ! ซ้ำและตัวอักษรซ้ำแบบสแปม");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);

  if (tips.length === 0 && grade === "A") {
    strengths.push("พร้อมให้คน Approve แล้วโพสต์ด้วยมือ");
  }

  return {
    score,
    grade,
    tips: tips.slice(0, 4),
    strengths: strengths.slice(0, 4),
    channel,
    length,
  };
}

export function qualityLabelTh(grade: QualityGrade): string {
  switch (grade) {
    case "A":
      return "ดีมาก — พร้อมรีวิว Approve";
    case "B":
      return "ใช้ได้ — ปรับเล็กน้อยจะคมขึ้น";
    case "C":
      return "ปานกลาง — แนะนำแก้ก่อน Approve";
    case "D":
      return "ต้องแก้ — อย่า Approve จนกว่าจะผ่าน";
  }
}

/** One-line summary for morning brief / calendar list. */
export function qualitySummaryLine(
  result: CaptionQualityResult,
  productName?: string,
): string {
  const who = productName ? `“${productName}”` : "draft";
  const tip = result.tips[0] ? ` · ${result.tips[0]}` : "";
  return `คุณภาพแคปชัน ${who}: ${result.grade} (${result.score}/100)${tip}`;
}

/** Rank today's drafts by quality for “แก้ชิ้นไหนก่อน”. */
export function rankDraftsByQuality<
  T extends { captionPreview: string; channel: ContentChannel; productId: string },
>(
  posts: T[],
  productNameById?: Map<string, string>,
): { post: T; quality: CaptionQualityResult; line: string }[] {
  return posts
    .map((post) => {
      const quality = scoreCaptionQuality(post.captionPreview, post.channel);
      const name = productNameById?.get(post.productId);
      return {
        post,
        quality,
        line: qualitySummaryLine(quality, name),
      };
    })
    .sort((a, b) => a.quality.score - b.quality.score);
}

export function qualityBriefLines(
  posts: { captionPreview: string; channel: ContentChannel; productId: string; status: string }[],
  products: { id: string; name: string }[],
): string[] {
  const active = posts.filter((p) => p.status === "draft" || p.status === "approved");
  if (active.length === 0) {
    return ["คุณภาพแคปชัน: ยังไม่มี draft วันนี้ให้ตรวจ"];
  }
  const byId = new Map(products.map((p) => [p.id, p.name]));
  const ranked = rankDraftsByQuality(active, byId);
  const avg =
    ranked.reduce((s, r) => s + r.quality.score, 0) / Math.max(ranked.length, 1);
  const weak = ranked.filter((r) => r.quality.grade === "C" || r.quality.grade === "D");
  const lines = [
    `คุณภาพแคปชันวันนี้: เฉลี่ย ${Math.round(avg)}/100 · ควรแก้ก่อน ${weak.length}/${ranked.length} ชิ้น`,
  ];
  for (const r of ranked.slice(0, 2)) {
    if (r.quality.grade === "C" || r.quality.grade === "D") {
      lines.push(`- ${r.line}`);
    }
  }
  const best = ranked[ranked.length - 1];
  if (best && best.quality.grade === "A") {
    lines.push(
      `ชิ้นที่พร้อม Approve ก่อน: ${byId.get(best.post.productId) ?? "draft"} (${best.quality.score}/100)`,
    );
  }
  return lines;
}
