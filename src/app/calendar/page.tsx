import { BulkApproveButton } from "@/components/BulkApproveButton";
import { CopyCaptionButton } from "@/components/CopyCaptionButton";
import { ScheduleActions } from "@/components/ScheduleActions";
import { WorkflowButtons } from "@/components/WorkflowButtons";
import { evaluateApproveGate } from "@/lib/approve";
import { AFFILIATE_DISCLOSURE } from "@/lib/disclosure";
import { readDb, todayISO } from "@/lib/db";
import { channelLabel } from "@/lib/schedule";
import { resolveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const db = await readDb();
  const date = todayISO();
  const settings = resolveSettings(db);
  const posts = db.schedule
    .filter((s) => s.date === date)
    .sort((a, b) => a.suggestedTime.localeCompare(b.suggestedTime));

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
            return (
              <article key={post.id} className="surface rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-medium">
                      {post.suggestedTime} · {channelLabel(post.channel)}
                    </p>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {product?.name ?? "สินค้า"} · status: {post.status}
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
