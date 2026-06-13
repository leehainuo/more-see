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

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
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

export async function fetchAdminCostSessions(): Promise<AdminCostSessionsResponse> {
  return fetchJson<AdminCostSessionsResponse>("/api/admin/costs/sessions");
}

export async function fetchAdminCostSessionDetail(sessionId: string): Promise<AdminCostSessionDetailResponse> {
  return fetchJson<AdminCostSessionDetailResponse>(`/api/admin/costs/sessions/${encodeURIComponent(sessionId)}`);
}

export async function logout(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function fetchSessions(): Promise<SessionListResponse> {
  return fetchJson<SessionListResponse>("/api/sessions");
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return fetchJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}
