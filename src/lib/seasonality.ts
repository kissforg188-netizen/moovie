/**
 * Thai / local calendar seasonality hints for product ranking.
 * Soft modifier only — never claims guaranteed sales.
 * Dates use Asia/Bangkok via bangkokParts.
 */

import { bangkokParts } from "./db";

export type SeasonHint = {
  month: number; // 1-12
  label: string;
  categories: string[]; // category keywords (Thai or English lowercased match)
  boost: number; // 0–20 added to seasonal subscore before clamp
};

const SEASON_CALENDAR: SeasonHint[] = [
  {
    month: 1,
    label: "ปีใหม่ / หน้าหนาวปลาย",
    categories: ["ผิว", "กันแดด", "ครีม", "สุขภาพ", "ของขวัญ", "แกเจ็ต"],
    boost: 12,
  },
  {
    month: 2,
    label: "วาเลนไทน์ / ฤดูร้อนเริ่ม",
    categories: ["ของขวัญ", "ผิว", "กันแดด", "แฟชั่น", "ความงาม"],
    boost: 10,
  },
  {
    month: 3,
    label: "ร้อนจัด / เตรียมสงกรานต์",
    categories: ["พัดลม", "เย็น", "กันแดด", "ขวดน้ำ", "เที่ยว", "outdoor"],
    boost: 14,
  },
  {
    month: 4,
    label: "สงกรานต์",
    categories: ["พัดลม", "เย็น", "กันน้ำ", "เที่ยว", "กระเป๋า", "ขวดน้ำ"],
    boost: 16,
  },
  {
    month: 5,
    label: "เข้าพรรษา / ฝนต้นฤดู",
    categories: ["กันฝน", "ร่ม", "บ้าน", "ครัว", "สุขภาพ"],
    boost: 10,
  },
  {
    month: 6,
    label: "เปิดเทอม",
    categories: ["นักเรียน", "เครื่องเขียน", "กระเป๋า", "แกเจ็ต", "หูฟัง"],
    boost: 12,
  },
  {
    month: 7,
    label: "กลางปี / ฝน",
    categories: [
      "บ้าน",
      "จัดเก็บ",
      "ครัว",
      "กันชื้น",
      "สุขภาพ",
      "แกเจ็ต",
      "พัดลม",
      "ร่ม",
      "กันฝน",
      "ชื้น",
      "อบผ้า",
    ],
    boost: 10,
  },
  {
    month: 8,
    label: "วันแม่ → เปิดเทอมปลายเดือน",
    categories: [
      "แม่",
      "ของขวัญ",
      "สุขภาพ",
      "บ้าน",
      "ความงาม",
      "ครัว",
      "ผิว",
      "ดูแล",
      "ดอกไม้",
      "นวด",
      "นักเรียน",
      "เครื่องเขียน",
      "กระเป๋า",
      "แกเจ็ต",
      "หูฟัง",
      "เปิดเทอม",
      "เรียน",
    ],
    boost: 14,
  },
  {
    month: 9,
    label: "ปลายฝน / เรียนต่อ",
    categories: ["บ้าน", "จัดเก็บ", "แกเจ็ต", "ทำงาน", "ออฟฟิศ", "นักเรียน", "เครื่องเขียน"],
    boost: 8,
  },
  {
    month: 10,
    label: "ก่อนหน้าหนาว / ออกกำลัง",
    categories: ["กีฬา", "สุขภาพ", "แฟชั่น", "ผิว"],
    boost: 10,
  },
  {
    month: 11,
    label: "11.11 / ปีใหม่ใกล้",
    categories: ["แกเจ็ต", "ของขวัญ", "บ้าน", "ความงาม", "แฟชั่น"],
    boost: 16,
  },
  {
    month: 12,
    label: "ปีใหม่ / ของขวัญ",
    categories: ["ของขวัญ", "แกเจ็ต", "ความงาม", "บ้าน", "เที่ยว"],
    boost: 16,
  },
];

function categoryHit(category: string, keys: string[]): boolean {
  const cat = (category || "").toLowerCase();
  if (!cat) return false;
  return keys.some(
    (k) => cat.includes(k.toLowerCase()) || k.toLowerCase().includes(cat),
  );
}

