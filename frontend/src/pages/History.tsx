import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionDetailResponse, SessionListItem } from "@/lib/api";
import { fetchSessionDetail, fetchSessions } from "@/lib/api";

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSessionId = searchParams.get("sessionId");
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await fetchSessions();
        if (cancelled) {
          return;
        }
        setItems(result.items);
      } catch (exc) {
        if (cancelled) {
          return;
        }
        setError(exc instanceof Error ? exc.message : "加载失败");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <AppShell eyebrow="Conversation Memory" title="会话记录" narrow>
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">列表</p>
                <div className="grid gap-2">
                  {loading ? (
                    <div className="rounded-[20px] border border-black/10 bg-black/[0.02] p-4 text-sm text-zinc-600">
                      正在加载会话列表...
                    </div>
                  ) : items.length ? (
                    items.map((item) => (
                      <button
                        key={item.sessionId}
                        type="button"
                        onClick={() => setSearchParams({ sessionId: item.sessionId })}
                        className={`rounded-[20px] border px-4 py-4 text-left transition-colors ${
                          item.sessionId === selectedSessionId
                            ? "border-black/20 bg-black/[0.03]"
                            : "border-black/10 bg-white hover:bg-black/[0.02]"
                        }`}
                      >
                        <p className="text-sm font-medium text-black">{item.sessionId.slice(0, 12)}</p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {item.inputSource} · 更新 {new Date(item.updatedAt).toLocaleString()}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-black/10 bg-black/[0.02] p-4 text-sm text-zinc-600">
                      暂无会话记录
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">详情</p>
                <div className="rounded-[24px] border border-black/10 bg-white p-5">
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
    </AppShell>
  );
}
