"use client";

import { useState } from "react";

export function CopyPostingPackButton({
  scheduleId,
  readyHint,
}: {
  scheduleId: string;
  /** When false, still allow copy as preview but label differently. */
  readyHint?: boolean;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/schedule/${scheduleId}/posting-pack`);
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "โหลดไม่สำเร็จ");
        return;
      }
      const text = String(data.pack?.text ?? "");
      await navigator.clipboard.writeText(text);
      setMsg(
        data.pack?.readyToCopy
          ? "คัดลอก Posting Pack แล้ว — ไปโพสต์ด้วยมือได้"
          : "คัดลอกพรีวิวแล้ว (ยังต้อง Approve ก่อนโพสต์จริง)",
      );
      setTimeout(() => setMsg(""), 2500);
    } catch {
      setMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={copy}
        className="rounded-md border border-[var(--sage)] px-3 py-1.5 text-xs text-[var(--sage-deep)] hover:bg-[var(--mist)]"
      >
        {busy
          ? "กำลังโหลด…"
          : readyHint
            ? "คัดลอก Posting Pack"
            : "พรีวิว Posting Pack"}
      </button>
      {msg && <p className="text-xs text-[var(--ink-soft)]">{msg}</p>}
    </div>
  );
}
