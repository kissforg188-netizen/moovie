"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOGIN_TIMELINE, statusLabel } from "@/lib/accounts";
import type { AccountReadyStatus, AccountStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: AccountReadyStatus; label: string }[] = [
  { value: "not_ready", label: "ยังไม่พร้อม" },
  { value: "ready", label: "พร้อมใช้ (มีบัญชี)" },
  { value: "logged_in_today", label: "ล็อกอินวันนี้แล้ว" },
];

function tone(status: AccountReadyStatus): string {
  if (status === "logged_in_today") return "bg-emerald-100 text-emerald-900";
  if (status === "ready") return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-900";
}

export function LoginStatusPanel({
  initialAccounts,
}: {
  initialAccounts: AccountStatus[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function setStatus(key: string, status: AccountReadyStatus) {
    setBusyKey(key);
    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, status }),
    });
    const data = await res.json();
    setBusyKey(null);
    if (data.accounts) {
      setAccounts(data.accounts);
      router.refresh();
    }
  }

  const byKey = new Map(accounts.map((a) => [a.key, a]));
  const readyCount = accounts.filter((a) => a.status !== "not_ready").length;

  return (
    <section className="surface fade-up rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="brand-mark text-2xl text-[var(--sage-deep)]">
            Login ตอนไหน · สถานะบัญชี
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            กดลิงก์ด้านล่างเพื่อไป Login/ผูกบัญชีบนแพลตฟอร์มจริง แล้วกลับมาอัปเดตสถานะ
            ({readyCount}/{accounts.length} พร้อม)
          </p>
        </div>
      </div>

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {LOGIN_TIMELINE.map((item) => {
          const related = item.accounts
            .map((k) => byKey.get(k))
            .filter(Boolean) as AccountStatus[];
          const allOk =
            related.length > 0 &&
            related.every((a) => a.status !== "not_ready");
          return (
            <li
              key={item.step}
              className="rounded-xl border border-[var(--line)] bg-white/70 p-3"
            >
              <p className="text-xs tracking-wide text-[var(--ink-soft)]">
                ขั้นที่ {item.step}
                {related.length > 0 && (
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 ${
                      allOk
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-rose-100 text-rose-900"
                    }`}
                  >
                    {allOk ? "พร้อม" : "ต้อง login"}
                  </span>
                )}
                {related.length === 0 && (
                  <span className="ml-2 rounded bg-[var(--mist)] px-1.5 py-0.5">
                    ไม่ต้อง login
                  </span>
                )}
              </p>
              <p className="mt-1 font-medium text-[var(--sage-deep)]">
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">
                {item.detail}
              </p>
              {related.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {related.map((acc) => (
                    <a
                      key={acc.key}
                      href={acc.loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-[var(--sage-deep)] px-2 py-1 text-[11px] text-white hover:bg-[var(--sage)]"
                    >
                      {acc.loginCta} ↗
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((account) => (
          <article
            key={account.key}
            className="rounded-xl border border-[var(--line)] bg-white/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-[var(--sage-deep)]">
                  {account.label}
                </h3>
                <p className="mt-1 text-xs text-[var(--coral)]">
                  Login ตอน: {account.whenToLogin}
                </p>
              </div>
              <span
                className={`rounded-md px-2 py-1 text-xs font-medium ${tone(account.status)}`}
              >
                {statusLabel(account.status)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {account.purpose}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={account.loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[var(--sage)] px-3 py-1.5 text-xs text-white hover:bg-[var(--sage-deep)]"
              >
                {account.loginCta} ↗
              </a>
              {account.signupUrl && (
                <a
                  href={account.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-[var(--line)] bg-white/90 px-3 py-1.5 text-xs hover:bg-[var(--mist)]"
                >
                  สมัคร / ผูกบัญชี ↗
                </a>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busyKey === account.key || account.status === opt.value}
                  onClick={() => setStatus(account.key, opt.value)}
                  className={`rounded-md px-2.5 py-1 text-xs border border-[var(--line)] disabled:opacity-50 ${
                    account.status === opt.value
                      ? "bg-[var(--sage)] text-white"
                      : "bg-white/80 hover:bg-[var(--mist)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {account.updatedAt && (
              <p className="mt-2 text-[10px] text-[var(--ink-soft)]">
                อัปเดตล่าสุด {account.updatedAt.replace("T", " ").slice(0, 19)}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
