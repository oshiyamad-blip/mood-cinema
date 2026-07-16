"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/chat", label: "壁打ち対話" },
  { href: "/signals", label: "シグナル一覧" },
  { href: "/stories", label: "ストーリー" },
];

export default function Shell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const pathname = usePathname();
  const current = active ?? pathname;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar-title">経営者クローン AI</span>
        <span className="topbar-badge">INTERNAL</span>
      </header>

      <nav>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={current === item.href ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main>{children}</main>
    </div>
  );
}
