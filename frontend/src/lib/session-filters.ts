export type SessionInputSourceFilter = "all" | "camera" | "screen";
export type SessionStatusFilter = "all" | "active" | "ended";

export type SessionFilters = {
  query: string;
  inputSource: SessionInputSourceFilter;
  status: SessionStatusFilter;
  updatedFrom: string;
  updatedTo: string;
};

export const DEFAULT_SESSION_FILTERS: SessionFilters = {
  query: "",
  inputSource: "all",
  status: "all",
  updatedFrom: "",
  updatedTo: "",
};

export function normalizeSessionFilters(filters: SessionFilters): SessionFilters {
  const normalized: SessionFilters = {
    query: filters.query.trim(),
    inputSource: filters.inputSource,
    status: filters.status,
    updatedFrom: filters.updatedFrom.trim(),
    updatedTo: filters.updatedTo.trim(),
  };

  if (normalized.updatedFrom && normalized.updatedTo && normalized.updatedFrom > normalized.updatedTo) {
    return {
      ...normalized,
      updatedFrom: normalized.updatedTo,
      updatedTo: normalized.updatedFrom,
    };
  }

  return normalized;
}

export function parseSessionFilters(searchParams: URLSearchParams): SessionFilters {
  const query = searchParams.get("query")?.trim() ?? "";
  const inputSourceValue = searchParams.get("inputSource");
  const statusValue = searchParams.get("status");
  const updatedFrom = searchParams.get("updatedFrom")?.trim() ?? "";
  const updatedTo = searchParams.get("updatedTo")?.trim() ?? "";

  return normalizeSessionFilters({
    query,
    inputSource: inputSourceValue === "camera" || inputSourceValue === "screen" ? inputSourceValue : "all",
    status: statusValue === "active" || statusValue === "ended" ? statusValue : "all",
    updatedFrom,
    updatedTo,
  });
}

export function createSessionSearchParams(filters: SessionFilters, sessionId?: string | null): URLSearchParams {
  const normalizedFilters = normalizeSessionFilters(filters);
  const nextParams = new URLSearchParams();

  if (normalizedFilters.query) {
    nextParams.set("query", normalizedFilters.query);
  }
  if (normalizedFilters.inputSource !== "all") {
    nextParams.set("inputSource", normalizedFilters.inputSource);
  }
  if (normalizedFilters.status !== "all") {
    nextParams.set("status", normalizedFilters.status);
  }
  if (normalizedFilters.updatedFrom) {
    nextParams.set("updatedFrom", normalizedFilters.updatedFrom);
  }
  if (normalizedFilters.updatedTo) {
    nextParams.set("updatedTo", normalizedFilters.updatedTo);
  }
  if (sessionId) {
    nextParams.set("sessionId", sessionId);
  }

  return nextParams;
}

export function toSessionFilterApiParams(filters: SessionFilters): {
  query?: string;
  inputSource?: "camera" | "screen";
  status?: "active" | "ended";
  updatedFrom?: string;
  updatedTo?: string;
} {
  const normalizedFilters = normalizeSessionFilters(filters);

  return {
    query: normalizedFilters.query || undefined,
    inputSource: normalizedFilters.inputSource === "all" ? undefined : normalizedFilters.inputSource,
    status: normalizedFilters.status === "all" ? undefined : normalizedFilters.status,
    updatedFrom: normalizedFilters.updatedFrom || undefined,
    updatedTo: normalizedFilters.updatedTo || undefined,
  };
}

export function hasActiveSessionFilters(filters: SessionFilters): boolean {
  return (
    filters.query.length > 0 ||
    filters.inputSource !== DEFAULT_SESSION_FILTERS.inputSource ||
    filters.status !== DEFAULT_SESSION_FILTERS.status ||
    filters.updatedFrom.length > 0 ||
    filters.updatedTo.length > 0
  );
}
