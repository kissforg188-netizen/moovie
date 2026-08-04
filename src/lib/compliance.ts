/**
 * Soft compliance helpers — block spammy / overclaim language.
 * Does not guarantee legal compliance; helps keep tone honest.
 */

const OVERCLAIM_PATTERNS: { pattern: RegExp; replacement: string; label: string }[] =
  [
    {
      pattern: /รับประกันรายได้|การันตีรายได้|รายได้ชัวร์|รวยแน่|รวยแน่นอน/gi,
      replacement: "ผลลัพธ์ขึ้นกับสินค้าและคอนเทนต์ (ทดลองจากข้อมูลจริง)",
      label: "เคลมรายได้แน่นอน",
    },
    {
      pattern: /ขายดีอันดับ\s*1|ขายดีที่สุด|ที่ดีที่สุด|เบอร์หนึ่งแน่นอน/gi,
      replacement: "ตัวเลือกที่น่าสนใจจากรีวิว/จุดใช้งาน",
      label: "คำโฆษณาเกินจริง",
    },
    {
      pattern: /ต้องซื้อเลย|รีบซื้อด่วน!!!+|หมดแล้วหมดเลย!!!+|โอกาสสุดท้าย!!!+/gi,
      replacement: "ถ้าสนใจ ลองเปิดดูรายละเอียดก่อนตัดสินใจ",
      label: "เร่งซื้อแบบสแปม",
    },
    {
      pattern: /หายห่วง\s*100%|ได้ผล\s*100%|ชัวร์\s*100%/gi,
      replacement: "ผลขึ้นอยู่กับสภาพการใช้งานของแต่ละคน",
      label: "รับประกันผลเกินจริง",
    },
    {
      pattern: /ฟรี!!!+|ถูกที่สุดในโลก|ถูกที่สุดแน่นอน/gi,
      replacement: "ตรวจราคาและโปรก่อนซื้อเสมอ",
      label: "ราคาเกินจริง",
    },
  ];

export interface ComplianceIssue {
  label: string;
  sample: string;
}

export interface ComplianceResult {
  ok: boolean;
  text: string;
  issues: ComplianceIssue[];
}

/** Soft-sanitize caption text; keeps meaning, removes overclaim spam. */
export function sanitizeMarketingText(input: string): ComplianceResult {
  let text = input;
  const issues: ComplianceIssue[] = [];

  for (const rule of OVERCLAIM_PATTERNS) {
    if (rule.pattern.test(text)) {
      const match = text.match(rule.pattern);
      issues.push({
        label: rule.label,
        sample: match?.[0] ?? rule.label,
      });
      text = text.replace(rule.pattern, rule.replacement);
    }
    // reset lastIndex for global regex reuse
    rule.pattern.lastIndex = 0;
  }

  // Collapse noisy bangs / emoji spam clusters (keep single !)
  text = text.replace(/!{3,}/g, "!");
  text = text.replace(/(.)\1{4,}/g, "$1$1$1");

  return {
    ok: issues.length === 0,
    text,
    issues,
  };
}

export function hasAffiliateDisclosure(text: string, disclosure: string): boolean {
  return text.includes(disclosure);
}

export type DraftAuditSeverity = "error" | "warn";

export interface DraftAuditFinding {
  postId: string;
  channel: string;
  severity: DraftAuditSeverity;
  label: string;
  detail: string;
}

/**
 * Audit scheduled captions for missing disclosure / leftover overclaim language.
 * Does not auto-post; flags issues for the human approver.
 */
export function auditDraftCaptions(
  posts: { id: string; channel: string; captionPreview: string; status: string }[],
  disclosure: string,
): { ok: boolean; findings: DraftAuditFinding[]; summaryLines: string[] } {
  const findings: DraftAuditFinding[] = [];
  const active = posts.filter((p) => p.status === "draft" || p.status === "approved");

  for (const post of active) {
    const caption = post.captionPreview || "";
    if (!hasAffiliateDisclosure(caption, disclosure)) {
      findings.push({
        postId: post.id,
        channel: post.channel,
        severity: "error",
        label: "ขาด disclosure",
        detail: "แคปชันยังไม่มีข้อความ affiliate disclosure",
      });
    }
    const sanitized = sanitizeMarketingText(caption);
    for (const issue of sanitized.issues) {
      findings.push({
        postId: post.id,
        channel: post.channel,
        severity: "warn",
        label: issue.label,
        detail: `พบถ้อยคำเสี่ยง: “${issue.sample}”`,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const summaryLines: string[] = [];
  if (active.length === 0) {
    summaryLines.push("Compliance: ยังไม่มี draft/approved วันนี้ให้ตรวจ");
  } else if (findings.length === 0) {
    summaryLines.push(
      `Compliance: ตรวจ ${active.length} แคปชัน — มี disclosure และไม่พบคำโฆษณาเกินจริง`,
    );
  } else {
    summaryLines.push(
      `Compliance: พบปัญหา ${errors} ขาด disclosure · ${warns} คำเตือนโฆษณา — แก้ก่อน Approve/โพสต์`,
    );
    for (const f of findings.slice(0, 3)) {
      summaryLines.push(`- [${f.severity}] ${f.channel}: ${f.label} — ${f.detail}`);
    }
  }

  return { ok: errors === 0, findings, summaryLines };
}

/** Soft readiness checks so morning ranking inputs stay useful. */
export function productReadinessIssues(products: {
  id: string;
  name: string;
  active?: boolean;
  painPoints: string[];
  sellingPoints: string[];
  affiliateUrl: string;
  targetAudience: string;
}[]): string[] {
  const lines: string[] = [];
  const active = products.filter((p) => p.active !== false);
  let weak = 0;
  for (const p of active) {
    const pains = p.painPoints.filter((x) => x.trim().length > 0);
    const sells = p.sellingPoints.filter((x) => x.trim().length > 0);
    const missing: string[] = [];
    if (pains.length === 0) missing.push("pain point");
    if (sells.length === 0) missing.push("จุดขาย");
    if (!p.affiliateUrl.trim()) missing.push("ลิงก์ affiliate");
    if (p.targetAudience.trim().length < 4) missing.push("กลุ่มเป้าหมาย");
    if (missing.length > 0) {
      weak += 1;
      if (lines.length < 3) {
        lines.push(`สินค้า “${p.name}” ข้อมูลไม่ครบ: ${missing.join(", ")}`);
      }
    }
  }
  if (weak > 0) {
    lines.unshift(
      `ข้อมูลสินค้าไม่ครบ ${weak}/${active.length} ชิ้น — เติม pain/จุดขายก่อนสร้างคอนเทนต์จะคมขึ้น`,
    );
  }
  return lines;
}
