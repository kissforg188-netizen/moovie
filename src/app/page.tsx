import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { INCOME_DISCLAIMER } from "@/lib/disclosure";
import { channelLabel } from "@/lib/schedule";
import { getDashboardSnapshot } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { ranked, todaySchedule, latestMorning, latestEvening, db } =
    await getDashboardSnapshot();

  return (
    <div className="space-y-8">
      <section className="fade-up relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,rgba(63,111,92,0.12),rgba(232,220,200,0.45)_45%,rgba(255,255,255,0.7))] px-6 py-10 md:px-10">
        <p className="text-sm tracking-[0.18em] text-[var(--ink-soft)] uppercase">
          Manual-first · Approval gate
        </p>
        <h1 className="brand-mark mt-2 text-5xl text-[var(--sage-deep)] md:text-6xl">
          เลือกดี
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--ink-soft)]">
          ช่วยคัดสินค้า affiliate สร้างคอนเทนต์จริงใจ และวางตารางโพสต์แบบไม่สแปม —
          ทุกชิ้นเป็น draft จนกว่าคุณจะอนุมัติ
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/products"
            className="rounded-md bg-[var(--sage-deep)] px-4 py-2 text-sm text-white hover:bg-[var(--sage)]"
          >
            เพิ่มสินค้า
          </Link>
          <Link
            href="/calendar"
            className="rounded-md border border-[var(--line)] bg-white/70 px-4 py-2 text-sm hover:bg-white"
          >
            ดูตารางวันนี้
          </Link>
        </div>
      </section>

      <WorkflowButtons />

      <section className="fade-up-delay grid gap-4 md:grid-cols-3">
        <div className="surface rounded-2xl p-5">
          <p className="text-xs text-[var(--ink-soft)]">สินค้าทั้งหมด</p>
          <p className="brand-mark text-4xl text-[var(--sage-deep)]">{db.products.length}</p>
        </div>
        <div className="surface rounded-2xl p-5">
          <p className="text-xs text-[var(--ink-soft)]">Draft วันนี้</p>
          <p className="brand-mark text-4xl text-[var(--sage-deep)]">
            {todaySchedule.filter((s) => s.status === "draft").length}
          </p>
        </div>
        <div className="surface rounded-2xl p-5">
          <p className="text-xs text-[var(--ink-soft)]">รอ/พร้อมโพสต์</p>
          <p className="brand-mark text-4xl text-[var(--sage-deep)]">
            {todaySchedule.filter((s) => s.status === "approved").length}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">Top สินค้าโปรโมต</h2>
          <Link href="/products" className="text-sm text-[var(--sage)] hover:underline">
            จัดการสินค้า
          </Link>
        </div>
        {ranked.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีสินค้า — ไปเพิ่มที่หน้าสินค้า หรือรัน `npm run seed`
          </p>
        ) : (
          <div className="grid gap-3">
            {ranked.map(({ product, score }, i) => (
              <article
                key={product.id}
                className="surface flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4"
              >
                <div>
                  <p className="text-xs text-[var(--ink-soft)]">#{i + 1}</p>
                  <h3 className="text-lg font-medium">{product.name}</h3>
                  <p className="text-sm text-[var(--ink-soft)]">
                    {product.platform} · ฿{product.price.toLocaleString("th-TH")} · คอม{" "}
                    {product.commissionRate}% · {product.category}
                  </p>
                </div>
                <ScoreBadge score={score} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">ตารางโพสต์วันนี้</h2>
        {todaySchedule.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มี draft — กดรัน Morning workflow
          </p>
        ) : (
          <div className="grid gap-3">
            {todaySchedule.map((post) => {
              const product = db.products.find((p) => p.id === post.productId);
              return (
                <article key={post.id} className="surface rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {post.suggestedTime} · {channelLabel(post.channel)}
                    </p>
                    <span className="rounded-md bg-[var(--mist)] px-2 py-0.5 text-xs">
                      {post.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {product?.name ?? post.productId}
                  </p>
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-[var(--ink-soft)]">
                    {post.captionPreview}
                  </pre>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {(latestMorning || latestEvening) && (
        <section className="grid gap-4 md:grid-cols-2">
          {latestMorning && (
            <div className="surface rounded-2xl p-5">
              <h3 className="font-medium text-[var(--sage-deep)]">สรุปเช้าล่าสุด</h3>
              <p className="mt-2 text-sm">{latestMorning.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
                {latestMorning.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {latestEvening && (
            <div className="surface rounded-2xl p-5">
              <h3 className="font-medium text-[var(--sage-deep)]">สรุปเย็นล่าสุด</h3>
              <p className="mt-2 text-sm">{latestEvening.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
                {latestEvening.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-[var(--ink-soft)]">{INCOME_DISCLAIMER}</p>
    </div>
  );
}
