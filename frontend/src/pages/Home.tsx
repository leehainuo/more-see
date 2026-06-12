import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api";

const messages = [
  {
    role: "AI",
    content: "React + shadcn/ui 骨架已接管前端。下一阶段将接入 WebSocket 会话与流式消息。",
    tone: "ai",
  },
  {
    role: "你",
    content: "先把前后端基线稳定下来，再逐步接入麦克风、关键帧和多模态对话。",
    tone: "user",
  },
];

export default function Home() {
  const [statusText, setStatusText] = useState("服务检测中");
  const [healthText, setHealthText] = useState("正在检查 FastAPI 服务状态。");
  const [loading, setLoading] = useState(false);

  const refreshHealth = async () => {
    setLoading(true);
    setStatusText("检测中");
    try {
      const payload = await fetchHealth();
      setStatusText("服务在线");
      setHealthText(`后端状态正常，当前环境为 ${payload.env}，应用名为 ${payload.app}。`);
    } catch {
      setStatusText("服务异常");
      setHealthText("当前无法连接后端服务，请确认 uvicorn 是否已经启动。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshHealth();
  }, []);

  return (
    <AppShell eyebrow="Cloud-native Multimodal Demo" title="More See">
      <main className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">实时画面</p>
                <h2 className="font-['Oswald','Noto_Sans_SC',sans-serif] text-[clamp(1.4rem,2.7vw,2rem)] tracking-[0.08em]">
                  摄像头 / 屏幕双视觉工作台
                </h2>
              </div>
              <Badge>{statusText}</Badge>
            </div>

            <div className="relative min-h-[640px] overflow-hidden rounded-[1.25rem] border border-cyan-400/20 bg-white/[0.03] shadow-glow">
              <div className="pointer-events-none absolute inset-4 rounded-[1.125rem] border border-dashed border-white/10" />
              <Badge className="absolute left-4 top-4">Camera</Badge>
              <Badge className="absolute right-4 top-4">AI 注意力热区预留</Badge>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_35%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:auto,36px_36px,36px_36px] opacity-70" />

              <div className="absolute inset-0 flex items-center justify-center p-12">
                <div className="max-w-xl rounded-[1.25rem] border border-white/10 bg-black/30 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
                  <p className="text-lg text-slate-100">这里将承载摄像头预览、屏幕共享和注意力框。</p>
                  <p className="mt-3 text-sm text-slate-400">
                    当前阶段先完成 React + shadcn/ui 黑白工作台骨架，后续逐步接入设备采集与多模态对话。
                  </p>
                </div>
              </div>

              <div className="absolute bottom-6 right-6 grid aspect-square w-40 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-sm text-slate-400 shadow-2xl">
                自拍小窗
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex min-h-[760px] flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">对话流</p>
                <h2 className="font-['Oswald','Noto_Sans_SC',sans-serif] text-[clamp(1.4rem,2.7vw,2rem)] tracking-[0.08em]">
                  分阶段接入语音、视觉与流式回答
                </h2>
              </div>
              <Button variant="secondary" onClick={() => void refreshHealth()}>
                <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
                刷新状态
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-auto pr-1">
              {messages.map((message) => (
                <article
                  key={message.content}
                  className={`rounded-2xl border px-4 py-4 ${
                    message.tone === "ai" ? "border-white/10 bg-[#1e1e1e]/90" : "border-white/10 bg-[#2a2a2a]/90"
                  }`}
                >
                  <span className="mb-2 inline-block text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    {message.role}
                  </span>
                  <p className="text-sm text-slate-100">{message.content}</p>
                </article>
              ))}

              <article className="rounded-2xl border border-cyan-400/35 bg-cyan-400/5 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]">
                <span className="mb-2 inline-block text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  系统
                </span>
                <p className="text-sm text-slate-100">{healthText}</p>
              </article>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-secondary/80 px-4 py-4">
              <div className="flex h-7 items-end gap-1.5" aria-hidden="true">
                {[0, 0.08, 0.16, 0.24, 0.32].map((delay, index) => (
                  <span
                    key={delay}
                    className="block w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.45)] animate-pulse-line"
                    style={{ height: `${[10, 18, 24, 16, 12][index]}px`, animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <strong className="block text-sm text-white">阶段 0</strong>
                <span className="text-sm text-slate-400">FastAPI API + React + shadcn/ui 工作台骨架</span>
              </div>
              <Badge variant="muted">预计成本面板待接入</Badge>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
