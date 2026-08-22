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
