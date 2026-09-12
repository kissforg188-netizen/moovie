import Link from "next/link";
import { BulkApproveButton } from "@/components/BulkApproveButton";
import { ImportPanel } from "@/components/ImportPanel";
import { LoginStatusPanel } from "@/components/LoginStatusPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { mergeAccounts } from "@/lib/accounts";
import { INCOME_DISCLAIMER } from "@/lib/disclosure";
import { channelLabel } from "@/lib/schedule";
import { currentSeasonHint } from "@/lib/seasonality";
import { resolveSettings } from "@/lib/settings";
import { getDashboardSnapshot } from "@/lib/workflow";
import { todayISO } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const {
    db,
    ranked,
    todaySchedule,
    latestMorning,
    latestEvening,
    experiment,
    digest,
    tomorrowPlan,
    approveQueue,
    winnerPlaybook,
    weeklyReview,
    postingHygiene,
    resultsIntake,
    creativePerformance,
    publishQueue,
    softRoiLab,
    channelFitLab,
    categoryFitLab,
    priceBandFitLab,
    commissionBandFitLab,
    painClarityFitLab,
    videoEaseFitLab,
    seasonalFitLab,
    audienceFitLab,
    hookFitLab,
    ctaFitLab,
    hashtagFitLab,
    toneFitLab,
    angleFitLab,
    lengthFitLab,
    scriptFitLab,
    proofFitLab,
    offerFitLab,
    benefitFitLab,
  } = await getDashboardSnapshot();
  const date = todayISO();
  const season = currentSeasonHint();
  const settings = resolveSettings(db);
  const accounts = mergeAccounts(db.accounts);
  const logs = (db.automationLogs ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  return (
    <div className="space-y-8">
      <section className="fade-up relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,rgba(63,111,92,0.14),rgba(232,220,200,0.4)_50%,rgba(255,255,255,0.75))] px-6 py-10 md:px-10">
        <p className="text-sm tracking-[0.18em] text-[var(--ink-soft)] uppercase">
          Automation Center · Draft only
        </p>
        <h1 className="brand-mark mt-2 text-5xl text-[var(--sage-deep)] md:text-6xl">
          ศูนย์อัตโนมัติ
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--ink-soft)]">
          รัน morning/evening, นำเข้าสินค้า, อนุมัติ draft เป็นชุด และดู log —
          ระบบไม่โพสต์จริงจนกว่าคุณจะ Approve แล้วโพสต์ด้วยมือ
        </p>
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          ฤดูกาลตอนนี้: <span className="text-[var(--sage-deep)]">{season.label}</span>
        </p>
      </section>

      <LoginStatusPanel initialAccounts={accounts} />

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Daily Action Digest
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{digest.summary}</p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href={`/api/export?format=md&scope=digest`}
          >
            Export Markdown
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">Draft รอตรวจ</p>
            <p className="text-xl text-[var(--sage-deep)]">{digest.counts.draftPending}</p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">บล็อก Approve</p>
            <p className="text-xl text-[var(--sage-deep)]">{digest.counts.approveBlocked}</p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">รอโพสต์มือ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {digest.counts.approvedWaitingPost}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">รอกรอกผล</p>
            <p className="text-xl text-[var(--sage-deep)]">{digest.counts.missingMetrics}</p>
          </div>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-soft)]">
          {digest.actions.slice(0, 8).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">
                [{a.priority === "now" ? "ตอนนี้" : a.priority === "soon" ? "ถัดไป" : "ภายหลัง"}]
              </span>{" "}
              {a.href ? (
                <Link className="underline underline-offset-2" href={a.href}>
                  {a.title}
                </Link>
              ) : (
                a.title
              )}
              <p className="mt-0.5 text-xs">{a.detail}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--ink-soft)]">{digest.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Approve Priority Queue
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {approveQueue.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=approve-queue"
          >
            Export Markdown
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">พร้อม Approve</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {approveQueue.counts.ready}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ควรแก้ก่อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {approveQueue.counts.fixFirst}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">บล็อก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {approveQueue.counts.blocked}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">Draft ทั้งหมด</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {approveQueue.counts.total}
            </p>
          </div>
        </div>
        {approveQueue.items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มี draft ในคิว — รัน Morning แล้วกลับมาตรวจที่นี่หรือที่{" "}
            <Link className="underline underline-offset-2" href="/calendar">
              ตารางโพสต์
            </Link>
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {approveQueue.items.slice(0, 6).map((item) => (
              <li key={item.scheduleId}>
                <span className="text-[var(--sage-deep)]">
                  [
                  {item.band === "ready"
                    ? "พร้อม"
                    : item.band === "fix_first"
                      ? "แก้ก่อน"
                      : "บล็อก"}
                  ] {item.suggestedTime} · {item.productName}
                </span>
                <p className="mt-0.5 text-xs">
                  {item.channelLabelTh} · ลำดับ {item.priority}/100 · คุณภาพ{" "}
                  {item.qualityGrade}
                </p>
                <p className="mt-0.5 text-xs">{item.nextAction}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          {approveQueue.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Manual Publish Queue
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {publishQueue.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=publish"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดคิว {publishQueue.grade} · {publishQueue.score}/100 · เวลา{" "}
          {publishQueue.nowHm} (Asia/Bangkok)
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ค้าง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {publishQueue.counts.overdue}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ถึงเวลา</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {publishQueue.counts.dueNow}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">วันนี้</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {publishQueue.counts.today}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ทั้งหมด</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {publishQueue.counts.total}
            </p>
          </div>
        </div>
        {publishQueue.items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีชิ้นที่ Approve — ตรวจคิวด้านบนแล้ว Approve ก่อน ระบบจะไม่โพสต์ให้อัตโนมัติ
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {publishQueue.items.slice(0, 6).map((item) => (
              <li key={item.scheduleId}>
                <span className="text-[var(--sage-deep)]">
                  [
                  {item.band === "overdue"
                    ? "ค้าง"
                    : item.band === "due_now"
                      ? "ถึงเวลา"
                      : item.band === "today"
                        ? "วันนี้"
                        : "เร็วๆ นี้"}
                  ] {item.date} {item.suggestedTime} · {item.productName}
                </span>
                <p className="mt-0.5 text-xs">
                  {item.channelLabelTh} · ลำดับ {item.priority}/100 · pack{" "}
                  {item.packReady ? "พร้อม" : "ยังไม่พร้อม"}
                </p>
                <p className="mt-0.5 text-xs">{item.nextAction}</p>
              </li>
            ))}
          </ol>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {publishQueue.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {publishQueue.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Soft ROI Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {softRoiLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=roi"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {softRoiLab.grade} · {softRoiLab.score}/100 · หน้าต่าง{" "}
          {softRoiLab.windowDays} วัน · CTR ~{(softRoiLab.baseline.avgCtr * 100).toFixed(1)}%
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {softRoiLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">น่าลอง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {softRoiLab.counts.promising}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีต้นทุน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {softRoiLab.counts.spendTracked}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ค่าคอมเฉลี่ย</p>
            <p className="text-xl text-[var(--sage-deep)]">
              ฿{softRoiLab.baseline.avgCommissionPerPost}
            </p>
          </div>
        </div>
        {softRoiLab.products.filter((p) => p.samples > 0).length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกพอสร้างช่วงทดลอง — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {softRoiLab.products
              .filter((p) => p.samples > 0)
              .slice(0, 5)
              .map((p) => (
                <li key={p.productId}>
                  <span className="text-[var(--sage-deep)]">
                    [{p.band === "promising"
                      ? "น่าลอง"
                      : p.band === "cold"
                        ? "อ่อน"
                        : p.band === "watch"
                          ? "เฝ้าดู"
                          : "ยังไม่มีข้อมูล"}
                    ] {p.productName}
                  </span>
                  <p className="mt-0.5 text-xs">
                    ช่วงทดลอง ฿{p.rangeLow}–{p.rangeHigh}/โพสต์ · n={p.samples} ·{" "}
                    {p.confidence === "solid"
                      ? "หนาขึ้น"
                      : p.confidence === "ok"
                        ? "พอใช้"
                        : "ข้อมูลบาง"}
                    {p.avgRoi != null
                      ? ` · ROI ~${(p.avgRoi * 100).toFixed(0)}%`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs">{p.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {softRoiLab.projections.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คาดการณ์คิววันนี้ (ทดลอง)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {softRoiLab.projections.slice(0, 4).map((pr) => (
                <li key={pr.scheduleId}>
                  {pr.productName} · {pr.channelLabel}: ~฿{pr.projectedMid} [
                  {pr.projectedLow}–{pr.projectedHigh}]
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {softRoiLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {softRoiLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Channel Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {channelFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=channel-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {channelFitLab.grade} · {channelFitLab.score}/100 · หน้าต่าง{" "}
          {channelFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">{channelFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {channelFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่องมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {channelFitLab.counts.channelsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">แข็งแรง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {channelFitLab.counts.strong}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {channelFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {channelFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายช่องทาง — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {channelFitLab.channels
              .filter((c) => c.samples > 0)
              .slice(0, 4)
              .map((c) => (
                <li key={c.channel}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {c.band === "strong"
                      ? "แข็งแรง"
                      : c.band === "weak"
                        ? "อ่อน"
                        : c.band === "ok"
                          ? "พอใช้"
                          : "ยังไม่มีข้อมูล"}
                    ] {c.channelLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {c.score}/100 · n={c.samples} · CTR ~
                    {(c.avgCtr * 100).toFixed(1)}% · ค่าคอมเฉลี่ย ฿
                    {c.avgCommission}
                  </p>
                  <p className="mt-0.5 text-xs">{c.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {channelFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {channelFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {channelFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {channelFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Category Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {categoryFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=category-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {categoryFitLab.grade} · {categoryFitLab.score}/100 · หน้าต่าง{" "}
          {categoryFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">{categoryFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {categoryFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">หมวดมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {categoryFitLab.counts.categoriesWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {categoryFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {categoryFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {categoryFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายหมวด — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {categoryFitLab.categories
              .filter((c) => c.samples > 0)
              .slice(0, 4)
              .map((c) => (
                <li key={c.category}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {c.band === "hot"
                      ? "ร้อน"
                      : c.band === "cold"
                        ? "เย็น"
                        : c.band === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {c.categoryLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {c.score}/100 · n={c.samples} · CTR ~
                    {(c.avgCtr * 100).toFixed(1)}% · ค่าคอมเฉลี่ย ฿
                    {c.avgCommission}
                  </p>
                  <p className="mt-0.5 text-xs">{c.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {categoryFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {categoryFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentCategory} → {s.suggestedCategory} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {categoryFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {categoryFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Price Band Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {priceBandFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=price-band"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {priceBandFitLab.grade} · {priceBandFitLab.score}/100 · หน้าต่าง{" "}
          {priceBandFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">{priceBandFitLab.mixTip}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {priceBandFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {priceBandFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {priceBandFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {priceBandFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {priceBandFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายช่วงราคา — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {priceBandFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · ค่าคอมเฉลี่ย ฿
                    {b.avgCommission}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {priceBandFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {priceBandFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {priceBandFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {priceBandFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Commission Band Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {commissionBandFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=commission-band"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {commissionBandFitLab.grade} · {commissionBandFitLab.score}
          /100 · หน้าต่าง {commissionBandFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {commissionBandFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {commissionBandFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {commissionBandFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายช่วงคอมฯ — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {commissionBandFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · ค่าคอมเฉลี่ย ฿
                    {b.avgCommission}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {commissionBandFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {commissionBandFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {commissionBandFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {commissionBandFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Pain Clarity Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {painClarityFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=pain-clarity"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {painClarityFitLab.grade} · {painClarityFitLab.score}
          /100 · หน้าต่าง {painClarityFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {painClarityFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {painClarityFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {painClarityFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {painClarityFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {painClarityFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {painClarityFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายระดับ pain — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {painClarityFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · pain avg ~
                    {b.avgPainScore}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {painClarityFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {painClarityFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {painClarityFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {painClarityFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Video Ease Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {videoEaseFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=video-ease"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {videoEaseFitLab.grade} · {videoEaseFitLab.score}
          /100 · หน้าต่าง {videoEaseFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {videoEaseFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {videoEaseFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {videoEaseFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายระดับความง่ายวิดีโอ — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {videoEaseFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · videoEase avg ~
                    {b.avgVideoEase}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {videoEaseFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {videoEaseFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {videoEaseFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {videoEaseFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Seasonal Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {seasonalFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=seasonal-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {seasonalFitLab.grade} · {seasonalFitLab.score}
          /100 · หน้าต่าง {seasonalFitLab.windowDays} วัน · ปฏิทิน{" "}
          {seasonalFitLab.seasonLabel}
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {seasonalFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {seasonalFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {seasonalFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {seasonalFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {seasonalFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {seasonalFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายระดับซีซัน — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {seasonalFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · seasonalScore avg ~
                    {b.avgSeasonalScore}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {seasonalFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {seasonalFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {seasonalFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {seasonalFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Audience Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {audienceFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=audience-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {audienceFitLab.grade} · {audienceFitLab.score}
          /100 · หน้าต่าง {audienceFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {audienceFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {audienceFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {audienceFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {audienceFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {audienceFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {audienceFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายระดับกลุ่มเป้าหมาย — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {audienceFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · audienceScore avg ~
                    {b.avgAudienceScore}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {audienceFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {audienceFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {audienceFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {audienceFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Hook Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {hookFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=hook-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {hookFitLab.grade} · {hookFitLab.score}
          /100 · หน้าต่าง {hookFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {hookFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hookFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">สไตล์มีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hookFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hookFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hookFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {hookFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายสไตล์ hook — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {hookFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · hookIndex avg ~
                    {b.avgHookIndex}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {hookFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {hookFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {hookFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {hookFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              CTA Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {ctaFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=cta-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {ctaFitLab.grade} · {ctaFitLab.score}
          /100 · หน้าต่าง {ctaFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {ctaFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {ctaFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">สไตล์มีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {ctaFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {ctaFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {ctaFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {ctaFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายสไตล์ CTA — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {ctaFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · ctaIndex avg ~
                    {b.avgCtaIndex}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {ctaFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {ctaFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {ctaFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {ctaFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Hashtag Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {hashtagFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=hashtag-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {hashtagFitLab.grade} · {hashtagFitLab.score}
          /100 · หน้าต่าง {hashtagFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {hashtagFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hashtagFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">สไตล์มีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hashtagFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hashtagFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คำแนะนำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {hashtagFitLab.counts.suggestions}
            </p>
          </div>
        </div>
        {hashtagFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายสไตล์แฮชแท็ก — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {hashtagFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}% · แท็ก avg ~
                    {b.avgTagCount}
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {hashtagFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {hashtagFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {hashtagFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {hashtagFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Tone Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {toneFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=tone-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {toneFitLab.grade} · {toneFitLab.score}
          /100 · หน้าต่าง {toneFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {toneFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {toneFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">โทนมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {toneFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {toneFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">hard_push</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {toneFitLab.counts.hardPushSamples}
            </p>
          </div>
        </div>
        {toneFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายโทนน้ำเสียง — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {toneFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {toneFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {toneFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {toneFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {toneFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Angle Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {angleFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=angle-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {angleFitLab.grade} · {angleFitLab.score}
          /100 · หน้าต่าง {angleFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {angleFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {angleFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มุมมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {angleFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {angleFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">flat</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {angleFitLab.counts.flatSamples}
            </p>
          </div>
        </div>
        {angleFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายมุมขาย — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {angleFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {angleFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {angleFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {angleFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {angleFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Length Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {lengthFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=length-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {lengthFitLab.grade} · {lengthFitLab.score}
          /100 · หน้าต่าง {lengthFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {lengthFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {lengthFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ช่วงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {lengthFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {lengthFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ว่าง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {lengthFitLab.counts.emptySamples}
            </p>
          </div>
        </div>
        {lengthFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายความยาวแคปชัน — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {lengthFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · ~{b.avgChars}{" "}
                    ตัวอักษร · CTR ~{(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {lengthFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {lengthFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {lengthFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {lengthFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Script Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {scriptFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=script-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {scriptFitLab.grade} · {scriptFitLab.score}
          /100 · หน้าต่าง {scriptFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {scriptFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {scriptFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">โครงมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {scriptFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {scriptFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">flat</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {scriptFitLab.counts.flatSamples}
            </p>
          </div>
        </div>
        {scriptFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายโครงสคริปต์ — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {scriptFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {scriptFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {scriptFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {scriptFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {scriptFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Proof Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {proofFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=proof-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {proofFitLab.grade} · {proofFitLab.score}
          /100 · หน้าต่าง {proofFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {proofFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {proofFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">หลักฐานมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {proofFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {proofFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">none</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {proofFitLab.counts.noneSamples}
            </p>
          </div>
        </div>
        {proofFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายหลักฐาน — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {proofFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {proofFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {proofFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {proofFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {proofFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Offer Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {offerFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=offer-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {offerFitLab.grade} · {offerFitLab.score}
          /100 · หน้าต่าง {offerFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {offerFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {offerFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มุมมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {offerFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {offerFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ขายแข็ง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {offerFitLab.counts.hardPushSamples}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">none</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {offerFitLab.counts.noneSamples}
            </p>
          </div>
        </div>
        {offerFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายมุมเสนอ — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {offerFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {offerFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {offerFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {offerFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {offerFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Benefit Fit Lab
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {benefitFitLab.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=benefit-fit"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรดแล็บ {benefitFitLab.grade} · {benefitFitLab.score}
          /100 · หน้าต่าง {benefitFitLab.windowDays} วัน
        </p>
        <p className="text-sm text-[var(--sage-deep)]">
          {benefitFitLab.mixTip}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {benefitFitLab.counts.postsWithMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มุมมีข้อมูล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {benefitFitLab.counts.bandsWithData}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ร้อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {benefitFitLab.counts.hot}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">เคลมเกิน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {benefitFitLab.counts.hypeClaimSamples}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">none</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {benefitFitLab.counts.noneSamples}
            </p>
          </div>
        </div>
        {benefitFitLab.counts.postsWithMetrics === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีเมตริกรายมุมประโยชน์ — โพสต์มือแล้วกรอกผลที่ /results
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {benefitFitLab.bands
              .filter((b) => b.samples > 0)
              .slice(0, 4)
              .map((b) => (
                <li key={b.band}>
                  <span className="text-[var(--sage-deep)]">
                    [
                    {b.status === "hot"
                      ? "ร้อน"
                      : b.status === "cold"
                        ? "เย็น"
                        : b.status === "steady"
                          ? "นิ่ง"
                          : "ยังไม่มีข้อมูล"}
                    ] {b.bandLabel}
                  </span>
                  <p className="mt-0.5 text-xs">
                    คะแนน {b.score}/100 · n={b.samples} · CTR ~
                    {(b.avgCtr * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs">{b.tip}</p>
                </li>
              ))}
          </ol>
        )}
        {benefitFitLab.suggestions.length > 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3">
            <p className="text-sm text-[var(--sage-deep)]">
              คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {benefitFitLab.suggestions.slice(0, 4).map((s) => (
                <li key={s.scheduleId}>
                  {s.productName}: {s.currentLabel} → {s.suggestedLabel} —{" "}
                  {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {benefitFitLab.actions.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="text-[var(--sage-deep)]">{a.title}</span> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">
          {benefitFitLab.disclaimer}
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Tomorrow Plan
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {tomorrowPlan.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href={`/api/export?format=md&scope=tomorrow`}
          >
            Export Markdown
          </a>
        </div>
        {tomorrowPlan.picks.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีสินค้าพอจัดแผน — เพิ่มของที่ /products แล้วรัน Evening
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--ink-soft)]">
            {tomorrowPlan.picks.map((p) => (
              <li key={p.productId}>
                <span className="text-[var(--sage-deep)]">{p.productName}</span>
                {p.filmFirst ? " · ถ่ายก่อน" : ""}
                <p className="mt-0.5 text-xs">{p.reason}</p>
                <p className="mt-0.5 text-xs">
                  Hook: {p.suggestedHook}
                </p>
                <p className="mt-0.5 text-xs">มุมขาย: {p.suggestedAngle}</p>
              </li>
            ))}
          </ol>
        )}
        {tomorrowPlan.fatigueWarnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
            {tomorrowPlan.fatigueWarnings.map((w) => (
              <li key={w}>กันสแปม: {w}</li>
            ))}
          </ul>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {tomorrowPlan.checklist.slice(0, 5).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">{tomorrowPlan.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Winner Playbook
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {winnerPlaybook.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=playbook"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          หน้าต่าง {winnerPlaybook.windowDays} วัน · โพสต์ที่มีเมตริก{" "}
          {winnerPlaybook.samplePosts}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">Keep doing</h3>
            {winnerPlaybook.keepDoing.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มี keep — กรอกผลหลังโพสต์ก่อน
              </p>
            ) : (
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {winnerPlaybook.keepDoing.slice(0, 3).map((k) => (
                  <li key={k.productId}>
                    <span className="text-[var(--sage-deep)]">{k.productName}</span>
                    <p className="mt-0.5">{k.why}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">Stop / พัก</h3>
            {winnerPlaybook.stopOrPause.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มีคำแนะนำพัก
              </p>
            ) : (
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {winnerPlaybook.stopOrPause.slice(0, 3).map((s) => (
                  <li key={s.productId}>
                    <span className="text-[var(--sage-deep)]">{s.productName}</span>
                    <p className="mt-0.5">{s.why}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
          {winnerPlaybook.experiments.slice(0, 3).map((e) => (
            <li key={e.title}>
              <span className="text-[var(--sage-deep)]">{e.title}</span> —{" "}
              {e.detail}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-soft)]">{winnerPlaybook.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Weekly Review
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {weeklyReview.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=weekly-review"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          {weeklyReview.fromDate} → {weeklyReview.date} ·{" "}
          {weeklyReview.windowDays} วัน · มีเมตริก{" "}
          {weeklyReview.totals.withMetrics}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ค่าคอมที่กรอก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              ฿{weeklyReview.totals.commission.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ออเดอร์</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {weeklyReview.totals.orders}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">CTR เฉลี่ย</p>
            <p className="text-xl text-[var(--sage-deep)]">
              ~{(weeklyReview.totals.avgCtr * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">รอกรอกผล</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {weeklyReview.totals.missingMetrics}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">โพสต์เด่น</h3>
            {weeklyReview.topPosts.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มีโพสต์เด่น — กรอกผลหลังโพสต์ก่อน
              </p>
            ) : (
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {weeklyReview.topPosts.map((p) => (
                  <li key={p.scheduleId}>
                    <span className="text-[var(--sage-deep)]">
                      {p.productName}
                    </span>{" "}
                    · {p.channelLabel}
                    <p className="mt-0.5">{p.why}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">โฟกัสสัปดาห์หน้า</h3>
            <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {weeklyReview.nextWeekFocus.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--sage-deep)]">{a.title}</span>
                  <p className="mt-0.5">{a.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">{weeklyReview.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Posting Hygiene
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {postingHygiene.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=hygiene"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรด {postingHygiene.grade} · {postingHygiene.score}/100 · คิววันนี้{" "}
          {postingHygiene.todayActive}/{postingHygiene.maxPostsPerDay} · คูลดาวน์{" "}
          {postingHygiene.cooldownDays} วัน
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">เกรด</p>
            <p className="text-xl text-[var(--sage-deep)]">{postingHygiene.grade}</p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">เหลือที่ว่าง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {postingHygiene.todayRoomLeft}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">คู่คูลดาวน์</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {postingHygiene.coolingPairs.length}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">แคปชันใกล้ซ้ำ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {postingHygiene.nearDuplicates.length}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">อย่าโพสต์ / ชะลอ</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {postingHygiene.doNotPost.slice(0, 4).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">ทำก่อน</h3>
            <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {postingHygiene.actions.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--sage-deep)]">{a.title}</span>
                  <p className="mt-0.5">{a.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">{postingHygiene.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Results Intake
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {resultsIntake.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=intake"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรด {resultsIntake.grade} · {resultsIntake.score}/100 · หน้าต่าง{" "}
          {resultsIntake.fromDate} → {resultsIntake.date}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ต้องสนใจ</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {resultsIntake.counts.needsAttention}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ค้าง</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {resultsIntake.counts.overdue}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">วันนี้</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {resultsIntake.counts.today}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">ครบแล้ว</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {resultsIntake.counts.complete}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">คิวกรอกผล</h3>
            {resultsIntake.rows.filter((r) => r.band !== "complete").length ===
            0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ไม่มีรายการค้าง — ผลครบหรือยังไม่มีโพสต์
              </p>
            ) : (
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {resultsIntake.rows
                  .filter((r) => r.band !== "complete")
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.scheduleId}>
                      <span className="text-[var(--sage-deep)]">
                        {r.productName}
                      </span>{" "}
                      · {r.channelLabel} · {r.band}
                      <p className="mt-0.5">{r.tip}</p>
                    </li>
                  ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">ทำก่อน</h3>
            <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {resultsIntake.actions.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--sage-deep)]">{a.title}</span>
                  <p className="mt-0.5">{a.detail}</p>
                </li>
              ))}
            </ol>
            <a
              className="mt-3 inline-block text-sm text-[var(--sage-deep)] underline underline-offset-2"
              href="/results"
            >
              ไปหน้ากรอกผล →
            </a>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">{resultsIntake.disclaimer}</p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              Creative Performance
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {creativePerformance.summary}
            </p>
          </div>
          <a
            className="text-sm text-[var(--sage-deep)] underline underline-offset-2"
            href="/api/export?format=md&scope=creative"
          >
            Export Markdown
          </a>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          เกรด {creativePerformance.grade} · {creativePerformance.score}/100 ·
          หน้าต่าง {creativePerformance.fromDate} → {creativePerformance.date}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มีเมตริก</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {creativePerformance.counts.withMetrics}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">Hook</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {creativePerformance.counts.uniqueHooks}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มุมเด่น</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {creativePerformance.counts.leaders}
            </p>
          </div>
          <div className="rounded-xl bg-[rgba(63,111,92,0.08)] px-3 py-2 text-sm">
            <p className="text-[var(--ink-soft)]">มุมอ่อน</p>
            <p className="text-xl text-[var(--sage-deep)]">
              {creativePerformance.counts.weak}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">Hook เด่น</h3>
            {creativePerformance.hooks.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                ยังไม่มีข้อมูล — กรอกผลโพสต์ก่อน
              </p>
            ) : (
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
                {creativePerformance.hooks.slice(0, 4).map((h) => (
                  <li key={`${h.fingerprint}-${h.index}`}>
                    <span className="text-[var(--sage-deep)]">
                      #{h.index + 1} [{h.band}]
                    </span>{" "}
                    “{h.label}” · n={h.samples}
                    <p className="mt-0.5">{h.tip}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-sm text-[var(--sage-deep)]">ลองต่อไป / พักซ้ำ</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[var(--ink-soft)]">
              {creativePerformance.tryNext.slice(0, 2).map((t) => (
                <li key={t}>{t}</li>
              ))}
              {creativePerformance.avoidReuse.slice(0, 2).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-[var(--ink-soft)]">
              {creativePerformance.actions.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="text-[var(--sage-deep)]">{a.title}</span>
                  <p className="mt-0.5">{a.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          {creativePerformance.disclaimer}
        </p>
      </section>

      <WorkflowButtons />

      <SettingsPanel
        maxPostsPerDay={settings.maxPostsPerDay}
        cooldownDays={settings.cooldownDays}
        staleDraftDays={settings.staleDraftDays}
      />

      {db.learning ? (
        <section className="surface rounded-2xl p-5 space-y-2">
          <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
            Learning จากเย็นล่าสุด
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            วันที่แหล่งข้อมูล: {db.learning.sourceDate}
            {db.learning.preferredChannel
              ? ` · ช่องทางทดลอง: ${db.learning.preferredChannel}`
              : ""}
            {db.learning.underperformerProductIds?.length
              ? ` · soft penalty สินค้าอ่อน ${db.learning.underperformerProductIds.length} ชิ้น`
              : ""}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
            {db.learning.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-xs text-[var(--ink-soft)]">
            ใช้ bias อ่อน ๆ ใน Morning เท่านั้น — ไม่โพสต์อัตโนมัติ ไม่การันตีรายได้
          </p>
        </section>
      ) : null}

      <section className="surface rounded-2xl p-5 space-y-3">
        <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
          แผนทดลองวันนี้
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
          {experiment.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {experiment.abTests.length > 0 ? (
          <div className="space-y-2">
            {experiment.abTests.map((t) => (
              <div
                key={`${t.productName}-${t.channel}`}
                className="rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--sage-deep)]">
                  {t.productName} · {t.channel}
                </p>
                <p className="mt-1 text-[var(--ink-soft)]">หลัก: {t.primaryHook}</p>
                <p className="text-[var(--ink-soft)]">สำรอง: {t.alternateHook}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">{t.note}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3 text-xs">
        <a
          href="/api/export?format=md&scope=packs"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Content Packs (.md)
        </a>
        <a
          href="/api/export?format=md&scope=today"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export ตารางวันนี้ (.md)
        </a>
        <a
          href="/api/export?format=md&scope=approved"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Checklist ที่อนุมัติแล้ว (.md)
        </a>
        <a
          href="/api/export?format=md&scope=experiments"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export แผนทดลอง (.md)
        </a>
        <a
          href="/api/export?format=md&scope=filming"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export คิวถ่ายวิดีโอ (.md)
        </a>
        <a
          href="/api/export?format=md&scope=posting"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Posting Packs (.md)
        </a>
        <a
          href="/api/export?format=md&scope=approve-queue"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export คิว Approve (.md)
        </a>
        <a
          href="/api/export?format=md&scope=playbook"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Playbook (.md)
        </a>
        <a
          href="/api/export?format=md&scope=weekly-review"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Weekly Review (.md)
        </a>
        <a
          href="/api/export?format=md&scope=hygiene"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Posting Hygiene (.md)
        </a>
        <a
          href="/api/export?format=md&scope=creative"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Creative Performance (.md)
        </a>
        <a
          href="/api/export?format=md&scope=publish"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Publish Queue (.md)
        </a>
        <a
          href="/api/export?format=md&scope=roi"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Soft ROI Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=channel-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Channel Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=category-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Category Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=price-band"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Price Band Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=commission-band"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Commission Band Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=pain-clarity"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Pain Clarity Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=video-ease"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Video Ease Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=seasonal-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Seasonal Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=audience-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Audience Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=hook-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Hook Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=cta-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export CTA Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=hashtag-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Hashtag Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=tone-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Tone Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=angle-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Angle Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=length-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Length Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=script-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Script Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=proof-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Proof Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=offer-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Offer Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=md&scope=benefit-fit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Benefit Fit Lab (.md)
        </a>
        <a
          href="/api/export?format=csv&scope=schedule"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export Schedule CSV
        </a>
        <a
          href="/api/export?format=json"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--sage-deep)] hover:bg-[var(--mist)]"
        >
          Export JSON
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ImportPanel />

        <div className="surface rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
              คิววันนี้ ({date})
            </h2>
            <BulkApproveButton date={date} />
          </div>
          {todaySchedule.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              ยังไม่มี draft — กดรัน Morning workflow
            </p>
          ) : (
            <ul className="space-y-3">
              {todaySchedule.map((post) => {
                const product = db.products.find((p) => p.id === post.productId);
                return (
                  <li
                    key={post.id}
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-[var(--sage-deep)]">
                        {post.suggestedTime} · {channelLabel(post.channel)}
                      </span>
                      <span className="rounded-md bg-[var(--mist)] px-2 py-0.5 text-xs">
                        {post.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--ink-soft)]">
                      {product?.name ?? post.productId}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/calendar"
            className="inline-block text-sm text-[var(--sage)] hover:underline"
          >
            เปิดตารางเต็ม →
          </Link>
        </div>
      </div>

      <section className="surface rounded-2xl p-5">
        <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
          Top 5 ที่ระบบแนะนำ
        </h2>
        <ol className="mt-3 space-y-2 text-sm">
          {ranked.map((r, i) => (
            <li key={r.product.id} className="flex justify-between gap-3">
              <span>
                {i + 1}. {r.product.name}{" "}
                <span className="text-[var(--ink-soft)]">({r.product.category})</span>
              </span>
              <span className="text-[var(--sage-deep)]">{r.score.total}</span>
            </li>
          ))}
          {ranked.length === 0 && (
            <li className="text-[var(--ink-soft)]">ยังไม่มีสินค้า</li>
          )}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="surface rounded-2xl p-5">
          <h3 className="brand-mark text-xl text-[var(--sage-deep)]">สรุปเช้าล่าสุด</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {latestMorning?.summary ?? "ยังไม่รัน morning"}
          </p>
          {latestMorning && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--ink-soft)] space-y-1">
              {latestMorning.recommendations.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="surface rounded-2xl p-5">
          <h3 className="brand-mark text-xl text-[var(--sage-deep)]">สรุปเย็นล่าสุด</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {latestEvening?.summary ?? "ยังไม่รัน evening"}
          </p>
          {latestEvening && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--ink-soft)] space-y-1">
              {latestEvening.recommendations.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="surface rounded-2xl p-5">
        <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">Automation logs</h2>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">ยังไม่มี log</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-[var(--ink-soft)]">
                <tr>
                  <th className="py-1 pr-2">เวลา</th>
                  <th className="py-1 pr-2">งาน</th>
                  <th className="py-1 pr-2">สถานะ</th>
                  <th className="py-1">ข้อความ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {log.createdAt.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2 pr-2">{log.jobType}</td>
                    <td className="py-2 pr-2">{log.status}</td>
                    <td className="py-2 text-[var(--ink-soft)]">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--ink-soft)]">{INCOME_DISCLAIMER}</p>
    </div>
  );
}
