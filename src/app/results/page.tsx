"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerformanceMetric, Product, ScheduledPost } from "@/lib/types";

export default function ResultsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [schedule, setSchedule] = useState<ScheduledPost[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    scheduledPostId: "",
    views: "",
    clicks: "",
    orders: "",
    commissionEarned: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [eveningSummary, setEveningSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, m, p] = await Promise.all([
      fetch(`/api/schedule?date=${date}`).then((res) => res.json()),
      fetch(`/api/metrics?date=${date}`).then((res) => res.json()),
      fetch("/api/products").then((res) => res.json()),
    ]);
    setSchedule(s.schedule ?? []);
    setMetrics(m.metrics ?? []);
    setProducts(p.products ?? []);
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPostId = form.scheduledPostId || schedule[0]?.id || "";

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? id;

  const totals = useMemo(() => {
    return metrics.reduce(
      (acc, m) => {
        acc.views += m.views;
        acc.clicks += m.clicks;
        acc.orders += m.orders;
        acc.commission += m.commissionEarned;
        return acc;
      },
      { views: 0, clicks: 0, orders: 0, commission: 0 }
    );
  }, [metrics]);

  const roiHint =
    totals.clicks > 0
      ? `ค่าคอมต่อคลิก ≈ ${(totals.commission / totals.clicks).toFixed(2)} บาท (ตัวเลขทดลองจากที่กรอก)`
      : "ยังคำนวณค่าคอมต่อคลิกไม่ได้";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, scheduledPostId: selectedPostId, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setMessage("บันทึกผลลัพธ์แล้ว");
      setForm((prev) => ({
        ...prev,
        views: "",
        clicks: "",
        orders: "",
        commissionEarned: "",
        notes: "",
      }));
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function runEvening() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/workflow/evening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "วิเคราะห์ไม่สำเร็จ");
      setEveningSummary(data.brief?.summary ?? "");
      setMessage("วิเคราะห์เย็นเสร็จแล้ว");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stack" style={{ gap: "1.25rem" }}>
      <section className="hero-panel">
        <h1>ผลลัพธ์ทดลอง</h1>
        <p>
          กรอก views / clicks / orders / commission จากแพลตฟอร์มด้วยตนเอง
          เพื่อเรียนรู้ว่าสินค้าและมุมขายแบบไหนเวิร์ก โดยไม่เคลมรายได้ล่วงหน้า
        </p>
        <div className="row">
          <div className="field">
            <label htmlFor="date">วันที่</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <a className="btn btn-secondary" href="/api/export?type=metrics.csv">
            Export metrics CSV
          </a>
        </div>
      </section>

      <section className="grid-3">
        <div className="panel">
          <h3>Views</h3>
          <p className="score" style={{ fontSize: "1.8rem", margin: 0 }}>
            {totals.views.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="panel">
          <h3>Clicks / Orders</h3>
          <p className="score" style={{ fontSize: "1.8rem", margin: 0 }}>
            {totals.clicks} / {totals.orders}
          </p>
        </div>
        <div className="panel">
          <h3>Commission</h3>
          <p className="score" style={{ fontSize: "1.8rem", margin: 0 }}>
            {totals.commission.toLocaleString("th-TH")} บาท
          </p>
          <p className="muted">{roiHint}</p>
        </div>
      </section>

      <section className="grid-2">
        <form className="panel stack" onSubmit={onSubmit}>
          <h2>บันทึกผลโพสต์</h2>
          <div className="field">
            <label htmlFor="scheduledPostId">เลือกโพสต์</label>
            <select
              id="scheduledPostId"
              required
              value={selectedPostId}
              onChange={(e) =>
                setForm({ ...form, scheduledPostId: e.target.value })
              }
            >
              <option value="" disabled>
                — เลือก —
              </option>
              {schedule.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.slot} · {post.channel} · {productName(post.productId)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="views">Views</label>
              <input
                id="views"
                type="number"
                min="0"
                value={form.views}
                onChange={(e) => setForm({ ...form, views: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="clicks">Clicks</label>
              <input
                id="clicks"
                type="number"
                min="0"
                value={form.clicks}
                onChange={(e) => setForm({ ...form, clicks: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="orders">Orders</label>
              <input
                id="orders"
                type="number"
                min="0"
                value={form.orders}
                onChange={(e) => setForm({ ...form, orders: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="commissionEarned">ค่าคอมที่ได้ (บาท)</label>
              <input
                id="commissionEarned"
                type="number"
                min="0"
                step="0.01"
                value={form.commissionEarned}
                onChange={(e) =>
                  setForm({ ...form, commissionEarned: e.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="notes">โน้ต</label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} type="submit">
              บันทึก
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => void runEvening()}
            >
              วิเคราะห์เย็น
            </button>
          </div>
          {message ? <p className="toast">{message}</p> : null}
          {eveningSummary ? <p className="disclaimer">{eveningSummary}</p> : null}
        </form>

        <div className="panel">
          <h2>บันทึกของวันนี้</h2>
          {metrics.length === 0 ? (
            <p className="muted">ยังไม่มีข้อมูล</p>
          ) : (
            metrics.map((metric) => (
              <div className="metric-item" key={metric.id}>
                <strong>{productName(metric.productId)}</strong>
                <p className="muted" style={{ margin: 0 }}>
                  views {metric.views} · clicks {metric.clicks} · orders{" "}
                  {metric.orders} · คอม {metric.commissionEarned}
                </p>
                {metric.notes ? <p style={{ margin: 0 }}>{metric.notes}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
