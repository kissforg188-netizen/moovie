export const AFFILIATE_DISCLOSURE =
  "ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน หากคุณซื้อผ่านลิงก์นี้ โดยไม่มีค่าใช้จ่ายเพิ่มเติมสำหรับคุณ";

export const INCOME_DISCLAIMER =
  "ระบบนี้เป็นเครื่องมือทดลองและเรียนรู้จากข้อมูลจริง ไม่มีการรับประกันรายได้หรือยอดขาย";

/** Phrases that make content sound spammy or deceptive — blocked from generators */
export const BANNED_PHRASES = [
  "รวยแน่",
  "รวยภายใน",
  "รับประกันขายดี",
  "กำไรชัวร์",
  "ต้องซื้อ",
  "โอกาสสุดท้าย",
  "ลด 90%",
  "ฟรีทั้งร้าน",
  "ไม่ซื้อคือพลาด",
  "รายได้หลักแสน",
  "ทำเงินง่าย ๆ",
  "คลิกเลยก่อนหมด",
];

export function assertCleanCopy(text: string): void {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      throw new Error(`ข้อความมีคำต้องห้าม: "${phrase}"`);
    }
  }
}

export function withDisclosure(caption: string): string {
  const trimmed = caption.trim();
  if (trimmed.includes("ลิงก์ affiliate") || trimmed.includes("affiliate")) {
    return trimmed;
  }
  return `${trimmed}\n\n—\n${AFFILIATE_DISCLOSURE}`;
}
