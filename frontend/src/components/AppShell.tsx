import type * as React from "react";

import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "工作台", end: true },
  { to: "/history", label: "会话记录" },
  { to: "/settings", label: "设置" },
];

type AppShellProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  narrow?: boolean;
};

export function AppShell({ eyebrow, title, children, narrow = false }: AppShellProps) {
  return (
    <div className={cn("mx-auto w-[min(1280px,calc(100%-48px))] py-7", narrow && "w-[min(960px,calc(100%-48px))]")}>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
          <h1
            className="font-['Oswald','Noto_Sans_SC',sans-serif] text-[clamp(2rem,4vw,3.25rem)] tracking-[0.08em]"
          >
            {title}
          </h1>
        </div>

        <nav className="flex flex-wrap gap-3" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              end={item.end}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200 transition-all hover:border-cyan-300/50 hover:bg-white/10",
                  isActive && "border-cyan-300/50 shadow-glow",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {children}
    </div>
  );
}
