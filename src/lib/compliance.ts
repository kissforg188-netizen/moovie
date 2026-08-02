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
