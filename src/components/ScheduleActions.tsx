"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DraftStatus } from "@/lib/types";

export function ScheduleActions({
  id,
  status,
}: {
  id: string;
  status: DraftStatus;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/schedule/${id}/approve`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMsg(data.message ?? data.error ?? "");
    router.refresh();
  }

  async function skip() {
    setBusy(true);
    const res = await fetch(`/api/schedule/${id}/skip`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMsg(data.message ?? data.error ?? "");
    router.refresh();
  }

  async function markPosted() {
    setBusy(true);
    const res = await fetch(`/api/schedule/${id}/mark-posted`, {
      method: "POST",
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.error ?? "บันทึกว่าโพสต์แล้ว (ยืนยันด้วยมือ)");
    router.refresh();
  }

  if (status === "skipped") {
    return (
      <p className="text-xs text-[var(--ink-soft)]">ข้ามแล้ว (ไม่โพสต์)</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={approve}
              className="rounded-md bg-[var(--sage-deep)] px-3 py-1.5 text-xs text-white hover:bg-[var(--sage)]"
            >
              Approve draft
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={skip}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:bg-[var(--mist)]"
            >
              ข้าม (ไม่โพสต์)
            </button>
          </>
        )}
        {status === "approved" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={markPosted}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-[var(--mist)]"
            >
              ยืนยันว่าโพสต์แล้ว
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={skip}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:bg-[var(--mist)]"
            >
              ยกเลิก / ข้าม
            </button>
          </>
        )}
        {status === "posted" && (
          <button
            type="button"
            disabled
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs opacity-50"
          >
            โพสต์แล้ว
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-[var(--ink-soft)]">{msg}</p>}
    </div>
  );
}
