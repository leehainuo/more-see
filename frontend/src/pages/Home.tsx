import { useEffect, useMemo, useState } from "react";
import { Activity, Camera, Eye, Mic, Pause, Play, Power, RefreshCw, Radio } from "lucide-react";

import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

export default function Home() {
  const [statusText, setStatusText] = useState("服务检测中");
  const [healthText, setHealthText] = useState("正在检查 FastAPI 服务状态。");
  const [loading, setLoading] = useState(false);
  const messages = useSessionStore((state) => state.messages);
  const systemMessage = useSessionStore((state) => state.systemMessage);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const visionStatus = useSessionStore((state) => state.visionStatus);
  const visionSummary = useSessionStore((state) => state.visionSummary);
  const keyframes = useSessionStore((state) => state.keyframes);
  const setVisionEnabled = useSessionStore((state) => state.setVisionEnabled);
  const resetMessages = useSessionStore((state) => state.resetMessages);
  const {
    connectionStatus,
    sessionId,
    sessionStatus,
    inputLevel,
    recordedChunks,
    isCapturing,
    isPreviewReady,
    bindVideoElement,
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
  } = useSessionLifecycle();

  const lifecycleBadge = useMemo(() => {
    if (connectionStatus === "connecting") {
      return "通道连接中";
    }
    if (connectionStatus === "connected") {
      return sessionId ? "会话已建立" : "通道已连接";
    }
    if (connectionStatus === "closed") {
      return "通道已关闭";
    }
    return "等待连接";
  }, [connectionStatus, sessionId]);

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
              <div className="flex flex-wrap gap-2">
                <Badge>{statusText}</Badge>
                <Badge variant="muted">{lifecycleBadge}</Badge>
                <Badge variant="muted">{visionEnabled ? `视觉 ${visionStatus}` : "视觉已关闭"}</Badge>
              </div>
            </div>

            <div className="relative min-h-[640px] overflow-hidden rounded-[1.25rem] border border-cyan-400/20 bg-white/[0.03] shadow-glow">
              <div className="pointer-events-none absolute inset-4 rounded-[1.125rem] border border-dashed border-white/10" />
              <Badge className="absolute left-4 top-4">Camera</Badge>
              <Badge className="absolute right-4 top-4">{isPreviewReady ? "关键帧抓取已就绪" : "等待摄像头预览"}</Badge>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_35%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:auto,36px_36px,36px_36px] opacity-70" />

              <video
                ref={bindVideoElement}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                  isPreviewReady ? "opacity-80" : "opacity-0"
                }`}
                autoPlay
                playsInline
                muted
              />

              {!isPreviewReady ? (
                <div className="absolute inset-0 flex items-center justify-center p-12">
                  <div className="max-w-xl rounded-[1.25rem] border border-white/10 bg-black/30 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
                    <p className="text-lg text-slate-100">这里将承载摄像头预览、关键帧抓取和视觉摘要联动。</p>
                    <p className="mt-3 text-sm text-slate-400">
                      开启会话后会尝试拉起摄像头预览；若视觉联动关闭，则仍可继续执行纯语音识别。
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="absolute bottom-6 left-6 max-w-md rounded-3xl border border-white/10 bg-black/35 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
                  <Eye className="size-4" />
                  <span>视觉摘要</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-100">
                  {visionSummary || "当前还没有关键帧摘要。完成一次录音提交后，这里会显示本轮视觉理解结果。"}
                </p>
              </div>

              {keyframes.length > 0 ? (
                <div className="absolute bottom-6 right-6 flex max-w-[46%] gap-3 overflow-x-auto rounded-3xl border border-white/10 bg-black/40 p-3 backdrop-blur">
                  {keyframes.slice(0, 3).map((frame) => (
                    <div key={frame.id} className="w-32 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                      <img src={frame.dataUrl} alt="关键帧预览" className="h-20 w-full object-cover" />
                      <div className="space-y-1 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{frame.inputSource}</p>
                        <p className="text-xs text-slate-200">{frame.summary ? "摘要已返回" : "等待摘要"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="absolute right-6 top-16 grid aspect-square w-40 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-sm text-slate-400 shadow-2xl">
                <div className="text-center">
                  <Camera className="mx-auto mb-2 size-5" />
                  自拍小窗
                </div>
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
                  多模态会话编排与流式回复联调
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void refreshHealth()}>
                  <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
                  刷新状态
                </Button>
                <Button variant="secondary" onClick={reconnect}>
                  <Radio className="mr-2 size-4" />
                  重连通道
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void startSession()} disabled={connectionStatus !== "connected" || sessionStatus === "streaming"}>
                  <Play className="mr-2 size-4" />
                  开始会话
                </Button>
                <Button
                  variant={visionEnabled ? "secondary" : "default"}
                  onClick={() => setVisionEnabled(!visionEnabled)}
                  disabled={isCapturing}
                >
                  <Eye className="mr-2 size-4" />
                  {visionEnabled ? "关闭视觉联动" : "开启视觉联动"}
                </Button>
                <Button
                  variant={isCapturing ? "secondary" : "default"}
                  onClick={() => void (isCapturing ? stopCapture() : startCapture())}
                  disabled={!sessionId || sessionStatus === "transcribing"}
                >
                  {isCapturing ? <Pause className="mr-2 size-4" /> : <Mic className="mr-2 size-4" />}
                  {isCapturing ? "结束录音" : "开始录音"}
                </Button>
                <Button variant="secondary" onClick={closeSession} disabled={!sessionId}>
                  <Power className="mr-2 size-4" />
                  结束会话
                </Button>
                <Button variant="secondary" onClick={resetMessages}>
                  清空演示消息
                </Button>
              </div>
              <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">连接状态</span>
                  <p className="mt-2 text-slate-100">{connectionStatus}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">会话状态</span>
                  <p className="mt-2 text-slate-100">{sessionStatus}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">音频分段</span>
                  <p className="mt-2 text-slate-100">{recordedChunks} 段</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">关键帧</span>
                  <p className="mt-2 text-slate-100">{keyframes.length} 张</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">会话 ID</span>
                  <p className="mt-2 break-all text-slate-100">{sessionId ?? "尚未创建"}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">聆听波形</span>
                  <span className="text-xs text-slate-400">
                    {isCapturing
                      ? `录音中，静音 1.5 秒自动提交${visionEnabled ? "并抓取关键帧" : ""}`
                      : "点击开始录音后进入监听"}
                  </span>
                </div>
                <div className="flex h-10 items-end gap-1.5" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, index) => {
                    const base = 10 + ((index % 4) + 1) * 4;
                    const height = Math.round(base + inputLevel * 28);
                    return (
                      <span
                        key={`meter-${index}`}
                        className={`block w-2 rounded-full ${
                          isCapturing ? "bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.45)]" : "bg-white/20"
                        }`}
                        style={{
                          height: `${height}px`,
                          opacity: isCapturing ? 0.55 + inputLevel * 0.45 : 0.35,
                          transition: "height 120ms ease, opacity 120ms ease",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-auto pr-1">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    message.role === "assistant"
                      ? "border-white/10 bg-[#1e1e1e]/90"
                      : message.role === "user"
                        ? "border-white/10 bg-[#2a2a2a]/90"
                        : "border-cyan-400/35 bg-cyan-400/5"
                  }`}
                >
                  <span className="mb-2 inline-block text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    {message.role === "assistant" ? "AI" : message.role === "user" ? "你" : "系统"}
                  </span>
                  <p className="text-sm text-slate-100">
                    {message.content}
                    {message.streaming ? <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-cyan-300/80 align-middle" /> : null}
                  </p>
                </article>
              ))}

              <article className="rounded-2xl border border-cyan-400/35 bg-cyan-400/5 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]">
                <span className="mb-2 inline-block text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  系统
                </span>
                <p className="text-sm text-slate-100">{systemMessage}</p>
                <p className="mt-2 text-xs text-slate-400">{healthText}</p>
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
                <strong className="block text-sm text-white">阶段 4</strong>
                <span className="text-sm text-slate-400">多模态上下文编排、流式回复与会话延续</span>
              </div>
              <Badge variant="muted">
                <Activity className="mr-2 size-3.5" />
                流式回复联调中
              </Badge>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
