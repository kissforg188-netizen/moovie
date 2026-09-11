import { MetricsForm } from "@/components/MetricsForm";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { analyzePosted } from "@/lib/analytics";
import { INCOME_DISCLAIMER } from "@/lib/disclosure";
import { readDb, todayISO } from "@/lib/db";
import { channelLabel } from "@/lib/schedule";
import { buildTomorrowPlan } from "@/lib/tomorrow-plan";
import { buildWinnerPlaybook } from "@/lib/winner-playbook";
import { buildWeeklyReview } from "@/lib/weekly-review";
import { buildPostingHygiene } from "@/lib/posting-hygiene";
import { buildResultsIntake } from "@/lib/results-intake";
import { buildCreativePerformance } from "@/lib/creative-performance";
import { buildSoftRoiLab } from "@/lib/roi-lab";
import { buildChannelFitLab } from "@/lib/channel-fit";
import { buildCategoryFitLab } from "@/lib/category-fit";
import { buildPriceBandFitLab } from "@/lib/price-band";
import { buildCommissionBandFitLab } from "@/lib/commission-band";
import { buildPainClarityFitLab } from "@/lib/pain-clarity";
import { buildVideoEaseFitLab } from "@/lib/video-ease";
import { buildSeasonalFitLab } from "@/lib/seasonal-fit";
import { buildAudienceFitLab } from "@/lib/audience-fit";
import { buildHookFitLab } from "@/lib/hook-fit";
import { buildCtaFitLab } from "@/lib/cta-fit";
import { buildHashtagFitLab } from "@/lib/hashtag-fit";
import { buildToneFitLab } from "@/lib/tone-fit";
import { buildAngleFitLab } from "@/lib/angle-fit";
import { buildLengthFitLab } from "@/lib/length-fit";
import { buildScriptFitLab } from "@/lib/script-fit";
import { buildProofFitLab } from "@/lib/proof-fit";
import { buildOfferFitLab } from "@/lib/offer-fit";
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
  const winnerPlaybook = buildWinnerPlaybook(db, date);
  const weeklyReview = buildWeeklyReview(db, date);
  const postingHygiene = buildPostingHygiene(db, date);
  const resultsIntake = buildResultsIntake(db, date);
  const creativePerformance = buildCreativePerformance(db, date);
  const softRoiLab = buildSoftRoiLab(db, date);
  const channelFitLab = buildChannelFitLab(db, date);
  const categoryFitLab = buildCategoryFitLab(db, date);
  const priceBandFitLab = buildPriceBandFitLab(db, date);
  const commissionBandFitLab = buildCommissionBandFitLab(db, date);
  const painClarityFitLab = buildPainClarityFitLab(db, date);
  const videoEaseFitLab = buildVideoEaseFitLab(db, date);
  const seasonalFitLab = buildSeasonalFitLab(db, date);
  const audienceFitLab = buildAudienceFitLab(db, date);
  const hookFitLab = buildHookFitLab(db, date);
  const ctaFitLab = buildCtaFitLab(db, date);
  const hashtagFitLab = buildHashtagFitLab(db, date);
  const toneFitLab = buildToneFitLab(db, date);
  const angleFitLab = buildAngleFitLab(db, date);
  const lengthFitLab = buildLengthFitLab(db, date);
  const scriptFitLab = buildScriptFitLab(db, date);
  const proofFitLab = buildProofFitLab(db, date);
  const offerFitLab = buildOfferFitLab(db, date);

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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Results Intake
          </h2>
          <a
            href="/api/export?format=md&scope=intake"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{resultsIntake.summary}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรด</p>
            <p className="text-lg text-[var(--sage-deep)]">{resultsIntake.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ต้องสนใจ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {resultsIntake.counts.needsAttention}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ค้าง</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {resultsIntake.counts.overdue}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ครบแล้ว</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {resultsIntake.counts.complete}
            </p>
          </div>
        </div>
        {resultsIntake.rows.filter((r) => r.band !== "complete").length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {resultsIntake.rows
              .filter((r) => r.band !== "complete")
              .slice(0, 6)
              .map((r) => (
                <li key={r.scheduleId}>
                  <span className="text-[var(--ink)]">{r.productName}</span> ·{" "}
                  {r.channelLabel} · {r.date} · {r.band}
                  <br />
                  ขาด: {r.missingFields.join(", ") || "—"} — {r.tip}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--ink-soft)]">
            ไม่มีคิวค้าง — กรอกผลโพสต์ด้านล่างได้ตามปกติ
          </p>
        )}
        <p className="text-xs text-[var(--ink-soft)]">{resultsIntake.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Creative Performance
          </h2>
          <a
            href="/api/export?format=md&scope=creative"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {creativePerformance.summary}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรด</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {creativePerformance.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {creativePerformance.counts.withMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มุมเด่น</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {creativePerformance.counts.leaders}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มุมอ่อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {creativePerformance.counts.weak}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-[var(--sage-deep)]">
              Hook leaderboard
            </h3>
            {creativePerformance.hooks.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มีข้อมูล hook
              </p>
            ) : (
              <ul className="mt-1 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {creativePerformance.hooks.slice(0, 5).map((h) => (
                  <li key={`${h.fingerprint}-h`}>
                    <span className="text-[var(--ink)]">
                      #{h.index + 1} [{h.band}]
                    </span>{" "}
                    “{h.label}” · n={h.samples} · avg {h.avgScore}
                    <br />
                    {h.tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--sage-deep)]">
              CTA leaderboard
            </h3>
            {creativePerformance.ctas.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มีข้อมูล CTA
              </p>
            ) : (
              <ul className="mt-1 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {creativePerformance.ctas.slice(0, 5).map((c) => (
                  <li key={`${c.fingerprint}-c`}>
                    <span className="text-[var(--ink)]">
                      #{c.index + 1} [{c.band}]
                    </span>{" "}
                    “{c.label}” · n={c.samples} · avg {c.avgScore}
                    <br />
                    {c.tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {creativePerformance.tryNext.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
            {creativePerformance.tryNext.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-[var(--ink-soft)]">
          {creativePerformance.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Soft ROI Lab
          </h2>
          <a
            href="/api/export?format=md&scope=roi"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{softRoiLab.summary}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">{softRoiLab.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {softRoiLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">น่าลอง</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {softRoiLab.counts.promising}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ค่าคอมเฉลี่ย</p>
            <p className="text-lg text-[var(--sage-deep)]">
              ฿{softRoiLab.baseline.avgCommissionPerPost}
            </p>
          </div>
        </div>
        {softRoiLab.products.filter((p) => p.samples > 0).length === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อสร้างช่วงค่าคอมทดลอง — ไม่ใช่การันตีรายได้
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {softRoiLab.products
              .filter((p) => p.samples > 0)
              .slice(0, 6)
              .map((p) => (
                <li key={p.productId}>
                  <span className="text-[var(--ink)]">{p.productName}</span>
                  {" · "}
                  ฿{p.rangeLow}–{p.rangeHigh}/โพสต์ (n={p.samples})
                  {p.avgRoi != null
                    ? ` · ROI ~${(p.avgRoi * 100).toFixed(0)}%`
                    : ""}
                  <br />
                  {p.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">{softRoiLab.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Channel Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=channel-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{channelFitLab.summary}</p>
        <p className="text-sm text-[var(--sage-deep)]">{channelFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">{channelFitLab.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {channelFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่องแข็งแรง</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {channelFitLab.counts.strong}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {channelFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {channelFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับช่องทาง — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {channelFitLab.channels
              .filter((c) => c.samples > 0)
              .slice(0, 4)
              .map((c) => (
                <li key={c.channel}>
                  <span className="text-[var(--ink)]">{c.channelLabel}</span>
                  {" · "}
                  คะแนน {c.score}/100 (n={c.samples}) · CTR ~
                  {(c.avgCtr * 100).toFixed(1)}%
                  <br />
                  {c.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">{channelFitLab.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Category Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=category-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{categoryFitLab.summary}</p>
        <p className="text-sm text-[var(--sage-deep)]">{categoryFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">{categoryFitLab.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {categoryFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">หมวดร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {categoryFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {categoryFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {categoryFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับหมวด — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {categoryFitLab.categories
              .filter((c) => c.samples > 0)
              .slice(0, 4)
              .map((c) => (
                <li key={c.category}>
                  <span className="text-[var(--ink)]">{c.categoryLabel}</span>
                  {" · "}
                  คะแนน {c.score}/100 (n={c.samples}) · CTR ~
                  {(c.avgCtr * 100).toFixed(1)}%
                  <br />
                  {c.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">{categoryFitLab.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Price Band Lab
          </h2>
          <a
            href="/api/export?format=md&scope=price-band"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{priceBandFitLab.summary}</p>
        <p className="text-sm text-[var(--sage-deep)]">{priceBandFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">{priceBandFitLab.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {priceBandFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {priceBandFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {priceBandFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {priceBandFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับช่วงราคา — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {priceBandFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">{priceBandFitLab.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Commission Band Lab
          </h2>
          <a
            href="/api/export?format=md&scope=commission-band"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {commissionBandFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {commissionBandFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {commissionBandFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {commissionBandFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับช่วงคอมฯ — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {commissionBandFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {commissionBandFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Pain Clarity Lab
          </h2>
          <a
            href="/api/export?format=md&scope=pain-clarity"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {painClarityFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {painClarityFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {painClarityFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {painClarityFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {painClarityFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {painClarityFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {painClarityFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับความชัดของ pain — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {painClarityFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {painClarityFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Video Ease Lab
          </h2>
          <a
            href="/api/export?format=md&scope=video-ease"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {videoEaseFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {videoEaseFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {videoEaseFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {videoEaseFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับความง่ายของวิดีโอ — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {videoEaseFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {videoEaseFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Seasonal Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=seasonal-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {seasonalFitLab.summary}
        </p>
        <p className="text-xs text-[var(--ink-soft)]">
          ปฏิทินไทย: {seasonalFitLab.seasonLabel}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {seasonalFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {seasonalFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {seasonalFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {seasonalFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {seasonalFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {seasonalFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับศักยภาพซีซัน/เทรนด์ — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {seasonalFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {seasonalFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Audience Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=audience-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {audienceFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {audienceFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {audienceFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {audienceFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {audienceFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {audienceFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {audienceFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับความชัดของกลุ่มเป้าหมาย — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {audienceFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {audienceFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Hook Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=hook-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {hookFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {hookFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hookFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hookFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hookFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hookFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {hookFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับสไตล์เปิดคลิป — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {hookFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {hookFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            CTA Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=cta-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {ctaFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {ctaFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {ctaFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {ctaFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {ctaFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {ctaFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {ctaFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับสไตล์ปิดคลิป — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {ctaFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {ctaFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Hashtag Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=hashtag-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {hashtagFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {hashtagFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hashtagFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hashtagFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hashtagFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {hashtagFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {hashtagFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับมิกซ์แฮชแท็ก — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {hashtagFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}% · แท็ก avg ~{b.avgTagCount}
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {hashtagFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Tone Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=tone-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {toneFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {toneFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {toneFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {toneFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {toneFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">hard_push</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {toneFitLab.counts.hardPushSamples}
            </p>
          </div>
        </div>
        {toneFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับโทนน้ำเสียง — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {toneFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {toneFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Angle Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=angle-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {angleFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {angleFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {angleFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {angleFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {angleFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">flat</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {angleFitLab.counts.flatSamples}
            </p>
          </div>
        </div>
        {angleFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับมุมขาย — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {angleFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {angleFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Length Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=length-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {lengthFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {lengthFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {lengthFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {lengthFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {lengthFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ว่าง</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {lengthFitLab.counts.emptySamples}
            </p>
          </div>
        </div>
        {lengthFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับความยาวแคปชัน — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {lengthFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · ~{b.avgChars}{" "}
                  ตัวอักษร · CTR ~{(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {lengthFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Script Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=script-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {scriptFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {scriptFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {scriptFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {scriptFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {scriptFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">flat</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {scriptFitLab.counts.flatSamples}
            </p>
          </div>
        </div>
        {scriptFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับโครงสคริปต์ — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {scriptFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {scriptFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Proof Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=proof-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {proofFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {proofFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {proofFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {proofFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {proofFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">none</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {proofFitLab.counts.noneSamples}
            </p>
          </div>
        </div>
        {proofFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับหลักฐาน — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {proofFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {proofFitLab.disclaimer}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Offer Fit Lab
          </h2>
          <a
            href="/api/export?format=md&scope=offer-fit"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          {offerFitLab.summary}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {offerFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรดแล็บ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {offerFitLab.grade}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {offerFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงร้อน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {offerFitLab.counts.hot}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ขายแข็ง</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {offerFitLab.counts.hardPushSamples}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">none</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {offerFitLab.counts.noneSamples}
            </p>
          </div>
        </div>
        {offerFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-xs text-[var(--ink-soft)]">
            กรอกเมตริกด้านล่างเพื่อจัดอันดับมุมเสนอ — ไม่ใช่การันตียอดขาย
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
            {offerFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--ink)]">{b.bandLabel}</span>
                  {" · "}
                  คะแนน {b.score}/100 (n={b.samples}) · CTR ~
                  {(b.avgCtr * 100).toFixed(1)}%
                  <br />
                  {b.tip}
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {offerFitLab.disclaimer}
        </p>
      </section>

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

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Winner Playbook
          </h2>
          <a
            href="/api/export?format=md&scope=playbook"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{winnerPlaybook.summary}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">Keep doing</h3>
            {winnerPlaybook.keepDoing.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                ยังไม่มี keep — กรอกผลหลังโพสต์ก่อน
              </p>
            ) : (
              <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {winnerPlaybook.keepDoing.map((k) => (
                  <li key={k.productId}>
                    <span className="text-[var(--ink)]">{k.productName}</span>
                    <br />
                    {k.why}
                  </li>
                ))}
              </ul>
            )}
          </article>
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">Stop / พัก</h3>
            {winnerPlaybook.stopOrPause.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                ยังไม่มีคำแนะนำพัก
              </p>
            ) : (
              <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {winnerPlaybook.stopOrPause.map((s) => (
                  <li key={s.productId}>
                    <span className="text-[var(--ink)]">{s.productName}</span>
                    <br />
                    {s.why}
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {winnerPlaybook.hookTips.slice(0, 2).map((t) => (
            <li key={t}>Hook: {t}</li>
          ))}
          {winnerPlaybook.ctaTips.slice(0, 2).map((t) => (
            <li key={t}>CTA: {t}</li>
          ))}
          {winnerPlaybook.experiments.map((e) => (
            <li key={e.title}>
              ทดลอง: {e.title} — {e.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">{winnerPlaybook.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Weekly Review
          </h2>
          <a
            href="/api/export?format=md&scope=weekly-review"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{weeklyReview.summary}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ค่าคอมที่กรอก</p>
            <p className="text-lg text-[var(--sage-deep)]">
              ฿{weeklyReview.totals.commission.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">ออเดอร์</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {weeklyReview.totals.orders}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">CTR เฉลี่ย</p>
            <p className="text-lg text-[var(--sage-deep)]">
              ~{(weeklyReview.totals.avgCtr * 100).toFixed(1)}%
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">รอกรอกผล</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {weeklyReview.totals.missingMetrics}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">โพสต์เด่น</h3>
            {weeklyReview.topPosts.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                ยังไม่มีโพสต์เด่น
              </p>
            ) : (
              <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {weeklyReview.topPosts.map((p) => (
                  <li key={p.scheduleId}>
                    <span className="text-[var(--ink)]">{p.productName}</span> ·{" "}
                    {p.channelLabel}
                    <br />
                    {p.why}
                  </li>
                ))}
              </ul>
            )}
          </article>
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">โฟกัสสัปดาห์หน้า</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {weeklyReview.nextWeekFocus.map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--ink)]">{a.title}</span>
                  <br />
                  {a.detail}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {weeklyReview.dataGaps.slice(0, 3).map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">{weeklyReview.disclaimer}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
            Posting Hygiene
          </h2>
          <a
            href="/api/export?format=md&scope=hygiene"
            className="text-xs text-[var(--sage)] hover:underline"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">{postingHygiene.summary}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">เกรด</p>
            <p className="text-lg text-[var(--sage-deep)]">{postingHygiene.grade}</p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">คะแนน</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {postingHygiene.score}/100
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">สินค้าใช้บ่อย</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {postingHygiene.hotProducts.length}
            </p>
          </div>
          <div className="surface rounded-2xl p-3 text-sm">
            <p className="text-[var(--ink-soft)]">แคปชันใกล้ซ้ำ</p>
            <p className="text-lg text-[var(--sage-deep)]">
              {postingHygiene.nearDuplicates.length}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">อย่าโพสต์ / ชะลอ</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {postingHygiene.doNotPost.slice(0, 4).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </article>
          <article className="surface rounded-2xl p-4">
            <h3 className="font-medium">ทำก่อน</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {postingHygiene.actions.map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--ink)]">{a.title}</span>
                  <br />
                  {a.detail}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">{postingHygiene.disclaimer}</p>
      </section>
    </div>
  );
}
