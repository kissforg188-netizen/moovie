import Link from "next/link";
import { BulkApproveButton } from "@/components/BulkApproveButton";
import { ImportPanel } from "@/components/ImportPanel";
import { LoginStatusPanel } from "@/components/LoginStatusPanel";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { mergeAccounts } from "@/lib/accounts";
import { INCOME_DISCLAIMER } from "@/lib/disclosure";
import { channelLabel } from "@/lib/schedule";
import { currentSeasonHint } from "@/lib/seasonality";
import { getDashboardSnapshot } from "@/lib/workflow";
import { todayISO } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const { db, ranked, todaySchedule, latestMorning, latestEvening } =
    await getDashboardSnapshot();
  const date = todayISO();
  const season = currentSeasonHint();
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

      <WorkflowButtons />

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
