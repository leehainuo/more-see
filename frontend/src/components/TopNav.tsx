import { Link, NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "首页", end: true },
  { to: "/workspace", label: "聊天" },
  { to: "/history", label: "记录" },
];

export function TopNav() {
  return (
    <header>
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-12">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-lg font-black tracking-tight">
            More See
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-zinc-600 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group relative inline-flex items-center text-zinc-500 transition-all duration-300 ease-out hover:text-black",
                    isActive && "-translate-y-px scale-[1.03] text-black",
                  )
                }
              >
                {({ isActive }) => (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 rounded-full bg-black transition-all duration-300 ease-out",
                        isActive ? "scale-100 opacity-100" : "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-35",
                      )}
                    />
                    <span
                      className={cn(
                        "transition-all duration-300 ease-out",
                        isActive && "font-semibold tracking-[0.01em]",
                      )}
                    >
                      {item.label}
                    </span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
