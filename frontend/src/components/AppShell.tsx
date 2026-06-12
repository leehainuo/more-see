import type * as React from "react";

import { Compass, House, LayoutGrid, Settings2, Sparkles } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "首页", icon: House, end: true, hint: "产品介绍" },
  { to: "/workspace", label: "工作台", icon: LayoutGrid, hint: "多模态会话" },
  { to: "/history", label: "会话记录", icon: Compass, hint: "回看摘要" },
  { to: "/settings", label: "设置", icon: Settings2, hint: "模型与设备" },
];

type AppShellProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  narrow?: boolean;
};

export function AppShell({ eyebrow, title, children, narrow = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-4 p-4 sm:p-5">
        <aside className="hidden w-[280px] shrink-0 flex-col rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.06)] lg:flex">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">{eyebrow}</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-black">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                一个围绕语音、视觉与实时回答的多模态助手产品界面。
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3 text-zinc-700">
              <Sparkles className="size-5" />
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-black/10 bg-black/[0.02] p-3">
            <nav className="grid gap-2" aria-label="主导航">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    end={item.end}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-zinc-600 transition-all hover:bg-black/[0.04] hover:text-black",
                        isActive && "bg-black text-white shadow-[0_12px_30px_rgba(0,0,0,0.12)]",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "grid size-9 place-items-center rounded-xl border border-black/10 bg-white",
                            isActive && "border-white/10 bg-white/10 text-white",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.label}</span>
                          <span className={cn("block text-xs text-zinc-500", isActive && "text-white/70")}>
                            {item.hint}
                          </span>
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="mt-6 rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Product Notes</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <li>更像正式产品，而不是临时拼接的工作区。</li>
              <li>主界面聚焦一轮输入、一轮理解、一轮回答。</li>
              <li>保留必要状态反馈，但让信息层级更加清晰。</li>
            </ul>
          </div>

          <div className="mt-auto rounded-[24px] border border-black/10 bg-black/[0.02] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Design Language</p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              高密度留白、白底黑字、圆角面板和轻量阴影，整体更接近成熟 AI 产品网页体验。
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 rounded-[28px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <header className="border-b border-black/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">{eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">{title}</h2>
              </div>
              <div className="flex flex-wrap gap-2 lg:hidden">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    end={item.end}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "rounded-full border border-black/10 px-4 py-2 text-sm text-zinc-600 transition-all hover:bg-black/[0.04]",
                        isActive && "bg-black text-white",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </header>

          <div className={cn("p-5 sm:p-6", narrow && "mx-auto max-w-5xl")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
