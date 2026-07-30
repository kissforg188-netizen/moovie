"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsPanel({
  maxPostsPerDay,
  cooldownDays,
  staleDraftDays,
}: {
  maxPostsPerDay: 2 | 3;
  cooldownDays: number;
  staleDraftDays: number;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<2 | 3>(maxPostsPerDay);
  const [cooldown, setCooldown] = useState(cooldownDays);
  const [stale, setStale] = useState(staleDraftDays);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(patch: {
    maxPostsPerDay?: 2 | 3;
    cooldownDays?: number;
    staleDraftDays?: number;
  }) {
    setBusy(true);
    setMsg("");
    if (patch.maxPostsPerDay !== undefined) setPosts(patch.maxPostsPerDay);
    if (patch.cooldownDays !== undefined) setCooldown(patch.cooldownDays);
    if (patch.staleDraftDays !== undefined) setStale(patch.staleDraftDays);

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.message ?? data.error ?? "");
    if (data.settings) {
      setPosts(data.settings.maxPostsPerDay);
      setCooldown(data.settings.cooldownDays);
      setStale(data.settings.staleDraftDays);
    }
    router.refresh();
  }

  return (
    <section className="surface rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
          ตั้งค่าตาราง Draft
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">
          แนะนำวันละ 2–3 ชิ้น · ไม่โพสต์อัตโนมัติ · ต้อง Approve ก่อน
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--sage-deep)]">จำนวน draft / วัน</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {([2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => save({ maxPostsPerDay: n })}
              className={`rounded-md px-3 py-1.5 text-xs ${
                posts === n
                  ? "bg-[var(--sage-deep)] text-white"
                  : "border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--mist)]"
              }`}
            >
              {n} ชิ้น/วัน
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--sage-deep)]">
          Cooldown กันสแปม (วัน)
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
          ไม่จัด product+channel ซ้ำภายในช่วงนี้
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[2, 3, 5, 7].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => save({ cooldownDays: n })}
              className={`rounded-md px-3 py-1.5 text-xs ${
                cooldown === n
                  ? "bg-[var(--sage-deep)] text-white"
                  : "border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--mist)]"
              }`}
            >
              {n} วัน
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--sage-deep)]">
          ข้าม draft ค้าง (วัน)
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
          Morning จะ skip draft ที่ค้างเกินนี้ (ไม่แตะ approved/posted)
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[3, 5, 7, 14].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => save({ staleDraftDays: n })}
              className={`rounded-md px-3 py-1.5 text-xs ${
                stale === n
                  ? "bg-[var(--sage-deep)] text-white"
                  : "border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--mist)]"
              }`}
            >
              {n} วัน
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="text-xs text-[var(--ink-soft)]">{msg}</p>}
    </section>
  );
}
