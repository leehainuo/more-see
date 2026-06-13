import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { TopNav } from "@/components/TopNav";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAdminCostSessionDetail,
  fetchAdminCostSessions,
  type AdminCostSessionDetailResponse,
  type AdminCostSessionItem,
} from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

export default function Costs() {
  const navigate = useNavigate();
  const isSuper = useAuthStore((state) => state.isSuper);
  const [items, setItems] = useState<AdminCostSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [detailsBySessionId, setDetailsBySessionId] = useState<Record<string, AdminCostSessionDetailResponse>>({});

  useEffect(() => {
    if (isSuper !== 1) {
      toast.error("你没有权限进入成本面板");
      navigate("/", { replace: true });
    }
  }, [isSuper, navigate]);

  useEffect(() => {
    if (isSuper !== 1) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetchAdminCostSessions();
        if (!cancelled) {
          setItems(response.items);
        }
      } catch {
        if (!cancelled) {
          toast.error("加载成本面板失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 pb-16 pt-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black">成本面板</h1>
          <p className="text-sm text-zinc-600">仅超级用户可见，按火山官方计费口径做预估。</p>
        </div>

        <Card>
          <CardContent className="p-6">
            {loading ? (
              <div className="text-sm text-zinc-600">加载中…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-zinc-600">暂无会话数据。</div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.sessionId}
                    className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-black/2 px-4 py-4"
                  >
                    <button
                      type="button"
                      className="flex items-center justify-between gap-3 text-left"
                      onClick={() => {
                        const next = expandedSessionId === item.sessionId ? null : item.sessionId;
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
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-black">
                          Session {item.sessionId.slice(0, 8)} · {item.inputSource}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {item.createdAt} → {item.endedAt ?? item.updatedAt}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-black">
                        ¥ {(item.asrCostYuan + item.ttsCostYuan).toFixed(4)}
                      </div>
                    </button>

                    <div className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-4">
                      <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                        ASR：{(item.asrDurationMs / 1000).toFixed(2)}s
                        <div className="mt-1 text-zinc-500">¥ {item.asrCostYuan.toFixed(4)}</div>
                      </div>
                      <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                        TTS：{item.ttsCharCount} 字符
                        <div className="mt-1 text-zinc-500">¥ {item.ttsCostYuan.toFixed(4)}</div>
                      </div>
                      <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                        视觉：{item.visionFrameCount} 帧
                        <div className="mt-1 text-zinc-500">命中缓存 {item.visionCacheHitCount}</div>
                      </div>
                      <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                        合计
                        <div className="mt-1 text-zinc-500">
                          ¥ {(item.asrCostYuan + item.ttsCostYuan).toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {expandedSessionId === item.sessionId ? (
                      <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 text-sm text-zinc-700">
                        {detailsBySessionId[item.sessionId] ? (
                          <div className="space-y-3">
                            <div className="text-xs font-semibold text-black">每轮明细</div>
                            <div className="space-y-2">
                              {detailsBySessionId[item.sessionId].turns.map((turn) => (
                                <div
                                  key={turn.turnId}
                                  className="grid gap-2 rounded-xl border border-black/10 bg-black/2 px-3 py-3 sm:grid-cols-5"
                                >
                                  <div className="sm:col-span-2">
                                    <div className="text-xs font-medium text-black">Turn {turn.turnId.slice(0, 8)}</div>
                                    <div className="mt-1 text-xs text-zinc-600">{turn.userText}</div>
                                  </div>
                                  <div className="text-xs">
                                    ASR {(turn.asrDurationMs / 1000).toFixed(2)}s
                                    <div className="mt-1 text-zinc-500">¥ {turn.asrCostYuan.toFixed(4)}</div>
                                  </div>
                                  <div className="text-xs">
                                    TTS {turn.ttsCharCount} 字符
                                    <div className="mt-1 text-zinc-500">¥ {turn.ttsCostYuan.toFixed(4)}</div>
                                  </div>
                                  <div className="text-xs">
                                    合计
                                    <div className="mt-1 text-zinc-500">
                                      ¥ {(turn.asrCostYuan + turn.ttsCostYuan).toFixed(4)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-zinc-600">加载明细中…</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
