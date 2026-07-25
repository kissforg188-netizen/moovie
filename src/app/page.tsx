"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdapterStatus } from "@/lib/adapters/types";
import type { DailyBrief, RankedProduct, ScheduledPost } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";

export default function HomePage() {
  const [ranked, setRanked] = useState<RankedProduct[]>([]);
  const [schedule, setSchedule] = useState<ScheduledPost[]>([]);
  const [briefs, setBriefs] = useState<DailyBrief[]>([]);
  const [adapters, setAdapters] = useState<AdapterStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [r, s, b, a] = await Promise.all([
      fetch("/api/ranking?limit=5").then((res) => res.json()),
      fetch("/api/schedule").then((res) => res.json()),
      fetch("/api/briefs").then((res) => res.json()),
      fetch("/api/adapters").then((res) => res.json()),
    ]);
    setRanked(r.ranked ?? []);
    setSchedule(s.schedule ?? []);
    setBriefs(b.briefs ?? []);
    setAdapters(a.adapters ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runWorkflow(kind: "morning" | "evening") {
    setBusy(kind);
    setMessage("");
    try {
      const res = await fetch(`/api/workflow/${kind}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "workflow failed");
      setMessage(
        kind === "morning"
          ? `สร้าง draft ${data.draftCount} ชิ้นจากสินค้าเด่น ${data.rankedCount} รายการแล้ว`
          : data.brief?.summary ?? "วิเคราะห์เย็นเสร็จแล้ว"
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(null);
    }
  }

  const morning = briefs.find((b) => b.type === "morning");
  const evening = briefs.find((b) => b.type === "evening");

  return (
    <main className="stack" style={{ gap: "1.25rem" }}>
      <section className="hero-panel">
        <div>
          <h1>เลือกดี</h1>
          <p>
            แล็บคอนเทนต์ affiliate แบบช่วยเลือกของ — คัดสินค้า สร้างแคปชัน/สคริปต์
            จัดตารางโพสต์ และเรียนรู้จากผลลัพธ์จริง โดยไม่โพสต์อัตโนมัติจนกว่าคุณจะอนุมัติ
          </p>
        </div>
        <p className="disclaimer">
          ระบบนี้เป็นเครื่องมือทดลอง ไม่มีการรับประกันรายได้หรือยอดขาย
          ทุกโพสต์ต้องมี disclosure และผ่านการ approve ก่อนเผยแพร่
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => void runWorkflow("morning")}
          >
            {busy === "morning" ? "กำลังรันเช้า..." : "รัน Morning workflow"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy !== null}
            onClick={() => void runWorkflow("evening")}
          >
            {busy === "evening" ? "กำลังรันเย็น..." : "รัน Evening workflow"}
          </button>
          <Link className="btn btn-secondary" href="/products">
            เพิ่มสินค้า
          </Link>
          <a className="btn btn-secondary" href="/api/export?type=json">
            Export JSON
          </a>
        </div>
        {message ? <p className="toast">{message}</p> : null}
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>Top 5 น่าโปรโมตวันนี้</h2>
          {ranked.length === 0 ? (
            <p className="muted">
              ยังไม่มีสินค้า — ไปที่หน้าสินค้าเพื่อเพิ่ม หรือรัน{" "}
              <code>npm run seed</code>
            </p>
          ) : (
            ranked.map((item, index) => (
              <div className="rank-item" key={item.product.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {index + 1}. {item.product.name}
                  </strong>
                  <span className="score">{item.score.total}</span>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {item.product.platform} · {item.product.price.toLocaleString("th-TH")} บาท ·
                  คอม {item.product.commissionRate}%
                </p>
                <ul className="list-plain">
                  {item.reasons.slice(0, 2).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="stack">
          <div className="panel">
            <h3>ตารางโพสต์วันนี้</h3>
            {schedule.length === 0 ? (
              <p className="muted">ยังไม่มี draft — กดรัน Morning workflow</p>
            ) : (
              schedule.map((post) => (
                <div className="post-item" key={post.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {post.slot} · {post.channel}
                    </strong>
                    <StatusPill status={post.status} />
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    สินค้า: {post.productId}
                  </p>
                </div>
              ))
            )}
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <Link className="btn btn-secondary" href="/calendar">
                เปิดตารางและอนุมัติ
              </Link>
            </div>
          </div>

          <div className="panel">
            <h3>สถานะ Adapter</h3>
            <ul className="list-plain">
              {adapters.map((adapter) => (
                <li key={adapter.platform}>
                  <strong>{adapter.platform}</strong> · {adapter.mode} — {adapter.note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h3>สรุปเช้า</h3>
          {morning ? (
            <>
              <p>{morning.summary}</p>
              <p className="muted">ควรทำวิดีโอก่อน:</p>
              <ul className="list-plain">
                {morning.videoPriority.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">ยังไม่มี brief เช้า</p>
          )}
        </div>
        <div className="panel">
          <h3>สรุปเย็น</h3>
          {evening ? (
            <>
              <p>{evening.summary}</p>
              <ul className="list-plain">
                {evening.recommendations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">
              กรอกผลลัพธ์ที่หน้า <Link href="/results">Results</Link> แล้วรัน Evening
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
