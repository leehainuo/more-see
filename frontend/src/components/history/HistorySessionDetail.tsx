import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { SessionDetailResponse } from "@/lib/api";

type HistorySessionDetailProps = {
  selectedSessionId: string | null;
  detailLoading: boolean;
  selectedDetail: SessionDetailResponse | null;
  summaryLine: string | null;
};

export function HistorySessionDetail({
  selectedSessionId,
  detailLoading,
  selectedDetail,
  summaryLine,
}: HistorySessionDetailProps) {
  return (
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
                  创建 {new Date(selectedDetail.createdAt).toLocaleString()} · 更新 {new Date(selectedDetail.updatedAt).toLocaleString()}
                </p>
              </div>
              <Button asChild>
                <Link to={`/workspace?sessionId=${encodeURIComponent(selectedDetail.sessionId)}`}>继续对话</Link>
              </Button>
            </div>

            <div className="rounded-[20px] border border-black/10 bg-black/2 p-4">
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
                      <div className="mt-3 rounded-[16px] border border-black/10 bg-black/2 p-3">
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
  );
}
