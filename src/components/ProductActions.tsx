"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContentPack } from "@/lib/types";

export function ProductActions({ productId }: { productId: string }) {
  const router = useRouter();
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "สร้างคอนเทนต์ไม่สำเร็จ");
      return;
    }
    const data = await res.json();
    setPack(data.pack);
    router.refresh();
  }

  async function remove() {
    if (!confirm("ลบสินค้านี้ออกจากรายการ?")) return;
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="rounded-md bg-[var(--sage)] px-3 py-1.5 text-xs text-white hover:bg-[var(--sage-deep)] disabled:opacity-60"
        >
          {busy ? "กำลังสร้าง..." : "สร้าง Content Pack"}
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:bg-[var(--mist)]"
        >
          ลบ
        </button>
      </div>
      {error && <p className="text-xs text-[var(--coral)]">{error}</p>}
      {pack && (
        <div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm">
          <p className="mb-2 font-medium text-[var(--sage-deep)]">Content Pack พร้อมแล้ว</p>
          <p className="text-xs text-[var(--ink-soft)]">{pack.videoPriorityNote}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[var(--sage)]">ดู hooks / script / caption</summary>
            <div className="mt-2 space-y-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-soft)]">
              <p>
                <strong>Hooks</strong>
                {"\n"}
                {pack.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}
              </p>
              <p>
                <strong>CTA</strong>
                {"\n"}
                {pack.ctas.map((c, i) => `${i + 1}. ${c}`).join("\n")}
              </p>
              <p>
                <strong>TikTok script</strong>
                {"\n"}
                {pack.tiktokScript.scenes
                  .map((s) => `[${s.time}] ${s.line}\n(${s.visual})`)
                  .join("\n\n")}
              </p>
              <p>
                <strong>Facebook Page</strong>
                {"\n"}
                {pack.facebookCaption}
              </p>
              <p>
                <strong>Facebook Group</strong>
                {"\n"}
                {pack.facebookGroupCaption}
              </p>
              <p>
                <strong>Reels</strong>
                {"\n"}
                {pack.reelsCaption}
              </p>
              <p>
                <strong>Checklist ถ่ายวิดีโอ</strong>
                {"\n"}
                {(pack.filmingChecklist ?? [])
                  .map((c, i) => `${i + 1}. ${c}`)
                  .join("\n")}
              </p>
              <p>
                <strong>Hashtags</strong>
                {"\n"}
                {[...pack.hashtagsTh, ...pack.hashtagsEn].join(" ")}
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
