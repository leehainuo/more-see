import { Button } from "@/components/ui/button";
import type { AdminCostSessionDetailResponse, AdminCostSessionItem } from "@/lib/api";

type CostSessionListProps = {
  items: AdminCostSessionItem[];
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  expandedSessionId: string | null;
  detailsBySessionId: Record<string, AdminCostSessionDetailResponse>;
  formatSessionTime: (value: string) => string;
  onToggleExpand: (sessionId: string) => void;
  onLoadMore: () => void;
};

function CostTurnList({ detail }: { detail: AdminCostSessionDetailResponse }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-black">每轮明细</div>
      <div className="space-y-2">
        {detail.turns.map((turn) => (
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
              <div className="mt-1 text-zinc-500">¥ {(turn.asrCostYuan + turn.ttsCostYuan).toFixed(4)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostSessionCard({
  item,
  expanded,
  detail,
  formatSessionTime,
  onToggleExpand,
}: {
  item: AdminCostSessionItem;
  expanded: boolean;
  detail?: AdminCostSessionDetailResponse;
  formatSessionTime: (value: string) => string;
  onToggleExpand: (sessionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-black/2 px-4 py-4">
      <button
        type="button"
        className="flex items-center justify-between gap-3 text-left"
        onClick={() => onToggleExpand(item.sessionId)}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-black">
            Session {item.sessionId.slice(0, 8)} · {item.inputSource}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {formatSessionTime(item.createdAt)} → {formatSessionTime(item.endedAt ?? item.updatedAt)}
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-black">¥ {(item.asrCostYuan + item.ttsCostYuan).toFixed(4)}</div>
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
          <div className="mt-1 text-zinc-500">¥ {(item.asrCostYuan + item.ttsCostYuan).toFixed(4)}</div>
        </div>
      </div>

      {expanded ? (
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 text-sm text-zinc-700">
          {detail ? <CostTurnList detail={detail} /> : <div className="text-sm text-zinc-600">加载明细中…</div>}
        </div>
      ) : null}
    </div>
  );
}

export function CostSessionList({
  items,
  loading,
  loadingMore,
  canLoadMore,
  expandedSessionId,
  detailsBySessionId,
  formatSessionTime,
  onToggleExpand,
  onLoadMore,
}: CostSessionListProps) {
  if (loading) {
    return <div className="text-sm text-zinc-600">加载中…</div>;
  }

  if (items.length === 0) {
    return <div className="text-sm text-zinc-600">暂无会话数据。</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CostSessionCard
          key={item.sessionId}
          item={item}
          expanded={expandedSessionId === item.sessionId}
          detail={detailsBySessionId[item.sessionId]}
          formatSessionTime={formatSessionTime}
          onToggleExpand={onToggleExpand}
        />
      ))}
      <div className="pt-2">
        <Button type="button" variant="outline" className="w-full" disabled={!canLoadMore || loadingMore} onClick={onLoadMore}>
          {loadingMore ? "正在加载..." : canLoadMore ? "加载更多" : "没有更多了"}
        </Button>
      </div>
    </div>
  );
}
