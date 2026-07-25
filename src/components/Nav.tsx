"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "ภาพรวม" },
  { href: "/products", label: "สินค้า" },
  { href: "/calendar", label: "ตารางโพสต์" },
  { href: "/results", label: "ผลลัพธ์" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="brand-lockup">
        <Link href="/" className="brand">
          เลือกดี
        </Link>
        <p className="brand-tag">Affiliate lab · ทดลอง · ปรับปรุงจากข้อมูลจริง</p>
      </div>
      <nav className="nav-links" aria-label="หลัก">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "nav-link active" : "nav-link"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
