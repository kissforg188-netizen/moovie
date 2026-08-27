"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "ออฟฟิศ" },
  { href: "/affiliate", label: "Affiliate" },
  { href: "/automation", label: "อัตโนมัติ" },
  { href: "/products", label: "สินค้า" },
  { href: "/calendar", label: "ตารางโพสต์" },
  { href: "/results", label: "ผลลัพธ์" },
  { href: "/guide", label: "คู่มือ" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(247,250,248,0.85)] backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="brand-mark text-3xl text-[var(--sage-deep)] transition-colors group-hover:text-[var(--sage)]">
            เลือกดี
          </span>
          <span className="text-xs tracking-wide text-[var(--ink-soft)]">
            Office Lab
          </span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-[var(--sage)] text-white"
                    : "text-[var(--ink-soft)] hover:bg-[var(--mist)] hover:text-[var(--ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
