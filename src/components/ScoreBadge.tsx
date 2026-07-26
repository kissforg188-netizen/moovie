import type { ScoreBreakdown } from "@/lib/types";

export function ScoreBadge({ score }: { score: ScoreBreakdown }) {
  const tone =
    score.total >= 75
      ? "bg-[var(--sage)] text-white"
      : score.total >= 55
        ? "bg-[var(--sand)] text-[var(--ink)]"
        : "bg-[var(--mist)] text-[var(--ink-soft)]";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}
      title={`คอม ${score.commission} · ราคา ${score.impulsePrice} · pain ${score.painClarity} · วิดีโอ ${score.videoEase} · ซีซัน ${score.seasonal}`}
    >
      คะแนน {score.total}
    </span>
  );
}
