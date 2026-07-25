import type { PostStatus } from "@/lib/types";

const labels: Record<PostStatus, string> = {
  draft: "ร่าง",
  approved: "อนุมัติแล้ว",
  posted: "โพสต์แล้ว",
  skipped: "ข้าม",
};

export function StatusPill({ status }: { status: PostStatus }) {
  return <span className={`status-pill status-${status}`}>{labels[status]}</span>;
}
