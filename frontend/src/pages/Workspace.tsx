import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Camera, Link2, Link2Off, MessageSquarePlus, Monitor } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
import { fetchSessionDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";

type DisplayMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  streaming?: boolean;
  pending?: "user-transcribing" | "assistant-thinking";
};

function ConversationBubble({ message }: { message: DisplayMessage }) {
  const [entered, setEntered] = useState(false);
  const isUser = message.role === "user";
  const isPendingUser = message.pending === "user-transcribing";
  const isPendingAssistant = message.pending === "assistant-thinking";
  const isPending = Boolean(message.pending);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <article
        className={cn(
          "max-w-[88%] rounded-lg border px-4 py-2.5 sm:max-w-[78%]",
          isUser ? "border-black bg-black text-white" : "border-black/10 bg-white text-zinc-900",
          isUser ? "rounded-br-[3px]" : "rounded-bl-[3px]",
          entered && "chat-bubble-enter",
          (message.streaming || isPendingAssistant) && "ai-thinking-surface",
          isPending && "min-w-[136px]",
        )}
        style={{ transformOrigin: isUser ? "right center" : "left center" }}
      >
        {isPendingUser ? (
          <div className="flex items-center justify-end gap-2 text-white/88">
            <span className="text-sm">正在识别...</span>
            <div className="flex items-center gap-1">
              <span className="typing-dot bg-white/85" />
              <span className="typing-dot bg-white/85 [animation-delay:120ms]" />
              <span className="typing-dot bg-white/85 [animation-delay:240ms]" />
            </div>
          </div>
        ) : null}

        {(message.role === "assistant" && message.streaming) || isPendingAssistant ? (
          <div className="mb-3 flex items-center gap-1.5">
            <span className="ai-thinking-dot" />
            <span className="ai-thinking-dot [animation-delay:120ms]" />
            <span className="ai-thinking-dot [animation-delay:240ms]" />
          </div>
        ) : null}

        {!isPendingUser ? (
          <p className={cn("text-sm leading-7", isUser ? "text-white" : "text-zinc-800")}>
            {message.content}
          </p>
        ) : null}

        {(message.role === "assistant" && message.streaming) || isPendingAssistant ? (
          <div className="mt-3 space-y-2">
            <div className="ai-thinking-line w-20" />
            <div className="ai-thinking-line w-28" />
          </div>
        ) : null}
      </article>
    </div>
  );
}

