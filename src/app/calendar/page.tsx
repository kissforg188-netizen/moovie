"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, ScheduledPost } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";

export default function CalendarPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [schedule, setSchedule] = useState<ScheduledPost[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch(`/api/schedule?date=${date}`).then((res) => res.json()),
      fetch("/api/products").then((res) => res.json()),
    ]);
    setSchedule(s.schedule ?? []);
    setProducts(p.products ?? []);
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? id;

  async function act(id: string, action: "approve" | "mark_posted" | "skip") {
    setBusyId(id);
    setMessage("");
    try {
      const res = await fetch("/api/schedule/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "อัปเดตไม่สำเร็จ");
      setMessage(
        action === "approve"
          ? "อนุมัติแล้ว — คัดลอกแคปชันไปโพสต์เองได้ (ระบบไม่โพสต์ให้อัตโนมัติ)"
          : action === "mark_posted"
            ? "บันทึกว่าโพสต์แล้ว"
            : "ข้ามโพสต์นี้แล้ว"
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusyId(null);
    }
  }

  async function copyCaption(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("คัดลอกแคปชันแล้ว");
  }

  return (
    <main className="stack" style={{ gap: "1.25rem" }}>
      <section className="hero-panel">
        <h1>ตารางโพสต์</h1>
        <p>
          แนะนำวันละ 2–3 ชิ้นในสถานะ draft เท่านั้น คุณต้องกดอนุมัติก่อนนำไปโพสต์จริง
          ระบบจะไม่ยิงโพสต์ให้อัตโนมัติ
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
          <a className="btn btn-secondary" href="/api/export?type=schedule.csv">
            Export CSV
          </a>
        </div>
        {message ? <p className="toast">{message}</p> : null}
      </section>

      <section className="panel">
        <h2>คิววันที่ {date}</h2>
        {schedule.length === 0 ? (
          <p className="muted">ยังไม่มีรายการ — รัน Morning workflow จากหน้าแรก</p>
        ) : (
          schedule.map((post) => (
            <article className="post-item" key={post.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {post.slot} · {post.channel}
                </strong>
                <StatusPill status={post.status} />
              </div>
              <p style={{ margin: 0 }}>
                สินค้า: <strong>{productName(post.productId)}</strong>
              </p>
              <div className="caption-box">{post.caption}</div>
              <div className="row">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void copyCaption(post.caption)}
                >
                  คัดลอกแคปชัน
                </button>
                {post.status === "draft" || post.status === "skipped" ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => void act(post.id, "approve")}
                  >
                    อนุมัติ
                  </button>
                ) : null}
                {post.status === "approved" || post.status === "draft" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => void act(post.id, "mark_posted")}
                  >
                    ฉันโพสต์แล้ว
                  </button>
                ) : null}
                {post.status !== "skipped" && post.status !== "posted" ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busyId === post.id}
                    onClick={() => void act(post.id, "skip")}
                  >
                    ข้าม
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
