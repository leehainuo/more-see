import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { HistoryDeleteDialog } from "@/components/history/HistoryDeleteDialog";
import { HistorySessionDetail } from "@/components/history/HistorySessionDetail";
import { HistorySessionList } from "@/components/history/HistorySessionList";
import { SessionFilterBar } from "@/components/SessionFilterBar";
import { Card, CardContent } from "@/components/ui/card";
import { usePaginatedSessionList } from "@/hooks/usePaginatedSessionList";
import type { SessionDetailResponse, SessionListItem } from "@/lib/api";
import { deleteSession, fetchSessionDetail, fetchSessions } from "@/lib/api";
import {
  createSessionSearchParams,
  parseSessionFilters,
  toSessionFilterApiParams,
  type SessionFilters,
} from "@/lib/session-filters";

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSessionId = searchParams.get("sessionId");
  const activeFilters = useMemo(() => {
    const parsedFilters = parseSessionFilters(searchParams);
    return {
      ...parsedFilters,
      updatedFrom: "",
      updatedTo: "",
    };
  }, [searchParams]);
  const filterApiParams = useMemo(() => toSessionFilterApiParams(activeFilters), [activeFilters]);
  const [selectedDetail, setSelectedDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const { items, loading, loadingMore, canLoadMore, loadMore, reload, error: listError } =
    usePaginatedSessionList<SessionListItem>({
      filters: filterApiParams,
      fetchPage: fetchSessions,
    });
  const error = listError ?? detailError;

  function handleApplyFilters(nextFilters: SessionFilters) {
    setSearchParams(createSessionSearchParams(nextFilters));
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteSessionId) {
      return;
    }

    const sessionId = confirmDeleteSessionId;
    setDeletingSessionId(sessionId);
    try {
      await deleteSession(sessionId);
      toast.success("历史会话已删除");
      setConfirmDeleteSessionId(null);
      setSelectedDetail((current) => (current?.sessionId === sessionId ? null : current));
      if (selectedSessionId === sessionId) {
        setSearchParams(createSessionSearchParams(activeFilters));
      }
      await reload();
    } catch (exc) {
      toast.error(exc instanceof Error ? exc.message : "删除失败");
    } finally {
      setDeletingSessionId(null);
    }
  }

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const detail = await fetchSessionDetail(selectedSessionId);
        if (!cancelled) {
          setSelectedDetail(detail);
        }
      } catch (exc) {
        if (!cancelled) {
          setDetailError(exc instanceof Error ? exc.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const summaryLine = useMemo(() => {
    if (!selectedDetail) {
      return null;
    }
    const lastTurn = selectedDetail.turns[selectedDetail.turns.length - 1];
    if (!lastTurn) {
      return "暂无对话内容";
    }
    return lastTurn.userText.slice(0, 24);
  }, [selectedDetail]);

  return (
    <AppShell eyebrow="Conversation" title="会话" narrow>
      <main className="grid gap-6">
        <Card>
          <CardContent className="space-y-6 p-7">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Sessions</p>
              <h2 className="text-[clamp(1.6rem,2.8vw,2.4rem)] font-semibold tracking-tight text-black">历史会话</h2>
              <p className="max-w-3xl text-sm leading-7 text-zinc-600">
                支持查看会话列表与详情，并可选择任意历史 sessionId 回到聊天页继续对话。
              </p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <SessionFilterBar
              value={activeFilters}
              onApply={handleApplyFilters}
              disabled={loading}
              visibleFields={["query", "inputSource", "status"]}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <HistorySessionList
                items={items}
                loading={loading}
                loadingMore={loadingMore}
                canLoadMore={canLoadMore}
                selectedSessionId={selectedSessionId}
                deletingSessionId={deletingSessionId}
                activeFilters={activeFilters}
                onSelectSession={(nextSearchParams) => setSearchParams(nextSearchParams)}
                onRequestDelete={setConfirmDeleteSessionId}
                onLoadMore={() => {
                  void loadMore();
                }}
              />

              <HistorySessionDetail
                selectedSessionId={selectedSessionId}
                detailLoading={detailLoading}
                selectedDetail={selectedDetail}
                summaryLine={summaryLine}
              />
            </div>
          </CardContent>
        </Card>
      </main>

      <HistoryDeleteDialog
        open={confirmDeleteSessionId !== null}
        deleting={deletingSessionId !== null}
        onOpenChange={(open) => {
          if (!open && deletingSessionId === null) {
            setConfirmDeleteSessionId(null);
          }
        }}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />
    </AppShell>
  );
}
