import Link from "next/link";
import { BulkApproveButton } from "@/components/BulkApproveButton";
import { CopyCaptionButton } from "@/components/CopyCaptionButton";
import { CopyPostingPackButton } from "@/components/CopyPostingPackButton";
import { ScheduleActions } from "@/components/ScheduleActions";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { evaluateApproveGate } from "@/lib/approve";
import { buildApproveQueue } from "@/lib/approve-queue";
import { buildPublishQueue } from "@/lib/publish-queue";
import {
  qualityLabelTh,
  scoreCaptionQuality,
} from "@/lib/caption-quality";
import { AFFILIATE_DISCLOSURE } from "@/lib/disclosure";
import { readDb, todayISO } from "@/lib/db";
import { channelLabel } from "@/lib/schedule";
import { resolveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const db = await readDb();
  const date = todayISO();
  const settings = resolveSettings(db);
  const approveQueue = buildApproveQueue(db, date);
  const publishQueue = buildPublishQueue(db, date);
  const posts = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));
  const queueOrder = new Map(
    approveQueue.items.map((item, index) => [item.scheduleId, index + 1]),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="brand-mark text-4xl text-[var(--sage-deep)]">ตารางโพสต์</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          แนะนำวันละ {settings.maxPostsPerDay} ชิ้น · สถานะเริ่มต้นเป็น draft · ต้อง Approve
          ก่อนโพสต์ด้วยมือ
        </p>
        <p className="mt-1 text-xs text-[var(--coral)]">
          ระบบไม่โพสต์อัตโนมัติไปยัง TikTok หรือ Facebook · Approve ถูกบล็อกถ้าขาด
          disclosure หรือมีคำโฆษณาเกินจริง
        </p>
      </div>

      <WorkflowButtons />

      <section className="surface rounded-2xl p-5 space-y-3">
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
        {approveQueue.items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มี draft ในคิว — รัน Morning ก่อน
          </p>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-soft)]">
            {approveQueue.items.map((item) => (
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
                <span className="text-xs">
                  {" "}
                  · {item.channelLabelTh} · ลำดับ {item.priority}/100
                </span>
                <p className="mt-0.5 text-xs">{item.nextAction}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-[var(--ink-soft)]">
          ดูรายละเอียดเพิ่มที่{" "}
          <Link className="underline underline-offset-2" href="/automation">
            ศูนย์อัตโนมัติ
          </Link>
        </p>
      </section>

      <section className="surface rounded-2xl p-5 space-y-3">
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
          เกรด {publishQueue.grade} · {publishQueue.score}/100 ·{" "}
          {publishQueue.nowHm}
        </p>
        {publishQueue.items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            ยังไม่มีชิ้นที่ Approve — Approve draft ก่อน แล้วค่อยโพสต์ด้วยมือ
          </p>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-soft)]">
            {publishQueue.items.map((item) => (
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
                <span className="text-xs">
                  {" "}
                  · {item.channelLabelTh} · ลำดับ {item.priority}/100
                </span>
                <p className="mt-0.5 text-xs">{item.nextAction}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">วันนี้ · {date}</h2>
          <BulkApproveButton date={date} />
        </div>
        {posts.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีคิว — กดรัน Morning workflow
          </p>
        ) : (
          posts.map((post) => {
            const product = db.products.find((p) => p.id === post.productId);
            const pack = db.contentPacks.find((p) => p.id === post.contentPackId);
            const gate =
              post.status === "draft"
                ? evaluateApproveGate(post.captionPreview, AFFILIATE_DISCLOSURE)
                : null;
            const quality = scoreCaptionQuality(
              post.captionPreview,
              post.channel,
            );
            const queueRank = queueOrder.get(post.id);
            return (
              <article key={post.id} className="surface rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-medium">
                      {post.suggestedTime} · {channelLabel(post.channel)}
                      {queueRank ? ` · คิวตรวจ #${queueRank}` : ""}
                    </p>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {product?.name ?? "สินค้า"} · status: {post.status}
                    </p>
                    <p
                      className={`mt-1 text-xs ${
                        quality.grade === "A" || quality.grade === "B"
                          ? "text-[var(--sage)]"
                          : "text-[var(--coral)]"
                      }`}
                    >
                      คุณภาพแคปชัน: {quality.grade} ({quality.score}/100) —{" "}
                      {qualityLabelTh(quality.grade)}
                      {quality.tips[0] ? ` · ${quality.tips[0]}` : ""}
                    </p>
                    {gate && !gate.ok && (
                      <p className="mt-1 text-xs text-[var(--coral)]">
                        ยัง Approve ไม่ได้: {gate.errors[0]}
                        {gate.errors.length > 1
                          ? ` (+${gate.errors.length - 1})`
                          : ""}
                      </p>
                    )}
                    {gate?.ok && (
                      <p className="mt-1 text-xs text-[var(--sage)]">
                        ผ่าน compliance — พร้อม Approve (ยังไม่โพสต์อัตโนมัติ)
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <CopyCaptionButton text={post.captionPreview} />
                    <CopyPostingPackButton
                      scheduleId={post.id}
                      readyHint={
                        post.status === "approved" || post.status === "posted"
                      }
                    />
                    <ScheduleActions id={post.id} status={post.status} />
                  </div>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--mist)] p-3 text-xs leading-relaxed">
                  {post.captionPreview}
                </pre>
                {pack && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[var(--sage)]">
                      Script / hooks / มุมขาย เพิ่มเติม
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-[var(--ink-soft)]">
                      <p>{pack.videoPriorityNote}</p>
                      <p>
                        Hook ที่ใช้: {pack.hooks[post.hookIndex] ?? pack.hooks[0]}
                      </p>
                      <p>
                        CTA ที่ใช้: {pack.ctas[post.ctaIndex] ?? pack.ctas[0]}
                      </p>
                      {(pack.sellingAngles?.length ?? 0) > 0 && (
                        <p>
                          มุมขาย:{" "}
                          {pack.sellingAngles
                            .map((a, i) => `${i + 1}) ${a}`)
                            .join(" · ")}
                        </p>
                      )}
                      <pre className="whitespace-pre-wrap">
                        {pack.tiktokScript.scenes
                          .map((s) => `[${s.time}] ${s.line}`)
                          .join("\n")}
                      </pre>
                    </div>
                  </details>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
