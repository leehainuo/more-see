import { Link, NavLink, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";

export function TopNav() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const isSuper = useAuthStore((state) => state.isSuper);

  const navItems = [
    { to: "/", label: "首页", end: true },
    { to: "/workspace", label: "聊天" },
    { to: "/history", label: "记录" },
    ...(isSuper === 1 ? [{ to: "/costs", label: "成本" }] : []),
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-black/10 bg-white/88 backdrop-blur">
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

        <div className="flex items-center gap-2">
          {status === "authenticated" ? (
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
              退出
            </Button>
          ) : status === "anonymous" ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">登录</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
