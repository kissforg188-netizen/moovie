import { hasAffiliateDisclosure, sanitizeMarketingText } from "./compliance";
import { AFFILIATE_DISCLOSURE } from "./disclosure";
import type { ScheduledPost } from "./types";

export interface ApproveGateResult {
  ok: boolean;
  errors: string[];
}

/**
 * Hard gate before Approve — never auto-publishes.
 * Blocks missing affiliate disclosure and leftover overclaim spam language.
 */
export function evaluateApproveGate(
  caption: string,
  disclosure = AFFILIATE_DISCLOSURE,
): ApproveGateResult {
  const errors: string[] = [];
  const text = caption || "";

  if (!hasAffiliateDisclosure(text, disclosure)) {
    errors.push(
      "ขาด affiliate disclosure — กด “สร้างแคปชันใหม่” หรือแก้ข้อความก่อน Approve",
    );
  }

  const sanitized = sanitizeMarketingText(text);
  for (const issue of sanitized.issues) {
    errors.push(`พบถ้อยคำเสี่ยง (${issue.label}): “${issue.sample}”`);
  }

  return { ok: errors.length === 0, errors };
}

export function canApproveStatus(status: ScheduledPost["status"]): boolean {
  return status === "draft";
}
