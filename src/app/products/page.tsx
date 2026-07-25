"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContentPack, Product } from "@/lib/types";

const emptyForm = {
  name: "",
  platform: "shopee",
  affiliateUrl: "",
  price: "",
  commissionRate: "",
  commissionAmount: "",
  category: "",
  sellingPoints: "",
  painPoints: "",
  targetAudience: "",
  seasonalTags: "",
  videoFriendly: true,
  notes: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedPack, setSelectedPack] = useState<ContentPack | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setForm(emptyForm);
      setMessage(`เพิ่ม “${data.product.name}” แล้ว`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function generate(productId: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "สร้างคอนเทนต์ไม่สำเร็จ");
      setSelectedPack(data.contentPack);
      setMessage("สร้าง content pack แล้ว (มี disclosure ในแคปชัน)");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("ลบสินค้านี้?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (selectedPack?.productId === id) setSelectedPack(null);
    await refresh();
  }

  return (
    <main className="stack" style={{ gap: "1.25rem" }}>
      <section className="hero-panel">
        <h1>สินค้า Affiliate</h1>
        <p>
          โหมด manual: ใส่สินค้า ลิงก์ ค่าคอม และจุดขายเอง ระบบจะช่วยจัดอันดับและสร้างคอนเทนต์
          โดยไม่โพสต์ให้อัตโนมัติ
        </p>
      </section>

      <section className="grid-2">
        <form className="panel stack" onSubmit={onSubmit}>
          <h2>เพิ่มสินค้า</h2>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="name">ชื่อสินค้า</label>
              <input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="platform">แพลตฟอร์ม</label>
              <select
                id="platform"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="shopee">Shopee</option>
                <option value="tiktok_shop">TikTok Shop</option>
                <option value="facebook">Facebook (ลิงก์อื่น)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="category">หมวดหมู่</label>
              <input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="affiliateUrl">ลิงก์ affiliate</label>
              <input
                id="affiliateUrl"
                required
                type="url"
                placeholder="https://"
                value={form.affiliateUrl}
                onChange={(e) => setForm({ ...form, affiliateUrl: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="price">ราคา (บาท)</label>
              <input
                id="price"
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="commissionRate">ค่าคอม (%)</label>
              <input
                id="commissionRate"
                type="number"
                min="0"
                step="0.1"
                value={form.commissionRate}
                onChange={(e) =>
                  setForm({ ...form, commissionRate: e.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="targetAudience">กลุ่มเป้าหมาย</label>
              <input
                id="targetAudience"
                value={form.targetAudience}
                onChange={(e) =>
                  setForm({ ...form, targetAudience: e.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="sellingPoints">จุดขาย (คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่)</label>
              <textarea
                id="sellingPoints"
                value={form.sellingPoints}
                onChange={(e) =>
                  setForm({ ...form, sellingPoints: e.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="painPoints">Pain points</label>
              <textarea
                id="painPoints"
                value={form.painPoints}
                onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="seasonalTags">Seasonal / trending tags</label>
              <input
                id="seasonalTags"
                placeholder="ร้อน, เทรนด์"
                value={form.seasonalTags}
                onChange={(e) =>
                  setForm({ ...form, seasonalTags: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="videoFriendly">ทำวิดีโอสั้นง่าย?</label>
              <select
                id="videoFriendly"
                value={form.videoFriendly ? "yes" : "no"}
                onChange={(e) =>
                  setForm({ ...form, videoFriendly: e.target.value === "yes" })
                }
              >
                <option value="yes">ใช่</option>
                <option value="no">ไม่ค่อย</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="notes">โน้ตเพิ่มเติม</label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} type="submit">
              บันทึกสินค้า
            </button>
          </div>
          {message ? <p className="toast">{message}</p> : null}
        </form>

        <div className="panel">
          <h2>รายการสินค้า ({products.length})</h2>
          {products.length === 0 ? (
            <p className="muted">ยังไม่มีสินค้า</p>
          ) : (
            products.map((product) => (
              <div className="rank-item" key={product.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{product.name}</strong>
                  <span className="muted">{product.platform}</span>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {product.price.toLocaleString("th-TH")} บาท · คอม{" "}
                  {product.commissionRate}% · {product.category}
                </p>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(product.id)}
                  >
                    สร้างคอนเทนต์
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void remove(product.id)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedPack ? (
        <section className="panel stack">
          <h2>Content Pack</h2>
          <p className="disclaimer">{selectedPack.disclosure}</p>
          <div className="grid-2">
            <div>
              <h3>Hooks (5)</h3>
              <ul className="list-plain">
                {selectedPack.hooks.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <h3>CTA (3)</h3>
              <ul className="list-plain">
                {selectedPack.ctas.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <h3>Hashtags</h3>
              <p className="muted">
                {[...selectedPack.hashtags.th, ...selectedPack.hashtags.en].join(" ")}
              </p>
            </div>
            <div className="stack">
              <div>
                <h3>TikTok script ({selectedPack.tiktokScript.durationHint})</h3>
                <div className="caption-box">
                  {selectedPack.tiktokScript.scenes
                    .map(
                      (s) =>
                        `[${s.time}]\nภาพ: ${s.visual}\nพูด: ${s.voiceover}`
                    )
                    .join("\n\n")}
                </div>
              </div>
              <div>
                <h3>Facebook caption</h3>
                <div className="caption-box">{selectedPack.facebookCaption}</div>
              </div>
              <div>
                <h3>Reels caption</h3>
                <div className="caption-box">{selectedPack.reelsCaption}</div>
              </div>
              <p>
                <strong>มุมวิดีโอแนะนำ:</strong> {selectedPack.videoAngleSuggestion}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
