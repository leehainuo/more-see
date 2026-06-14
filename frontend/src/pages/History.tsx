import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { SessionFilterBar } from "@/components/SessionFilterBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async (targetPage: number, append: boolean) => {
    setLoading(true);
    if (!append) {
      setError(null);
    }
    try {
      const result = await fetchSessions({ page: targetPage, pageSize, ...filterApiParams });
      setPage(result.page);
      setTotal(result.total);
      setItems((prev) =>
        append ? [...prev, ...result.items.filter((item) => !prev.some((p) => p.sessionId === item.sessionId))] : result.items,
      );
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "加载失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterApiParams]);

  useEffect(() => {
    void loadSessions(1, false);
  }, [loadSessions]);

  const canLoadMore = items.length < total;

  async function handleLoadMore() {
    if (loadingMore || loading || !canLoadMore) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    void loadSessions(page + 1, true);
  }

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
      await loadSessions(1, false);
    } catch (exc) {
      toast.error(exc instanceof Error ? exc.message : "删除失败");
    } finally {
      setDeletingSessionId(null);
    }
  }

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchSessionDetail(selectedSessionId);
        if (!cancelled) {
          setSelectedDetail(detail);
        }
      } catch (exc) {
        if (!cancelled) {
          setError(exc instanceof Error ? exc.message : "加载失败");
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
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">列表</p>
                <div className="grid gap-2">
                  {loading ? (
                    <div className="rounded-[20px] border border-black/10 bg-black/[0.02] p-4 text-sm text-zinc-600">
                      正在加载会话列表...
                    </div>
                  ) : items.length ? (
                    <>
                      {items.map((item) => (
                        <div
                          key={item.sessionId}
                          className={`group relative rounded-[20px] border transition-colors ${
                            item.sessionId === selectedSessionId
                              ? "border-black/20 bg-black/[0.03]"
                              : "border-black/10 bg-white hover:bg-black/[0.02]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSearchParams(createSessionSearchParams(activeFilters, item.sessionId))}
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
                              setConfirmDeleteSessionId(item.sessionId);
                            }}
                            className="absolute top-3 right-3 opacity-0 transition-all group-hover:opacity-100 text-zinc-400 hover:text-red-500"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={!canLoadMore || loadingMore}
                          onClick={handleLoadMore}
                        >
                          {loadingMore ? "正在加载..." : canLoadMore ? "加载更多" : "没有更多了"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[20px] border border-black/10 bg-black/[0.02] p-4 text-sm text-zinc-600">
                      暂无会话记录
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky top-6 self-start space-y-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">详情</p>
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto rounded-[24px] border border-black/10 bg-white p-5">
                  {!selectedSessionId ? (
                    <p className="text-sm leading-7 text-zinc-600">从左侧选择一个会话查看详情。</p>
                  ) : detailLoading ? (
                    <p className="text-sm leading-7 text-zinc-600">正在加载会话详情...</p>
                  ) : selectedDetail ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-black">{selectedDetail.sessionId}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            创建 {new Date(selectedDetail.createdAt).toLocaleString()} · 更新{" "}
                            {new Date(selectedDetail.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <Button asChild>
                          <Link to={`/workspace?sessionId=${encodeURIComponent(selectedDetail.sessionId)}`}>继续对话</Link>
                        </Button>
                      </div>

                      <div className="rounded-[20px] border border-black/10 bg-black/[0.02] p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Summary</p>
                        <p className="mt-2 text-sm leading-7 text-zinc-700">{summaryLine}</p>
                      </div>

                      <div className="space-y-3">
                        {selectedDetail.turns.length ? (
                          selectedDetail.turns.slice(-10).map((turn) => (
                            <div key={turn.turnId} className="rounded-[20px] border border-black/10 bg-white p-4">
                              <p className="text-xs text-zinc-500">用户</p>
                              <p className="mt-2 text-sm leading-7 text-zinc-800">{turn.userText}</p>
                              {turn.visionSummary ? (
                                <div className="mt-3 rounded-[16px] border border-black/10 bg-black/[0.02] p-3">
                                  <p className="text-xs text-zinc-500">视觉摘要</p>
                                  <p className="mt-2 text-sm leading-7 text-zinc-700">{turn.visionSummary}</p>
                                </div>
                              ) : null}
                              {turn.assistantText ? (
                                <>
                                  <p className="mt-4 text-xs text-zinc-500">AI</p>
                                  <p className="mt-2 text-sm leading-7 text-zinc-800">{turn.assistantText}</p>
                                </>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-zinc-600">该会话暂无轮次记录。</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-zinc-600">未找到会话详情。</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <AlertDialog
        open={confirmDeleteSessionId !== null}
        onOpenChange={(open) => {
          if (!open && deletingSessionId === null) {
            setConfirmDeleteSessionId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除历史会话？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该会话的历史记录、视觉摘要和相关内容将无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSessionId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deletingSessionId !== null} onClick={handleConfirmDelete}>
              {deletingSessionId ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
