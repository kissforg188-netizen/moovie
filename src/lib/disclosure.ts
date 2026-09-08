export const AFFILIATE_DISCLOSURE =
  "ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน";

export const INCOME_DISCLAIMER =
  "ระบบนี้เป็นเครื่องมือทดลองและปรับปรุงจากข้อมูลจริง ไม่รับประกันรายได้หรือยอดขาย";

export function withDisclosure(caption: string): string {
  const trimmed = caption.trim();
  if (trimmed.includes(AFFILIATE_DISCLOSURE)) return trimmed;
  return `${trimmed}\n\n${AFFILIATE_DISCLOSURE}`;
}
