"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsPanel({
  maxPostsPerDay,
}: {
  maxPostsPerDay: 2 | 3;
}) {
  const router = useRouter();
  const [value, setValue] = useState<2 | 3>(maxPostsPerDay);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: 2 | 3) {
    setValue(next);
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxPostsPerDay: next }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.message ?? data.error ?? "");
    router.refresh();
  }

  return (
    <section className="surface rounded-2xl p-5">
      <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
        ตั้งค่าตาราง Draft
      </h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        แนะนำวันละ 2–3 ชิ้น · ไม่โพสต์อัตโนมัติ · ต้อง Approve ก่อน
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {([2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => save(n)}
            className={`rounded-md px-3 py-1.5 text-xs ${
              value === n
                ? "bg-[var(--sage-deep)] text-white"
                : "border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--mist)]"
            }`}
          >
            {n} ชิ้น/วัน
          </button>
        ))}
      </div>
      {msg && <p className="mt-2 text-xs text-[var(--ink-soft)]">{msg}</p>}
    </section>
  );
}
