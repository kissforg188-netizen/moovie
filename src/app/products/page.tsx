import { ProductActions } from "@/components/ProductActions";
import { ProductForm } from "@/components/ProductForm";
import { ScoreBadge } from "@/components/ScoreBadge";
import { readDb } from "@/lib/db";
import { scoreProduct } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const db = await readDb();
  const products = db.products
    .map((p) => ({ product: p, score: scoreProduct(p) }))
    .sort((a, b) => {
      const aActive = a.product.active !== false ? 1 : 0;
      const bActive = b.product.active !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.score.total - a.score.total;
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="brand-mark text-4xl text-[var(--sage-deep)]">สินค้า Affiliate</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          โหมด manual: ใส่ลิงก์ Shopee / TikTok / ค่าคอมเอง แล้วให้ระบบช่วยสร้างคอนเทนต์
        </p>
      </div>

      <ProductForm />

      <section className="space-y-3">
        <h2 className="brand-mark text-3xl text-[var(--sage-deep)]">
          รายการ ({products.length})
        </h2>
        {products.length === 0 ? (
          <p className="surface rounded-2xl p-5 text-sm text-[var(--ink-soft)]">
            ยังไม่มีสินค้า
          </p>
        ) : (
          products.map(({ product, score }) => {
            const paused = product.active === false;
            return (
              <article
                key={product.id}
                className={`surface rounded-2xl p-5 ${paused ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-medium">
                      {product.name}
                      {paused && (
                        <span className="ml-2 text-xs font-normal text-[var(--coral)]">
                          (พักโปรโมต)
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {product.platform} · ฿{product.price.toLocaleString("th-TH")} · คอม{" "}
                      {product.commissionRate}% · วิดีโอ {product.videoEase}/5 · ซีซัน{" "}
                      {product.seasonalScore}/5
                    </p>
                    <a
                      href={product.affiliateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block break-all text-xs text-[var(--sage)] hover:underline"
                    >
                      {product.affiliateUrl}
                    </a>
                  </div>
                  <ScoreBadge score={score} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)] md:grid-cols-2">
                  <p>
                    <strong className="text-[var(--ink)]">จุดขาย:</strong>{" "}
                    {product.sellingPoints.join(" · ") || "-"}
                  </p>
                  <p>
                    <strong className="text-[var(--ink)]">Pain:</strong>{" "}
                    {product.painPoints.join(" · ") || "-"}
                  </p>
                  <p>
                    <strong className="text-[var(--ink)]">กลุ่มเป้าหมาย:</strong>{" "}
                    {product.targetAudience || "-"}
                  </p>
                  <p>
                    <strong className="text-[var(--ink)]">หมวด:</strong> {product.category}
                  </p>
                </div>
                <ProductActions
                  productId={product.id}
                  active={product.active !== false}
                />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
