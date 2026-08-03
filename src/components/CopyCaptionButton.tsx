"use client";

import { useState } from "react";

export function CopyCaptionButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:bg-[var(--mist)]"
    >
      {copied ? "คัดลอกแล้ว" : "คัดลอกแคปชัน"}
    </button>
  );
}
