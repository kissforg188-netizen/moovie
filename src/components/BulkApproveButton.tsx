"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BulkApproveButton({ date }: { date: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onApprove() {
    if (
      !confirm(
        "อนุมัติ draft ทั้งหมดของวันนี้?\nระบบจะไม่โพสต์อัตโนมัติ — คุณยังต้องโพสต์ด้วยมือหลังตรวจ caption",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/schedule/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.message ?? data.error ?? "เสร็จแล้ว");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={onApprove}
        className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-1.5 text-sm hover:bg-[var(--mist)] disabled:opacity-60"
      >
        {busy ? "กำลังอนุมัติ..." : "Approve draft วันนี้ทั้งชุด"}
      </button>
      {msg && <span className="text-xs text-[var(--ink-soft)]">{msg}</span>}
    </div>
  );
}
