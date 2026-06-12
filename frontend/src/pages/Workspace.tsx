import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Eye,
  Mic,
  Pause,
  Play,
  Power,
  RefreshCw,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

export default function Workspace() {
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

  const sessionSnapshot = useMemo(
    () => [
      { label: "连接", value: lifecycleBadge },
      { label: "会话", value: sessionStatus },
      { label: "音频分段", value: `${recordedChunks} 段` },
      { label: "关键帧", value: `${keyframes.length} 张` },
    ],
    [keyframes.length, lifecycleBadge, recordedChunks, sessionStatus],
  );

  const productHighlights = useMemo(
    () => [
      "语音结束后自动提交，并在同一轮串联视觉理解。",
      "AI 回复完成后自动进入语音播报，不需要额外点击。",
      "主视图聚焦对话与结果，让操作路径更像完整产品。",
    ],
    [],
  );

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
    <AppShell eyebrow="Realtime Workspace" title="工作台">
      <main className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardContent className="space-y-6 p-6 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{statusText}</Badge>
                    <Badge variant="muted">{lifecycleBadge}</Badge>
                    <Badge variant="muted">{visionEnabled ? `视觉 ${visionStatus}` : "视觉关闭"}</Badge>
                  </div>
                  <h1 className="mt-4 text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-tight text-black">
                    用更清晰的工作台承接多模态会话。
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 sm:text-base">
                    在这里开启会话、提交语音、抓取关键帧并接收 AI 回复。
                    交互保留完整能力，但视觉上更轻、更像产品工作区。
                  </p>
                </div>
                <div className="grid gap-3 sm:min-w-[280px]">
                  <Button variant="secondary" onClick={() => void refreshHealth()}>
                    <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
                    刷新服务状态
                  </Button>
                  <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">服务摘要</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-700">{healthText}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {sessionSnapshot.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{item.label}</p>
                    <p className="mt-3 text-sm font-medium text-black">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Vision Workspace</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">当前画面与视觉摘要</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="muted">{isPreviewReady ? "摄像头已就绪" : "等待预览"}</Badge>
                  <Badge variant="muted">{sessionId ? `会话 ${sessionId.slice(0, 8)}` : "尚未开始会话"}</Badge>
                </div>
              </div>

              <div className="relative min-h-[420px] overflow-hidden rounded-[24px] border border-black/10 bg-[linear-gradient(180deg,#fafafa_0%,#f2f2f2_100%)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,0,0,0.05),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.65),transparent_18%)]" />
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
                  <div className="absolute inset-0 grid place-items-center p-8">
                    <div className="max-w-lg rounded-[24px] border border-black/10 bg-white/90 px-6 py-7 text-center backdrop-blur">
                      <Camera className="mx-auto size-6 text-zinc-500" />
                      <h3 className="mt-4 text-lg font-medium text-black">等待开始一轮多模态会话</h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-600">
                        开始会话后会尝试拉起摄像头预览，并在录音提交时抓取关键帧，把视觉摘要拼进同一轮回复。
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="absolute left-4 top-4">
                  <Badge variant="muted">Camera Preview</Badge>
                </div>
                <div className="absolute right-4 top-4">
                  <Badge variant="muted">{visionEnabled ? "视觉联动开启" : "纯语音模式"}</Badge>
                </div>

                <div className="absolute bottom-4 left-4 max-w-xl rounded-[24px] border border-black/10 bg-white/92 px-5 py-4 backdrop-blur">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                    <Eye className="size-4" />
                    视觉摘要
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700">
                    {visionSummary || "完成一次录音提交后，这里会显示本轮关键帧理解结果。"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="flex min-h-[720px] flex-col p-0">
              <div className="border-b border-black/10 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Conversation</p>
                    <h2 className="mt-2 text-xl font-semibold text-black">在产品工作台中完成一轮真实对话</h2>
                  </div>
                  <Button variant="secondary" onClick={resetMessages}>
                    清空当前会话
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-auto bg-[linear-gradient(180deg,rgba(0,0,0,0.015),transparent_40%)] px-4 py-5 sm:px-6">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <article
                      className={`max-w-[88%] rounded-[24px] border px-4 py-4 sm:max-w-[78%] ${
                        message.role === "assistant"
                          ? "border-black/10 bg-white"
                          : message.role === "user"
                            ? "border-black bg-black text-white"
                            : "border-black/10 bg-black/[0.03]"
                      }`}
                    >
                      <span
                        className={`mb-2 inline-block text-[11px] uppercase tracking-[0.24em] ${
                          message.role === "user" ? "text-white/70" : "text-zinc-500"
                        }`}
                      >
                        {message.role === "assistant" ? "AI" : message.role === "user" ? "你" : "系统"}
                      </span>
                      <p className={`text-sm leading-7 ${message.role === "user" ? "text-white" : "text-zinc-800"}`}>
                        {message.content}
                        {message.streaming ? (
                          <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-black/60 align-middle" />
                        ) : null}
                      </p>
                    </article>
                  </div>
                ))}

                <div className="rounded-[24px] border border-black/10 bg-black/[0.02] px-5 py-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                    <Sparkles className="size-4" />
                    系统状态
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700">{systemMessage}</p>
                </div>
              </div>

              <div className="border-t border-black/10 bg-white px-4 py-4 sm:px-6">
                <div className="rounded-[28px] border border-black/10 bg-black/[0.02] px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void startSession()} disabled={connectionStatus !== "connected" || sessionStatus === "streaming"}>
                      <Play className="mr-2 size-4" />
                      开始会话
                    </Button>
                    <Button
                      variant="secondary"
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
                    <Button variant="secondary" onClick={reconnect}>
                      <ArrowUpRight className="mr-2 size-4" />
                      重连通道
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm text-zinc-700">
                        {isCapturing
                          ? `正在聆听，静音 1.5 秒后会自动提交${visionEnabled ? "并抓取关键帧" : ""}。`
                          : "点击开始录音后进入聆听状态，系统会自动完成一轮语音提交。"}
                      </p>
                    </div>
                    <div className="flex h-10 items-end gap-1.5" aria-hidden="true">
                      {Array.from({ length: 12 }).map((_, index) => {
                        const base = 10 + ((index % 4) + 1) * 4;
                        const height = Math.round(base + inputLevel * 28);
                        return (
                          <span
                            key={`meter-${index}`}
                            className={`block w-2 rounded-full ${isCapturing ? "bg-black" : "bg-black/20"}`}
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
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
                  <Waves className="size-5 text-black" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Session Controls</p>
                  <h3 className="mt-1 text-lg font-medium text-black">当前交互能力</h3>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4">
                  <p className="text-sm text-zinc-600">会话状态</p>
                  <p className="mt-2 text-sm font-medium text-black">{sessionStatus}</p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4">
                  <p className="text-sm text-zinc-600">语音播报</p>
                  <p className="mt-2 text-sm font-medium text-black">AI 回复完成后自动播放</p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4">
                  <p className="text-sm text-zinc-600">视觉模式</p>
                  <p className="mt-2 text-sm font-medium text-black">{visionEnabled ? "当前会在每轮提交时抓取关键帧" : "当前仅使用语音输入"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
                  <Volume2 className="size-5 text-black" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Highlights</p>
                  <h3 className="mt-1 text-lg font-medium text-black">这版产品化改造</h3>
                </div>
              </div>
              <div className="space-y-3">
                {productHighlights.map((item) => (
                  <div key={item} className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-4 text-sm leading-6 text-zinc-700">
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-3">
                  <Camera className="size-5 text-black" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Recent Frames</p>
                  <h3 className="mt-1 text-lg font-medium text-black">最近关键帧</h3>
                </div>
              </div>

              {keyframes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-6 text-sm leading-6 text-zinc-600">
                  还没有关键帧。完成一次包含视觉联动的录音提交后，这里会显示最近的画面缩略图。
                </div>
              ) : (
                <div className="space-y-3">
                  {keyframes.slice(0, 3).map((frame) => (
                    <div key={frame.id} className="overflow-hidden rounded-[22px] border border-black/10 bg-white">
                      <img src={frame.dataUrl} alt="关键帧预览" className="h-32 w-full object-cover" />
                      <div className="space-y-2 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{frame.inputSource}</p>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                            {new Date(frame.capturedAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <p className="text-sm leading-6 text-zinc-700">{frame.summary || "等待视觉摘要返回..."}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </main>
    </AppShell>
  );
}
