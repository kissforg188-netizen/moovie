"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  detectPlatformFromUrl,
  platformLabelTh,
} from "@/lib/platform-detect";
import type { Platform } from "@/lib/types";

export function ProductForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [platform, setPlatform] = useState<Platform>("shopee");
  const [detectNote, setDetectNote] = useState("");

  function onUrlChange(value: string) {
    const detected = detectPlatformFromUrl(value);
    if (detected) {
      setPlatform(detected);
      setDetectNote(`ตรวจจับอัตโนมัติ: ${platformLabelTh(detected)}`);
    } else if (value.trim()) {
      setDetectNote("ยังตรวจแพลตฟอร์มจากลิงก์ไม่ได้ — เลือกเองได้");
    } else {
      setDetectNote("");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      platform,
      affiliateUrl: String(form.get("affiliateUrl") ?? ""),
      price: Number(form.get("price") ?? 0),
      commissionRate: Number(form.get("commissionRate") ?? 0),
      category: String(form.get("category") ?? ""),
      sellingPoints: String(form.get("sellingPoints") ?? ""),
      painPoints: String(form.get("painPoints") ?? ""),
      targetAudience: String(form.get("targetAudience") ?? ""),
      videoEase: Number(form.get("videoEase") ?? 3),
      seasonalScore: Number(form.get("seasonalScore") ?? 3),
      notes: String(form.get("notes") ?? ""),
    };
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    e.currentTarget.reset();
    setPlatform("shopee");
    setDetectNote("");
    setMessage("บันทึกสินค้าแล้ว");
    router.refresh();
  }

  const field =
    "mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 text-sm outline-none focus:border-[var(--sage)]";

  return (
    <form onSubmit={onSubmit} className="surface fade-up grid gap-3 rounded-2xl p-5 md:grid-cols-2">
      <h2 className="brand-mark md:col-span-2 text-2xl text-[var(--sage-deep)]">
        เพิ่มสินค้า Affiliate (โหมด Manual)
      </h2>
      <label className="text-sm">
        ชื่อสินค้า *
        <input name="name" required className={field} placeholder="เช่น พัดลมมือถือมินิ" />
      </label>
      <label className="text-sm">
        แพลตฟอร์ม
        <select
          name="platform"
          className={field}
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value as Platform);
            setDetectNote("เลือกด้วยมือแล้ว");
          }}
        >
          <option value="shopee">Shopee</option>
          <option value="tiktok_shop">TikTok Shop</option>
          <option value="facebook">Facebook (ลิงก์ภายนอก)</option>
        </select>
        {detectNote && (
          <span className="mt-1 block text-xs text-[var(--ink-soft)]">{detectNote}</span>
        )}
      </label>
      <label className="text-sm md:col-span-2">
        ลิงก์ Affiliate *
        <input
          name="affiliateUrl"
          required
          className={field}
          placeholder="วางลิงก์ Shopee / TikTok / Facebook…"
          onChange={(e) => onUrlChange(e.target.value)}
        />
      </label>
      <label className="text-sm">
        ราคา (บาท)
        <input name="price" type="number" min={0} step="1" className={field} defaultValue={199} />
      </label>
      <label className="text-sm">
        ค่าคอม (%)
        <input
          name="commissionRate"
          type="number"
          min={0}
          step="0.1"
          className={field}
          defaultValue={10}
        />
      </label>
      <label className="text-sm">
        หมวดหมู่
        <input name="category" className={field} placeholder="ของใช้ในบ้าน" />
      </label>
      <label className="text-sm">
        กลุ่มเป้าหมาย
        <input
          name="targetAudience"
          className={field}
          placeholder="คนทำงานออฟฟิศ / คุณแม่ลูกอ่อน"
        />
      </label>
      <label className="text-sm md:col-span-2">
        จุดขาย (คั่นด้วยคอมมาหรือขึ้นบรรทัด)
        <textarea
          name="sellingPoints"
          rows={2}
          className={field}
          placeholder="พกพาง่าย, ชาร์จ USB, เสียงเบา"
        />
      </label>
      <label className="text-sm md:col-span-2">
        Pain point
        <textarea
          name="painPoints"
          rows={2}
          className={field}
          placeholder="ร้อนในรถไฟฟ้า, พัดลมบ้านเสียงดัง"
        />
      </label>
      <label className="text-sm">
        ทำวิดีโอสั้นง่ายแค่ไหน (1–5)
        <input name="videoEase" type="number" min={1} max={5} className={field} defaultValue={4} />
      </label>
      <label className="text-sm">
        Seasonal / Trending (1–5)
        <input
          name="seasonalScore"
          type="number"
          min={1}
          max={5}
          className={field}
          defaultValue={3}
        />
      </label>
      <label className="text-sm md:col-span-2">
        โน้ตเพิ่ม
        <input name="notes" className={field} />
      </label>
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--sage-deep)] px-4 py-2 text-sm text-white transition hover:bg-[var(--sage)] disabled:opacity-60"
        >
          {loading ? "กำลังบันทึก..." : "บันทึกสินค้า"}
        </button>
        {message && <p className="text-sm text-[var(--ink-soft)]">{message}</p>}
      </div>
    </form>
  );
}