export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeSessionId = searchParams.get("sessionId") ?? searchParams.get("sessionid");
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const bottomComposerRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const lastMessageMetaRef = useRef<{ length: number; lastId: string | null }>({ length: 0, lastId: null });
  const [bottomSpacerHeight, setBottomSpacerHeight] = useState(208);
  const messages = useSessionStore((state) => state.messages);
  const lastFrameStoredId = useSessionStore((state) => state.lastFrameStoredId);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const setVisionEnabled = useSessionStore((state) => state.setVisionEnabled);
  const resetMessages = useSessionStore((state) => state.resetMessages);
  const hydrateHistoryTurns = useSessionStore((state) => state.hydrateHistoryTurns);
  const [isCapturePending, setIsCapturePending] = useState(false);
  const lastToastedFrameStoredIdRef = useRef<string | null>(null);
  const {
    connectionStatus,
    sessionId,
    sessionStatus,
    inputSource,
    inputLevel,
    isCapturing,
    isMainPreviewReady,
    isPipPreviewReady,
    bindMainVideoElement,
    bindPipVideoElement,
    setInputSource,
    requestSessionStart,
    connectConnection,
    disconnectConnection,
    startNewSession,
    startCapture,
    commitCurrentTurn,
  } = useSessionLifecycle();

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (resumeSessionId) {
      return;
    }
    setSearchParams({ sessionId }, { replace: true });
  }, [resumeSessionId, sessionId, setSearchParams]);

  const displayMessages = useMemo(
    () =>
      messages.filter(
        (message): message is DisplayMessage =>
          message.role === "user" || message.role === "assistant",
      ),
    [messages],
  );

  const renderedMessages = useMemo(() => {
    const nextMessages: DisplayMessage[] = [...displayMessages];
    const lastMessage = nextMessages[nextMessages.length - 1];

    if (sessionStatus === "recognizing") {
      nextMessages.push({
        id: "pending-user-transcribing",
        role: "user",
        content: "",
        pending: "user-transcribing",
      });
    }

    if (sessionStatus === "transcribing" && lastMessage?.role === "user") {
      nextMessages.push({
        id: "pending-assistant-thinking",
        role: "assistant",
        content: "正在思考你的问题...",
        pending: "assistant-thinking",
      });
    }

    return nextMessages;
  }, [displayMessages, sessionStatus]);

  useEffect(() => {
    if (!bottomComposerRef.current) {
      return;
    }

    const updateHeight = () => {
      const rect = bottomComposerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const nextSpacer = Math.round(rect.height + 64);
      setBottomSpacerHeight((current) => (current === nextSpacer ? current : nextSpacer));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bottomComposerRef.current);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  useEffect(() => {
    if (!bottomAnchorRef.current) {
      return;
    }
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }

    const nextMeta = {
      length: renderedMessages.length,
      lastId: renderedMessages[renderedMessages.length - 1]?.id ?? null,
    };
    const prevMeta = lastMessageMetaRef.current;
    const isNewBubble = nextMeta.length !== prevMeta.length || nextMeta.lastId !== prevMeta.lastId;
    lastMessageMetaRef.current = nextMeta;

    const behavior =
      !hasAutoScrolledRef.current ? "auto" : isNewBubble ? "smooth" : "auto";

    scrollRafRef.current = requestAnimationFrame(() => {
      bottomAnchorRef.current?.scrollIntoView({ block: "end", behavior });
      hasAutoScrolledRef.current = true;
      scrollRafRef.current = null;
    });
  }, [renderedMessages]);

  useEffect(() => {
    if (!visionEnabled) {
      setVisionEnabled(true);
    }
  }, [setVisionEnabled, visionEnabled]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    if (!lastFrameStoredId) {
      return;
    }

    if (lastToastedFrameStoredIdRef.current === lastFrameStoredId) {
      return;
    }

    lastToastedFrameStoredIdRef.current = lastFrameStoredId;
    toast.success("关键帧已上传，可以放下", {
      description: "已上传到服务器，AI 正在基于这张画面理解。",
      duration: 2200,
    });
  }, [lastFrameStoredId, sessionId]);

  useEffect(() => {
    if (!resumeSessionId || resumeSessionId === sessionId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      resetMessages();
      try {
        const detail = await fetchSessionDetail(resumeSessionId);
        if (cancelled) {
          return;
        }
        hydrateHistoryTurns(detail.turns);
        setInputSource(detail.inputSource === "screen" ? "screen" : "camera");
        useSessionStore.setState({
          sessionId: resumeSessionId,
          sessionStatus: "closed",
        });
      } catch {
        if (cancelled) {
          return;
        }
        toast.error("历史会话加载失败", {
          description: "请确认后端服务已启动且登录状态有效，然后刷新重试。",
          duration: 2400,
        });
        useSessionStore.setState({
          messages: [
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "历史会话加载失败。请确认后端服务已启动，然后刷新页面重试。",
            },
          ],
        });
      } finally {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hydrateHistoryTurns,
    resetMessages,
    resumeSessionId,
    sessionId,
    setInputSource,
  ]);

  const handleConnectionToggle = () => {
    if (connectionStatus === "connected" || connectionStatus === "connecting") {
      disconnectConnection();
      return;
    }
    connectConnection();
  };

  const handleStartNewSession = () => {
    setSearchParams({}, { replace: true });
    startNewSession();
  };

  const handleCaptureToggle = async () => {
    if (sessionStatus === "recording") {
      setIsCapturePending(false);
      commitCurrentTurn();
      return;
    }

    if (connectionStatus !== "connected") {
      toast.message("请先点击连接", { description: "连接成功后再开始录音或创建新对话。", duration: 1800 });
      return;
    }

    if (
      sessionStatus === "recognizing" ||
      sessionStatus === "transcribing" ||
      sessionStatus === "streaming" ||
      isCapturePending
    ) {
      return;
    }

    if (!sessionId) {
      toast.message("请先创建新对话", { description: "点击右侧的新对话按钮创建会话。", duration: 1800 });
      return;
    }

    setIsCapturePending(true);
    await startCapture();
  };

  const isCaptureBooting =
    isCapturePending &&
    !isCapturing &&
    sessionStatus !== "recognizing" &&
    sessionStatus !== "transcribing" &&
    sessionStatus !== "error" &&
    sessionStatus !== "idle" &&
    sessionStatus !== "closed";
  const isRecordButtonExpanded = sessionStatus === "recording" || isCaptureBooting;
  const isScreenMode = inputSource === "screen";
  const sourceSwitchDisabled = sessionStatus === "recognizing" || sessionStatus === "transcribing";

  const handleSourceChange = (nextSource: "camera" | "screen") => {
    if (sourceSwitchDisabled || inputSource === nextSource) {
      return;
    }
    setInputSource(nextSource);
  };

  const floatingVideoPanel = (
    <div className="floating-panel-enter w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[22px] border border-black/10 bg-[#f5f5f5] shadow-[0_24px_60px_rgba(0,0,0,0.16)]">
      <div className="relative aspect-16/10 bg-zinc-950">
        <video
          ref={bindMainVideoElement}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            isMainPreviewReady ? "opacity-100" : "opacity-0"
          }`}
          autoPlay
          playsInline
          muted
        />

        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] tracking-[0.18em] text-white/90 uppercase backdrop-blur">
          {isScreenMode ? "Screen" : "Camera"}
        </div>

        {!isMainPreviewReady ? (
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="rounded-[24px] border border-white/15 bg-white/8 px-12 py-7 text-center backdrop-blur">
              {isScreenMode ? (
                <Monitor className="mx-auto size-6 text-white/65" />
              ) : (
                <Camera className="mx-auto size-6 text-white/65" />
              )}
              <p className="mt-3 text-sm text-white/72">
                {isScreenMode ? "等待屏幕共享画面" : "等待摄像头画面"}
              </p>
            </div>
          </div>
        ) : null}

        {isScreenMode ? (
          <div className="absolute bottom-3 right-3 w-[112px] overflow-hidden rounded-2xl border border-white/20 bg-black/55 shadow-[0_16px_36px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="relative aspect-3/4 bg-zinc-900">
              <video
                ref={bindPipVideoElement}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                  isPipPreviewReady ? "opacity-100" : "opacity-0"
                }`}
                autoPlay
                playsInline
                muted
              />
              {!isPipPreviewReady ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Camera className="size-5 text-white/58" />
                </div>
              ) : null}
              <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/90">
                Self
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <AppShell
      eyebrow="Realtime Call"
      title="视频语音聊天"
      floatingPanel={floatingVideoPanel}
      floatingPanelClassName="top-[132px] right-4 sm:right-5 lg:right-6"
      narrow
    >
      <main className="mx-auto w-full max-w-5xl">
        <section className="min-w-0">
          <div className="flex min-h-[720px] flex-col">
            <div className="flex-1 px-4 py-5 sm:px-6">
              <div className="mx-auto flex w-full max-w-3xl flex-col space-y-6">
                {renderedMessages.map((message) => (
                  <ConversationBubble key={message.id} message={message} />
                ))}
                <div ref={bottomAnchorRef} style={{ height: `${bottomSpacerHeight}px` }} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 sm:bottom-5 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div
            ref={bottomComposerRef}
            className="pointer-events-auto rounded-full border border-black/10 bg-white/96 px-3 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.10)] backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-full border border-black/10 bg-zinc-50 p-1">
                <button
                  type="button"
                  onClick={() => handleSourceChange("camera")}
                  disabled={sourceSwitchDisabled}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors disabled:cursor-not-allowed",
                    inputSource === "camera" ? "bg-black text-white" : "text-zinc-600 hover:bg-black/5",
                  )}
                >
                  <Camera className="size-4" />
                  镜头
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceChange("screen")}
                  disabled={sourceSwitchDisabled}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors disabled:cursor-not-allowed",
                    inputSource === "screen" ? "bg-black text-white" : "text-zinc-600 hover:bg-black/5",
                  )}
                >
                  <Monitor className="size-4" />
                  屏幕
                </button>
              </div>

              <div className="min-w-0 flex-1 px-1" />

              <button
                type="button"
                onClick={handleConnectionToggle}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-300",
                  connectionStatus === "connected"
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.26)]"
                    : "border-black/10 bg-white text-black hover:bg-black/3",
                )}
                aria-label={connectionStatus === "connected" ? "断开连接" : "连接"}
              >
                {connectionStatus === "connected" ? (
                  <Link2Off className="size-5" />
                ) : (
                  <Link2 className="size-5" />
                )}
              </button>

              <button
                type="button"
                onClick={handleStartNewSession}
                disabled={connectionStatus === "connecting"}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
                  "border-black/10 bg-white text-black hover:bg-black/3",
                )}
                aria-label="新对话"
              >
                <MessageSquarePlus className="size-5" />
              </button>

              <button
                type="button"
                onClick={() => void handleCaptureToggle()}
                disabled={
                  connectionStatus !== "connected" ||
                  !sessionId ||
                  sessionStatus === "idle" ||
                  sessionStatus === "closed" ||
                  sessionStatus === "recognizing" ||
                  sessionStatus === "transcribing" ||
                  isCaptureBooting
                }
                className={cn(
                  "flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-white transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)] disabled:cursor-not-allowed disabled:bg-zinc-400",
                  isRecordButtonExpanded ? "w-[124px] px-4 shadow-[0_14px_32px_rgba(0,0,0,0.22)]" : "w-11 px-0 shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
                )}
                aria-label={
                  sessionStatus === "recording"
                    ? "结束本轮发言"
                    : isCaptureBooting
                      ? "正在启动持续收音"
                      : sessionId
                        ? "持续监听中"
                        : "开始通话"
                }
              >
                {isRecordButtonExpanded ? (
                  <div
                    className="flex w-full scale-100 items-center justify-center gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)]"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 9 }).map((_, index) => {
                      const activeBase = 8 + ((index % 4) + 1) * 4;
                      const expandedBase = [8, 11, 14, 17, 20, 17, 14, 11, 8][index] ?? 11;
                      const height = isCapturing
                        ? Math.round(activeBase + inputLevel * (8 + (index % 3) * 2))
                        : expandedBase;
                      return (
                        <span
                          key={`record-wave-${index}`}
                          className="block w-[3px] rounded-full bg-white transition-all duration-150"
                          style={{
                            height: `${height}px`,
                            opacity: isCapturing ? 0.62 + inputLevel * 0.38 : 0.7,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <AudioLines className="size-5 text-white" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
