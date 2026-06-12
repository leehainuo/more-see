import { useEffect, useMemo, useState } from "react";
import { AudioLines, Camera } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
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
          "max-w-[88%] border px-4 py-2.5 sm:max-w-[78%]",
          isUser ? "border-black bg-black text-white" : "border-black/10 bg-white text-zinc-900",
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
  const messages = useSessionStore((state) => state.messages);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const setVisionEnabled = useSessionStore((state) => state.setVisionEnabled);
  const [isCapturePending, setIsCapturePending] = useState(false);
  const {
    connectionStatus,
    sessionId,
    sessionStatus,
    inputLevel,
    isCapturing,
    isPreviewReady,
    bindVideoElement,
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
  } = useSessionLifecycle();

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
    if (!visionEnabled) {
      setVisionEnabled(true);
    }
  }, [setVisionEnabled, visionEnabled]);

  useEffect(() => {
    if (isCapturing) {
      setIsCapturePending(false);
      return;
    }

    if (
      sessionStatus === "recognizing" ||
      sessionStatus === "transcribing" ||
      sessionStatus === "error" ||
      sessionStatus === "idle" ||
      sessionStatus === "closed"
    ) {
      setIsCapturePending(false);
    }
  }, [isCapturing, sessionStatus]);

  const handleSessionToggle = () => {
    if (sessionId) {
      closeSession();
      return;
    }

    if (connectionStatus === "connected") {
      void startSession();
      return;
    }

    reconnect();
  };

  const handleCaptureToggle = async () => {
    if (isCapturing) {
      setIsCapturePending(false);
      stopCapture();
      return;
    }

    if (!sessionId || sessionStatus === "recognizing" || sessionStatus === "transcribing" || isCapturePending) {
      return;
    }

    setIsCapturePending(true);
    await startCapture();
  };

  const isRecordButtonExpanded = isCapturing || isCapturePending;

  const floatingVideoPanel = (
    <div className="w-[288px] overflow-hidden rounded-lg border-border bg-[#f5f5f5] shadow-[0_24px_60px_rgba(0,0,0,0.16)]">
      <div className="relative h-[188px]">
        <video
          ref={bindVideoElement}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            isPreviewReady ? "opacity-100" : "opacity-0"
          }`}
          autoPlay
          playsInline
          muted
        />

        {!isPreviewReady ? (
          <div className="absolute inset-0 grid place-items-center p-2">
            <div className="rounded-[24px] border border-border px-12 py-7 text-center backdrop-blur">
              <Camera className="mx-auto size-6 text-zinc-500" />
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
      floatingPanelClassName="top-[116px] right-4 sm:right-5 lg:right-6"
      narrow
    >
      <main className="mx-auto w-full max-w-5xl pb-36">
        <section className="min-w-0">
          <div className="flex min-h-[720px] flex-col">
            <div className="flex-1 px-4 py-5 sm:px-6">
              <div className="mx-auto flex w-full max-w-3xl flex-col space-y-6">
                {renderedMessages.map((message) => (
                  <ConversationBubble key={message.id} message={message} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 sm:bottom-5 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="pointer-events-auto rounded-full border border-black/10 bg-white/96 px-3 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.10)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-[1.05rem] text-zinc-500">
                  {sessionId ? "可以继续说话，我会结合当前画面回复" : "有问题，尽管问"}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSessionToggle}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-300",
                  sessionId
                    ? "border-red-500 bg-red-500 text-white shadow-[0_10px_24px_rgba(239,68,68,0.28)]"
                    : "border-black/10 bg-white text-black hover:bg-black/3",
                )}
                aria-label={sessionId ? "结束通话" : "开始通话"}
              >
                <Camera className="size-5" />
              </button>

              <button
                type="button"
                onClick={() => void handleCaptureToggle()}
                disabled={
                  !sessionId ||
                  sessionStatus === "recognizing" ||
                  sessionStatus === "transcribing" ||
                  (isCapturePending && !isCapturing)
                }
                className={cn(
                  "flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-white transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)] disabled:cursor-not-allowed disabled:bg-zinc-400",
                  isRecordButtonExpanded ? "w-[124px] px-4 shadow-[0_14px_32px_rgba(0,0,0,0.22)]" : "w-11 px-0 shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
                )}
                aria-label={isCapturing ? "结束录音" : isCapturePending ? "正在启动录音" : "开始录音"}
              >
                {isRecordButtonExpanded ? (
                  <div
                    className="flex w-full scale-100 items-center justify-center gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)]"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 9 }).map((_, index) => {
                      const activeBase = 10 + ((index % 4) + 1) * 5;
                      const expandedBase = [10, 14, 18, 22, 26, 22, 18, 14, 10][index] ?? 14;
                      const height = isCapturing
                        ? Math.round(activeBase + inputLevel * (14 + (index % 3) * 4))
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
