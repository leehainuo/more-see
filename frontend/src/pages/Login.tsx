import { useMemo, useState } from "react";
import type * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";

function useRedirectTarget() {
  const location = useLocation();

  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("redirect") || "/workspace";
  }, [location.search]);
}

export default function Login() {
  const navigate = useNavigate();
  const redirectTo = useRedirectTarget();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("请输入用户名和密码。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "authenticated") {
    navigate(redirectTo, { replace: true });
    return null;
  }

  return (
    <AppShell eyebrow="Account" title="登录或注册" narrow>
      <main className="mx-auto grid w-full max-w-xl gap-6">
        <Card>
          <CardContent className="space-y-6 p-7">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Sign In</p>
              <h2 className="text-2xl font-semibold tracking-tight text-black">登录即注册</h2>
              <p className="text-sm leading-7 text-zinc-600">输入一个新用户名会自动创建账号，再次输入同名账号则作为登录。</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="username">
                  用户名
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-black/30"
                  autoComplete="username"
                  placeholder="你的用户名"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="password">
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-black/30"
                  autoComplete="current-password"
                  placeholder="至少 4 位"
                />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex items-center justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "正在提交..." : "进入系统"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
