import { MetricsForm } from "@/components/MetricsForm";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { analyzePosted } from "@/lib/analytics";
import { INCOME_DISCLAIMER } from "@/lib/disclosure";
import { readDb, todayISO } from "@/lib/db";
import { channelLabel } from "@/lib/schedule";
import { buildTomorrowPlan } from "@/lib/tomorrow-plan";
import { weeklyInsightLines, weeklyProductRollup } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const db = await readDb();
  const date = todayISO();
  const todays = db.schedule.filter((s) => s.date === date);
  const analysis = analyzePosted(
    db.schedule.filter((s) => s.metrics),
    db.products,
  );
  const weekly = weeklyProductRollup(db.products, db.schedule, date, 7);
  const weeklyLines = weeklyInsightLines(weekly);
  const tomorrowPlan = buildTomorrowPlan(db, date);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="brand-mark text-4xl text-[var(--sage-deep)]">ผลลัพธ์ & ROI</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          กรอก views / clicks / orders / ค่าคอมด้วยมือ แล้วให้ระบบช่วยวิเคราะห์ว่ามุมไหนเวิร์ก
        </p>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{INCOME_DISCLAIMER}</p>
      </div>

      <WorkflowButtons />

      <section className="space-y-3">
        <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
          กรอกผลโพสต์วันนี้ · {date}
        </h2>
        {todays.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีโพสต์ในตารางวันนี้
          </p>
        ) : (
          todays.map((post) => {
            const product = db.products.find((p) => p.id === post.productId);
            return (
              <div key={post.id} className="space-y-2">
                <p className="text-sm text-[var(--ink-soft)]">
                  {post.suggestedTime} · {channelLabel(post.channel)} · {post.status}
                  {post.metrics
                    ? ` · บันทึกแล้ว (views ${post.metrics.views}, clicks ${post.metrics.clicks})`
                    : ""}
                </p>
                <MetricsForm
                  postId={post.id}
                  productName={product?.name ?? post.productId}
                />
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            สรุป 7 วันล่าสุด
          </h2>
          <a
            href="/api/export?format=csv&scope=weekly"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export CSV
          </a>
        </div>
        {weekly.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกในช่วง 7 วัน — กรอกผลหลังโพสต์เพื่อดูว่าสินค้าไหนทำเงินทดลองได้ดีกว่า
          </p>
        ) : (
          <div className="grid gap-3">
            {weekly.map((row) => (
              <article key={row.productId} className="surface rounded-2xl p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{row.productName}</h3>
                  <span className="text-xs text-[var(--ink-soft)]">
                    score {row.score.toFixed(1)}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">
                  {row.posts} โพสต์ · views {row.views.toLocaleString("th-TH")} · clicks{" "}
                  {row.clicks.toLocaleString("th-TH")} · orders {row.orders} · ค่าคอม ฿
                  {row.commission.toLocaleString("th-TH")} · CTR เฉลี่ย{" "}
                  {(row.avgCtr * 100).toFixed(1)}%
                </p>
              </article>
            ))}
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {weeklyLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">วิเคราะห์โพสต์ที่บันทึกแล้ว</h2>
        {analysis.performances.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริก — กรอกผลหลังโพสต์แล้วรัน Evening workflow
          </p>
        ) : (
          <div className="grid gap-3">
            {analysis.performances.map((p) => (
              <article key={p.post.id} className="surface rounded-2xl p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{p.productName}</h3>
                  <span className="text-xs text-[var(--ink-soft)]">
                    score {p.score.toFixed(1)}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">
                  {channelLabel(p.post.channel)} · CTR {(p.ctr * 100).toFixed(1)}% ·
                  orders/click {(p.ordersPerClick * 100).toFixed(1)}% · ค่าคอม ฿
                  {p.commission.toLocaleString("th-TH")} · ค่าคอม/คลิก ~฿
                  {p.commissionPerClick.toFixed(1)}
                  {p.promoSpend > 0
                    ? ` · ต้นทุน ฿${p.promoSpend.toLocaleString("th-TH")} · ROI ${p.roi != null ? `${(p.roi * 100).toFixed(0)}%` : "—"}`
                    : " · ยังไม่กรอกต้นทุนโปรโมท"}
                </p>
              </article>
            ))}
          </div>
        )}
        <div className="surface rounded-2xl p-5">
          <p className="text-sm">{analysis.summary}</p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">{analysis.channelInsight}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
            {analysis.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Tomorrow Plan · {tomorrowPlan.tomorrowDate}
          </h2>
          <a
            href="/api/export?format=md&scope=tomorrow"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{tomorrowPlan.summary}</p>
        {tomorrowPlan.picks.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีสินค้าพอจัดแผนวันถัดไป
          </p>
        ) : (
          <div className="grid gap-3">
            {tomorrowPlan.picks.map((p) => (
              <article key={p.productId} className="surface rounded-2xl p-4">
                <h3 className="font-medium">
                  {p.productName}
                  {p.filmFirst ? " · ถ่ายก่อน" : ""}
                </h3>
                <p className="text-sm text-[var(--ink-soft)]">{p.reason}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Hook: {p.suggestedHook}
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  มุมขาย: {p.suggestedAngle}
                </p>
              </article>
            ))}
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {tomorrowPlan.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">{tomorrowPlan.disclaimer}</p>
      </section>
    </div>
  );
}
