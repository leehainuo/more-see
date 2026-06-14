import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { CostSessionList } from "@/components/costs/CostSessionList";
import { SessionFilterBar } from "@/components/SessionFilterBar";
import { TopNav } from "@/components/TopNav";
import { Card, CardContent } from "@/components/ui/card";
import { usePaginatedSessionList } from "@/hooks/usePaginatedSessionList";
import {
  fetchAdminCostSessionDetail,
  fetchAdminCostSessions,
  type AdminCostSessionDetailResponse,
  type AdminCostSessionItem,
} from "@/lib/api";
import { createSessionSearchParams, parseSessionFilters, toSessionFilterApiParams, type SessionFilters } from "@/lib/session-filters";
import { useAuthStore } from "@/store/useAuthStore";

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Costs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuper = useAuthStore((state) => state.isSuper);
  const activeFilters = useMemo(() => parseSessionFilters(searchParams), [searchParams]);
  const filterApiParams = useMemo(() => toSessionFilterApiParams(activeFilters), [activeFilters]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [detailsBySessionId, setDetailsBySessionId] = useState<Record<string, AdminCostSessionDetailResponse>>({});
  const { items, loading, loadingMore, canLoadMore, loadMore } = usePaginatedSessionList<AdminCostSessionItem>({
    enabled: isSuper === 1,
    filters: filterApiParams,
    fetchPage: fetchAdminCostSessions,
    getErrorMessage: (_error, phase) => (phase === "loadMore" ? "加载更多失败" : "加载成本面板失败"),
    onError: (message) => {
      toast.error(message);
    },
  });
  const resolvedExpandedSessionId = items.some((item) => item.sessionId === expandedSessionId) ? expandedSessionId : null;

  useEffect(() => {
    if (isSuper !== 1) {
      toast.error("你没有权限进入成本面板");
      navigate("/", { replace: true });
    }
  }, [isSuper, navigate]);

  function handleApplyFilters(nextFilters: SessionFilters) {
    setSearchParams(createSessionSearchParams(nextFilters));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 pb-16 pt-24">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black">成本面板</h1>
          <p className="text-sm text-zinc-600">仅超级用户可见，按火山官方计费口径做预估。</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <SessionFilterBar
              value={activeFilters}
              onApply={handleApplyFilters}
              disabled={loading}
              className="mb-6"
              visibleFields={["query", "inputSource", "status", "updatedRange"]}
            />

            <CostSessionList
              items={items}
              loading={loading}
              loadingMore={loadingMore}
              canLoadMore={canLoadMore}
              expandedSessionId={resolvedExpandedSessionId}
              detailsBySessionId={detailsBySessionId}
              formatSessionTime={formatSessionTime}
              onToggleExpand={(sessionId) => {
                const next = resolvedExpandedSessionId === sessionId ? null : sessionId;
                setExpandedSessionId(next);
                if (next && !detailsBySessionId[next]) {
                  void (async () => {
                    try {
                      const detail = await fetchAdminCostSessionDetail(next);
                      setDetailsBySessionId((state) => ({
                        ...state,
                        [next]: detail,
                      }));
                    } catch {
                      toast.error("加载会话成本明细失败");
                    }
                  })();
                }
              }}
              onLoadMore={() => {
                void loadMore();
              }}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
