"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MetricsForm({
  postId,
  productName,
}: {
  postId: string;
  productName: string;
}) {
  const router = useRouter();
  const [ok, setOk] = useState("");
  const field =
    "mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-2 py-1.5 text-sm";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/schedule/${postId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        views: Number(form.get("views") ?? 0),
        clicks: Number(form.get("clicks") ?? 0),
        orders: Number(form.get("orders") ?? 0),
        commissionEarned: Number(form.get("commissionEarned") ?? 0),
        notes: String(form.get("notes") ?? ""),
      }),
    });
    if (res.ok) {
      setOk("บันทึกผลแล้ว");
      router.refresh();
    } else {
      const data = await res.json();
      setOk(data.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-xl border border-[var(--line)] bg-white/60 p-3 md:grid-cols-5">
      <p className="md:col-span-5 text-sm font-medium text-[var(--sage-deep)]">
        กรอกผล: {productName}
      </p>
      <label className="text-xs">
        Views
        <input name="views" type="number" min={0} className={field} defaultValue={0} />
      </label>
      <label className="text-xs">
        Clicks
        <input name="clicks" type="number" min={0} className={field} defaultValue={0} />
      </label>
      <label className="text-xs">
        Orders
        <input name="orders" type="number" min={0} className={field} defaultValue={0} />
      </label>
      <label className="text-xs">
        ค่าคอม (บาท)
        <input
          name="commissionEarned"
          type="number"
          min={0}
          step="0.01"
          className={field}
          defaultValue={0}
        />
      </label>
      <label className="text-xs">
        โน้ต
        <input name="notes" className={field} placeholder="มุมขายที่ลอง" />
      </label>
      <div className="md:col-span-5 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-[var(--sage)] px-3 py-1.5 text-xs text-white"
        >
          บันทึกผลลัพธ์
        </button>
        {ok && <span className="text-xs text-[var(--ink-soft)]">{ok}</span>}
      </div>
    </form>
  );
}
