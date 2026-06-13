import { useEffect } from "react";
import type * as React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import History from "@/pages/History";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Workspace from "@/pages/Workspace";
import Costs from "@/pages/Costs";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/useAuthStore";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);

  if (status === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-sm text-zinc-500">正在检查登录状态...</div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  }

  return children;
}

export default function App() {
  const loadMe = useAuthStore((state) => state.loadMe);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/workspace"
            element={
              <RequireAuth>
                <Workspace />
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <History />
              </RequireAuth>
            }
          />
          <Route
            path="/costs"
            element={
              <RequireAuth>
                <Costs />
              </RequireAuth>
            }
          />
          <Route path="/settings" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}
