export type HealthResponse = {
  status: string;
  app: string;
  env: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/healthz");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}
