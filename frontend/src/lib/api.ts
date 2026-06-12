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

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/healthz");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

export async function synthesizeTts(text: string): Promise<TtsSynthesizeResponse> {
  const response = await fetch("/api/tts/synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<TtsSynthesizeResponse>;
}
