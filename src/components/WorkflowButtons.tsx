"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WorkflowButtons() {
  const router = useRouter();
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState<"morning" | "evening" | null>(null);

  async function run(kind: "morning" | "evening") {
    setBusy(kind);
    setLog("");
    const res = await fetch(`/api/workflow/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json();
    setBusy(null);
    if (data.brief) {
      setLog(
        `${data.brief.summary}\n\n${data.brief.recommendations.map((r: string) => `• ${r}`).join("\n")}\n\n${data.brief.disclaimer}`,
      );
    } else {
      setLog(data.error ?? "เสร็จแล้ว");
    }
    router.refresh();
  }

  return (
    <div className="surface rounded-2xl p-5">
      <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">Workflow ประจำวัน</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        เช้า: คัด Top 5 + สร้าง content pack + ตาราง draft · เย็น: วิเคราะห์ผลที่กรอกแล้วแนะนำวันถัดไป
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("morning")}
          className="pulse-soft rounded-md bg-[var(--sage)] px-4 py-2 text-sm text-white hover:bg-[var(--sage-deep)] disabled:opacity-60"
        >
          {busy === "morning" ? "กำลังรันเช้า..." : "รัน Morning workflow"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("evening")}
          className="rounded-md border border-[var(--line)] bg-white/80 px-4 py-2 text-sm hover:bg-[var(--mist)] disabled:opacity-60"
        >
          {busy === "evening" ? "กำลังรันเย็น..." : "รัน Evening workflow"}
        </button>
        <a
          href="/api/export?format=json"
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--mist)]"
        >
          Export JSON
        </a>
        <a
          href="/api/export?format=csv&scope=products"
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--mist)]"
        >
          Export สินค้า CSV
        </a>
        <a
          href="/api/export?format=csv&scope=schedule"
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--mist)]"
        >
          Export ตาราง CSV
        </a>
      </div>
      {log && (
        <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-[var(--mist)] p-3 text-xs leading-relaxed text-[var(--ink-soft)]">
          {log}
        </pre>
      )}
    </div>
  );
}
