import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { WorkspaceComposer } from "@/components/workspace/WorkspaceComposer";
import { WorkspaceConversationList } from "@/components/workspace/WorkspaceConversationList";
import { WorkspacePreviewPanel } from "@/components/workspace/WorkspacePreviewPanel";
import type { DisplayMessage } from "@/components/workspace/types";
import { useSessionLifecycle } from "@/hooks/useSessionLifecycle";
import { fetchSessionDetail } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

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
        useSessionStore.setState((state) => ({
          sessionId: resumeSessionId,
          sessionStatus:
            state.connectionStatus === "connected" && state.sessionId === resumeSessionId ? state.sessionStatus : "closed",
        }));
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
    connectConnection({ resumeSessionId: resumeSessionId ?? undefined });
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
  const sourceSwitchDisabled = sessionStatus === "recognizing" || sessionStatus === "transcribing";

  const handleSourceChange = (nextSource: "camera" | "screen") => {
    if (sourceSwitchDisabled || inputSource === nextSource) {
      return;
    }
    setInputSource(nextSource);
  };

  const floatingVideoPanel = (
    <WorkspacePreviewPanel
      inputSource={inputSource}
      isMainPreviewReady={isMainPreviewReady}
      isPipPreviewReady={isPipPreviewReady}
      bindMainVideoElement={bindMainVideoElement}
      bindPipVideoElement={bindPipVideoElement}
    />
  );

  return (
    <AppShell
      eyebrow="Chat"
      title="聊天"
      floatingPanel={floatingVideoPanel}
      floatingPanelClassName="top-[132px] right-4 sm:right-5 lg:right-6"
      narrow
    >
      <WorkspaceConversationList
        messages={renderedMessages}
        bottomAnchorRef={bottomAnchorRef}
        bottomSpacerHeight={bottomSpacerHeight}
      />

      <WorkspaceComposer
        composerRef={bottomComposerRef}
        inputSource={inputSource}
        connectionStatus={connectionStatus}
        sessionStatus={sessionStatus}
        sessionId={sessionId}
        inputLevel={inputLevel}
        isCapturing={isCapturing}
        isCaptureBooting={isCaptureBooting}
        isRecordButtonExpanded={isRecordButtonExpanded}
        sourceSwitchDisabled={sourceSwitchDisabled}
        onSourceChange={handleSourceChange}
        onConnectionToggle={handleConnectionToggle}
        onStartNewSession={handleStartNewSession}
        onCaptureToggle={() => {
          void handleCaptureToggle();
        }}
      />
    </AppShell>
  );
}
