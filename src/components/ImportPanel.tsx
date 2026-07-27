"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLE = `name,platform,affiliateUrl,price,commissionRate,category,sellingPoints,painPoints,targetAudience,videoEase,seasonalScore,notes
พัดลมพกพา,shopee,https://shopee.co.th/,199,15,พัดลม,"เบา,เงียบ","ร้อน,พกยาก",คนเดินทาง,5,4,ตัวอย่าง`;

export function ImportPanel() {
  const router = useRouter();
  const [text, setText] = useState(SAMPLE);
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
        โหมด manual — วางลิงก์ affiliate, ราคา, ค่าคอม แล้วระบบสร้างคอนเทนต์ให้
        (ยังไม่ดึงจาก API ภายนอก)
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white/80 p-3 font-mono text-xs leading-relaxed"
        spellCheck={false}
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
          onClick={() => setText(SAMPLE)}
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--mist)]"
        >
          ใส่ตัวอย่าง CSV
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
