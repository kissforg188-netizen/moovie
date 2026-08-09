import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

async function loadGuideMarkdown(): Promise<string> {
  try {
    return await readFile(
      path.join(process.cwd(), "docs", "คู่มือการใช้งาน.md"),
      "utf8",
    );
  } catch {
    return "# คู่มือ\n\nไม่พบไฟล์ docs/คู่มือการใช้งาน.md";
  }
}

/** Minimal markdown → HTML for the in-app guide (headings, lists, code, tables, quotes). */
function renderGuide(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let inTable = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  };

  const inline = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-[var(--sage)] underline" target="_blank" rel="noreferrer">$1</a>',
      );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      closeLists();
      closeTable();
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        html.push(
          `<pre class="overflow-x-auto rounded-xl bg-[var(--mist)] p-3 text-xs leading-relaxed"><code>${codeBuf
            .join("\n")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</code></pre>`,
        );
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (line.trim() === "---") {
      closeLists();
      closeTable();
      html.push('<hr class="my-6 border-[var(--line)]" />');
      continue;
    }

    if (line.startsWith("|") && line.includes("|")) {
      closeLists();
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const isSep = cells.every((c) => /^[-:]+$/.test(c));
      if (isSep) continue;
      const next = lines[i + 1] ?? "";
      const nextIsSep =
        next.startsWith("|") &&
        next
          .split("|")
          .slice(1, -1)
          .every((c) => /^[-:\s]+$/.test(c.trim()));
      if (!inTable) {
        html.push(
          '<div class="overflow-x-auto"><table class="mb-4 w-full border-collapse text-sm">',
        );
        if (nextIsSep) {
          html.push(
            `<thead><tr>${cells
              .map(
                (c) =>
                  `<th class="border border-[var(--line)] bg-[var(--mist)] px-2 py-1.5 text-left font-medium">${inline(c)}</th>`,
              )
              .join("")}</tr></thead><tbody>`,
          );
          inTable = true;
          continue;
        }
        html.push("<tbody>");
        inTable = true;
      }
      html.push(
        `<tr>${cells
          .map(
            (c) =>
              `<td class="border border-[var(--line)] px-2 py-1.5 align-top">${inline(c)}</td>`,
          )
          .join("")}</tr>`,
      );
      continue;
    } else {
      closeTable();
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      closeLists();
      const level = h[1].length;
      const cls =
        level === 1
          ? "brand-mark mt-2 text-3xl text-[var(--sage-deep)] md:text-4xl"
          : level === 2
            ? "mt-8 text-xl font-semibold text-[var(--sage-deep)]"
            : "mt-5 text-base font-semibold text-[var(--ink)]";
      html.push(`<h${level} class="${cls}">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("> ")) {
      closeLists();
      html.push(
        `<blockquote class="my-3 rounded-xl border-l-4 border-[var(--coral)] bg-[var(--mist)] px-3 py-2 text-sm text-[var(--ink-soft)]">${inline(line.slice(2))}</blockquote>`,
      );
      continue;
    }

    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      closeTable();
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul class="my-2 list-disc space-y-1 pl-5 text-sm">');
        inUl = true;
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ol) {
      closeTable();
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol class="my-2 list-decimal space-y-1 pl-5 text-sm">');
        inOl = true;
      }
      html.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      continue;
    }

    closeLists();
    html.push(`<p class="my-2 text-sm leading-relaxed text-[var(--ink)]">${inline(line)}</p>`);
  }

  closeLists();
  closeTable();
  if (inCode) {
    html.push(
      `<pre class="overflow-x-auto rounded-xl bg-[var(--mist)] p-3 text-xs"><code>${codeBuf.join("\n")}</code></pre>`,
    );
  }
  return html.join("\n");
}

export default async function GuidePage() {
  const md = await loadGuideMarkdown();
  const body = renderGuide(md);

  return (
    <div className="space-y-4">
      <section className="surface rounded-2xl p-5 md:p-6">
        <p className="text-xs tracking-wide text-[var(--ink-soft)]">
          Documentation · เลือกดี Office Lab
        </p>
        <h1 className="brand-mark text-3xl text-[var(--sage-deep)] md:text-4xl">
          คู่มือการใช้งาน
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-soft)]">
          อ่านทีละขั้นตอนได้ในหน้านี้ หรือเปิดไฟล์{" "}
          <code className="rounded bg-[var(--mist)] px-1">docs/คู่มือการใช้งาน.md</code>{" "}
          ในโปรเจกต์
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-md bg-[var(--sage-deep)] px-3 py-1.5 text-sm text-white hover:bg-[var(--sage)]"
          >
            เปิดออฟฟิศ
          </Link>
          <Link
            href="/affiliate"
            className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-1.5 text-sm hover:bg-[var(--mist)]"
          >
            ไป Affiliate
          </Link>
          <a
            href="/api/guide"
            className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-1.5 text-sm hover:bg-[var(--mist)]"
          >
            ดาวน์โหลด Markdown
          </a>
        </div>
      </section>

      <article
        className="surface guide-content rounded-2xl p-5 md:p-8"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
