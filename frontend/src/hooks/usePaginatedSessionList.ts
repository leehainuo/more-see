import { useCallback, useEffect, useReducer } from "react";

import type { PaginatedResponse, SessionListQueryParams } from "@/lib/api";

type LoadPhase = "load" | "loadMore";

type UsePaginatedSessionListOptions<TItem extends { sessionId: string }> = {
  enabled?: boolean;
  pageSize?: number;
  filters: Omit<SessionListQueryParams, "page" | "pageSize">;
  fetchPage: (params: SessionListQueryParams) => Promise<PaginatedResponse<TItem>>;
  getErrorMessage?: (error: unknown, phase: LoadPhase) => string;
  onError?: (message: string, phase: LoadPhase) => void;
};

type PaginatedSessionListState<TItem extends { sessionId: string }> = {
  items: TItem[];
  loading: boolean;
  loadingMore: boolean;
  page: number;
  total: number;
  error: string | null;
};

type PaginatedSessionListAction<TItem extends { sessionId: string }> =
  | { type: "load:start"; append: boolean }
  | { type: "load:success"; append: boolean; response: PaginatedResponse<TItem> }
  | { type: "load:error"; message: string };

function mergeItemsBySessionId<TItem extends { sessionId: string }>(current: TItem[], incoming: TItem[]): TItem[] {
  const existingIds = new Set(current.map((item) => item.sessionId));
  return [...current, ...incoming.filter((item) => !existingIds.has(item.sessionId))];
}

function createInitialState<TItem extends { sessionId: string }>(enabled: boolean): PaginatedSessionListState<TItem> {
  return {
    items: [],
    loading: enabled,
    loadingMore: false,
    page: 1,
    total: 0,
    error: null,
  };
}

function paginatedSessionListReducer<TItem extends { sessionId: string }>(
  state: PaginatedSessionListState<TItem>,
  action: PaginatedSessionListAction<TItem>,
): PaginatedSessionListState<TItem> {
  switch (action.type) {
    case "load:start":
      return {
        ...state,
        loading: !action.append,
        loadingMore: action.append,
        error: null,
      };
    case "load:success":
      return {
        items: action.append ? mergeItemsBySessionId(state.items, action.response.items) : action.response.items,
        loading: false,
        loadingMore: false,
        page: action.response.page,
        total: action.response.total,
        error: null,
      };
    case "load:error":
      return {
        ...state,
        loading: false,
        loadingMore: false,
        error: action.message,
      };
    default:
      return state;
  }
}

export function usePaginatedSessionList<TItem extends { sessionId: string }>({
  enabled = true,
  pageSize = 10,
  filters,
  fetchPage,
  getErrorMessage,
  onError,
}: UsePaginatedSessionListOptions<TItem>) {
  const [state, dispatch] = useReducer(paginatedSessionListReducer<TItem>, createInitialState<TItem>(enabled));

  const resolveErrorMessage = useCallback(
    (value: unknown, phase: LoadPhase) => {
      if (getErrorMessage) {
        return getErrorMessage(value, phase);
      }
      return value instanceof Error ? value.message : phase === "loadMore" ? "加载更多失败" : "加载失败";
    },
    [getErrorMessage],
  );

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!enabled) {
        return;
      }

      const phase: LoadPhase = append ? "loadMore" : "load";
      dispatch({ type: "load:start", append });

      try {
        const response = await fetchPage({
          page: targetPage,
          pageSize,
          ...filters,
        });
        dispatch({ type: "load:success", append, response });
      } catch (value) {
        const message = resolveErrorMessage(value, phase);
        dispatch({ type: "load:error", message });
        onError?.(message, phase);
      }
    },
    [enabled, fetchPage, filters, onError, pageSize, resolveErrorMessage],
  );

  useEffect(() => {
    if (enabled) {
      void loadPage(1, false);
    }
  }, [enabled, loadPage]);

  const resolvedItems = enabled ? state.items : [];
  const resolvedLoading = enabled ? state.loading : false;
  const resolvedLoadingMore = enabled ? state.loadingMore : false;
  const resolvedTotal = enabled ? state.total : 0;
  const resolvedError = enabled ? state.error : null;
  const canLoadMore = enabled && resolvedItems.length < resolvedTotal;

  const loadMore = useCallback(async () => {
    if (resolvedLoading || resolvedLoadingMore || !canLoadMore) {
      return;
    }
    await loadPage(state.page + 1, true);
  }, [canLoadMore, loadPage, resolvedLoading, resolvedLoadingMore, state.page]);

  const reload = useCallback(async () => {
    await loadPage(1, false);
  }, [loadPage]);

  return {
    items: resolvedItems,
    loading: resolvedLoading,
    loadingMore: resolvedLoadingMore,
    total: resolvedTotal,
    error: resolvedError,
    canLoadMore,
    loadMore,
    reload,
  };
}
