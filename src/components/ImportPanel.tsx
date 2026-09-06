"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY_CSV_HEADER =
  "name,platform,affiliateUrl,price,commissionRate,category,sellingPoints,painPoints,targetAudience,videoEase,seasonalScore,notes";

export function ImportPanel() {
  const router = useRouter();
  const [text, setText] = useState(EMPTY_CSV_HEADER + "\n");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onImport() {
    setBusy(true);
    setMsg("");
    const looksJson = text.trim().startsWith("[") || text.trim().startsWith("{");
    const res = await fetch("/api/products/import", {
      method: "POST",
      headers: {
        "Content-Type": looksJson ? "application/json" : "text/csv",
      },
      body: text,
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "นำเข้าไม่สำเร็จ");
      return;
    }
    setMsg(`นำเข้า ${data.imported} สินค้า (ข้าม ${data.skipped})`);
    router.refresh();
  }

  return (
    <div className="surface rounded-2xl p-5">
      <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
        นำเข้าสินค้า (CSV / JSON)
      </h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        วางข้อมูลสินค้าจริงของคุณเท่านั้น — ไม่มีของตัวอย่างในระบบ
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white/80 p-3 font-mono text-xs leading-relaxed"
        spellCheck={false}
        placeholder={EMPTY_CSV_HEADER}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onImport}
          className="rounded-md bg-[var(--sage)] px-4 py-2 text-sm text-white hover:bg-[var(--sage-deep)] disabled:opacity-60"
        >
          {busy ? "กำลังนำเข้า..." : "นำเข้าสินค้า"}
        </button>
        <button
          type="button"
          onClick={() => setText(EMPTY_CSV_HEADER + "\n")}
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--mist)]"
        >
          เคลียร์เหลือหัวตาราง
        </button>
      </div>
      {msg && (
        <p className="mt-3 text-sm text-[var(--ink-soft)] whitespace-pre-wrap">
          {msg}
        </p>
      )}
    </div>
  );
}
