import type { SessionStatusFilter } from "@/lib/session-filters";

export type HealthResponse = {
  status: string;
  app: string;
  env: string;
};

export type TtsSynthesizeResponse = {
  audioBase64: string;
  mimeType: string;
  provider: string;
  textLength: number;
};

export type AuthMeResponse = {
  userId: number;
  username: string;
  isSuper: 0 | 1;
};

export type AuthLoginResponse = {
  userId: number;
  username: string;
  isSuper: 0 | 1;
};

export type AdminCostSessionItem = {
  sessionId: string;
  inputSource: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  asrDurationMs: number;
  ttsCharCount: number;
  asrCostYuan: number;
  ttsCostYuan: number;
  visionFrameCount: number;
  visionCacheHitCount: number;
};

export type AdminCostSessionsResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: AdminCostSessionItem[];
};

export type AdminCostTurnItem = {
  turnId: string;
  createdAt: string;
  userText: string;
  assistantText: string;
  visionSummary: string | null;
  asrDurationMs: number;
  asrProvider: string | null;
  ttsCharCount: number;
  ttsProvider: string | null;
  asrCostYuan: number;
  ttsCostYuan: number;
};

export type AdminCostSessionDetailResponse = AdminCostSessionItem & {
  turns: AdminCostTurnItem[];
};

export type SessionListItem = {
  sessionId: string;
  inputSource: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

export type SessionListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: SessionListItem[];
};

export type SessionTurnItem = {
  turnId: string;
  userText: string;
  assistantText: string;
  visionSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionFrameItem = {
  frameId: string;
  inputSource: string;
  width: number;
  height: number;
  capturedAt: string;
  summary: string | null;
  provider: string | null;
  cacheHit: boolean;
  summarizedAt: string | null;
  summaryError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionDetailResponse = {
  sessionId: string;
  inputSource: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  turns: SessionTurnItem[];
  frames: SessionFrameItem[];
};

type SessionListFilters = {
  query?: string;
  inputSource?: "camera" | "screen";
  status?: Exclude<SessionStatusFilter, "all">;
  updatedFrom?: string;
  updatedTo?: string;
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const controller = init?.signal ? null : new AbortController();
  const timeout = init?.signal ? null : window.setTimeout(() => controller?.abort(), 6500);
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    signal: init?.signal ?? controller?.signal,
    headers: {
      ...(init?.headers ?? {}),
    },
  }).finally(() => {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/healthz", { credentials: "omit" });
}

export async function synthesizeTts(text: string): Promise<TtsSynthesizeResponse> {
  return fetchJson<TtsSynthesizeResponse>("/api/tts/synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
}

export async function fetchMe(): Promise<AuthMeResponse> {
  return fetchJson<AuthMeResponse>("/api/auth/me");
}

export async function loginOrRegister(username: string, password: string): Promise<AuthLoginResponse> {
  return fetchJson<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchAdminCostSessions(params?: {
  page?: number;
  pageSize?: number;
  query?: string;
  inputSource?: "camera" | "screen";
  status?: Exclude<SessionStatusFilter, "all">;
  updatedFrom?: string;
  updatedTo?: string;
}): Promise<AdminCostSessionsResponse> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 10;
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (params?.query) {
    searchParams.set("query", params.query);
  }
  if (params?.inputSource) {
    searchParams.set("inputSource", params.inputSource);
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.updatedFrom) {
    searchParams.set("updatedFrom", params.updatedFrom);
  }
  if (params?.updatedTo) {
    searchParams.set("updatedTo", params.updatedTo);
  }
  return fetchJson<AdminCostSessionsResponse>(`/api/admin/costs/sessions?${searchParams.toString()}`);
}

export async function fetchAdminCostSessionDetail(sessionId: string): Promise<AdminCostSessionDetailResponse> {
  return fetchJson<AdminCostSessionDetailResponse>(`/api/admin/costs/sessions/${encodeURIComponent(sessionId)}`);
}

export async function logout(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function fetchSessions(
  params?: { page?: number; pageSize?: number } & SessionListFilters,
): Promise<SessionListResponse> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 10;
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (params?.query) {
    searchParams.set("query", params.query);
  }
  if (params?.inputSource) {
    searchParams.set("inputSource", params.inputSource);
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.updatedFrom) {
    searchParams.set("updatedFrom", params.updatedFrom);
  }
  if (params?.updatedTo) {
    searchParams.set("updatedTo", params.updatedTo);
  }
  return fetchJson<SessionListResponse>(`/api/sessions?${searchParams.toString()}`);
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return fetchJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}
