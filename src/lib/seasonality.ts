/**
 * Thai / local calendar seasonality hints for product ranking.
 * Soft modifier only — never claims guaranteed sales.
 */

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
    label: "วันแม่ / ของขวัญปลายฝน",
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
    ],
    boost: 14,
  },
  {
    month: 9,
    label: "ปลายฝน",
    categories: ["บ้าน", "จัดเก็บ", "แกเจ็ต", "ทำงาน", "ออฟฟิศ"],
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

function monthOf(date = new Date()): number {
  return date.getUTCMonth() + 1;
}

export function currentSeasonHint(date = new Date()): SeasonHint {
  const m = monthOf(date);
  return SEASON_CALENDAR.find((s) => s.month === m) ?? SEASON_CALENDAR[0];
}

/** Returns 0–20 soft boost when product category matches Thai season keywords. */
export function thaiSeasonBoost(
  category: string,
  date = new Date(),
): { boost: number; label: string } {
  const hint = currentSeasonHint(date);
  const cat = (category || "").toLowerCase();
  const hit = hint.categories.some(
    (k) => cat.includes(k.toLowerCase()) || k.toLowerCase().includes(cat),
  );
  return { boost: hit ? hint.boost : Math.round(hint.boost * 0.25), label: hint.label };
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
  return Math.max(0, Math.min(100, base * 0.8 + boost));
}