export function currentSeasonHint(date = new Date()): SeasonHint {
  const { month } = bangkokParts(date);
  return SEASON_CALENDAR.find((s) => s.month === month) ?? SEASON_CALENDAR[0];
}

/** Returns 0–20 soft boost when product category matches Thai season keywords. */
export function thaiSeasonBoost(
  category: string,
  date = new Date(),
): { boost: number; label: string } {
  const hint = currentSeasonHint(date);
  const hit = categoryHit(category, hint.categories);
  return { boost: hit ? hint.boost : Math.round(hint.boost * 0.25), label: hint.label };
}

/**
 * Extra soft boost when a known campaign window is active.
 * Closer dates / peak windows get a slightly higher modifier — never claims guaranteed sales.
 */
export function eventProximityBoost(
  category: string,
  date = new Date(),
): { boost: number; label: string | null } {
  const { month, day } = bangkokParts(date);

  // Thai Mother's Day — 12 August (window Aug 1–12)
  if (month === 8 && day >= 1 && day <= 12) {
    const giftKeys = [
      "แม่",
      "ของขวัญ",
      "สุขภาพ",
      "บ้าน",
      "ความงาม",
      "ครัว",
      "ผิว",
      "ดูแล",
      "ดอกไม้",
      "นวด",
    ];
    if (!categoryHit(category, giftKeys)) return { boost: 0, label: null };
    const daysUntil = 12 - day;
    // day 12 → +10, day 1 → +3
    const boost = Math.round(3 + 7 * (1 - daysUntil / 12));
    return {
      boost: Math.max(3, Math.min(10, boost)),
      label:
        daysUntil === 0
          ? "วันแม่วันนี้ — หมวดของขวัญ/ดูแล"
          : `ใกล้วันแม่ (อีก ${daysUntil} วัน)`,
    };
  }

  // Back-to-school / เปิดเทอมปลาย — Aug 13–31 (after Mother's Day)
  if (month === 8 && day >= 13 && day <= 31) {
    const schoolKeys = [
      "นักเรียน",
      "เครื่องเขียน",
      "กระเป๋า",
      "แกเจ็ต",
      "หูฟัง",
      "เปิดเทอม",
      "เรียน",
      "แท็บเล็ต",
      "ปากกา",
      "โน้ตบุ๊ก",
      "นักศึกษา",
    ];
    if (!categoryHit(category, schoolKeys)) return { boost: 0, label: null };
    // Peak mid-window (around Aug 20) slightly higher; still soft 4–9
    const distFromPeak = Math.abs(day - 20);
    const boost = Math.round(9 - distFromPeak * 0.35);
    return {
      boost: Math.max(4, Math.min(9, boost)),
      label: "ช่วงเปิดเทอมปลายเดือน — หมวดเรียน/แกเจ็ต/กระเป๋า",
    };
  }

  // Soft bridge: early September school carry-over
  if (month === 9 && day <= 10) {
    const schoolKeys = ["นักเรียน", "เครื่องเขียน", "กระเป๋า", "แกเจ็ต", "หูฟัง", "เรียน"];
    if (!categoryHit(category, schoolKeys)) return { boost: 0, label: null };
    return {
      boost: 4,
      label: "ต้นเดือนหลังเปิดเทอม — หมวดเรียนยังมีโอกาสทดลอง",
    };
  }

  return { boost: 0, label: null };
}

/**
 * Merge manual seasonalScore (1–5) with calendar boost into 0–100 subscore.
 */
export function effectiveSeasonalScore(
  seasonalScore1to5: number,
  category: string,
  date = new Date(),
): number {
  const clamped = Math.max(1, Math.min(5, seasonalScore1to5 || 1));
  const base = ((clamped - 1) / 4) * 100;
  const { boost } = thaiSeasonBoost(category, date);
  const { boost: eventBoost } = eventProximityBoost(category, date);
  return Math.max(0, Math.min(100, base * 0.8 + boost + eventBoost));
}
