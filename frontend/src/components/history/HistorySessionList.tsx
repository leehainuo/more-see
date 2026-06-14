import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionListItem } from "@/lib/api";
import { createSessionSearchParams, type SessionFilters } from "@/lib/session-filters";

type HistorySessionListProps = {
  items: SessionListItem[];
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  selectedSessionId: string | null;
  deletingSessionId: string | null;
  activeFilters: SessionFilters;
  onSelectSession: (search: URLSearchParams) => void;
  onRequestDelete: (sessionId: string) => void;
  onLoadMore: () => void;
};

export function HistorySessionList({
  items,
  loading,
  loadingMore,
  canLoadMore,
  selectedSessionId,
  deletingSessionId,
  activeFilters,
  onSelectSession,
  onRequestDelete,
  onLoadMore,
}: HistorySessionListProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">列表</p>
      <div className="grid gap-2">
        {loading ? (
          <div className="rounded-[20px] border border-black/10 bg-black/2 p-4 text-sm text-zinc-600">
            正在加载会话列表...
          </div>
        ) : items.length ? (
          <>
            {items.map((item) => (
              <div
                key={item.sessionId}
                className={`group relative rounded-[20px] border transition-colors ${
                  item.sessionId === selectedSessionId ? "border-black/20 bg-black/3" : "border-black/10 bg-white hover:bg-black/2"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(createSessionSearchParams(activeFilters, item.sessionId))}
                  className="w-full rounded-[20px] px-4 py-4 pr-14 text-left"
                >
                  <p className="text-sm font-medium text-black">{item.sessionId.slice(0, 12)}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {item.inputSource} · 更新 {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除会话 ${item.sessionId}`}
                  disabled={deletingSessionId === item.sessionId}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRequestDelete(item.sessionId);
                  }}
                  className="absolute top-3 right-3 text-zinc-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="pt-2">
              <Button type="button" variant="outline" className="w-full" disabled={!canLoadMore || loadingMore} onClick={onLoadMore}>
                {loadingMore ? "正在加载..." : canLoadMore ? "加载更多" : "没有更多了"}
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-[20px] border border-black/10 bg-black/2 p-4 text-sm text-zinc-600">暂无会话记录</div>
        )}
      </div>
    </div>
  );
}
