import { useCallback, useEffect, useMemo, useRef } from "react";

import { useVisualCapture } from "@/hooks/useVisualCapture";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { StreamingPcmPlayer } from "@/lib/streaming-pcm-player";
import { SessionWebSocketClient } from "@/lib/ws-client";
import { useSessionStore } from "@/store/useSessionStore";

type InputSource = "camera" | "screen";

export function useSessionLifecycle() {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const inputSource = useSessionStore((state) => state.inputSource);
  const setInputSource = useSessionStore((state) => state.setInputSource);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const appendUserMessage = useSessionStore((state) => state.appendUserMessage);
  const assistantAudioStatus = useSessionStore((state) => state.assistantAudioStatus);

  const client = useMemo(() => new SessionWebSocketClient(), []);
  const speechTokenRef = useRef(0);
  const pcmPlayerRef = useRef<StreamingPcmPlayer | null>(null);
  const playbackPhaseRef = useRef<"idle" | "loading" | "playing">("idle");
  const autoStartingCaptureRef = useRef(false);
  const suppressTtsPlaybackRef = useRef(false);
  const startSessionRef = useRef<(resumeSessionId?: string) => void>(() => undefined);
  const tryStartHandsFreeCaptureRef = useRef<() => void>(() => undefined);
  const stopAssistantSpeechRef = useRef<() => void>(() => undefined);
  const bargeInProbeTimerRef = useRef<number | null>(null);
  const bargeInProbeSeqRef = useRef(0);
  const pendingSessionStartRef = useRef(false);
  const pendingResumeSessionIdRef = useRef<string | null>(null);
  const latestSessionRef = useRef<{
    sessionId: string | null;
    sessionStatus: typeof sessionStatus;
    isCapturing: boolean;
    assistantAudioStatus: typeof assistantAudioStatus;
  }>({
    sessionId: null,
    sessionStatus: "idle",
    isCapturing: false,
    assistantAudioStatus: "idle",
  });

  const ensurePcmPlayer = useCallback(() => {
    if (!pcmPlayerRef.current) {
      pcmPlayerRef.current = new StreamingPcmPlayer();
    }
    pcmPlayerRef.current.setOnIdle(() => {
      playbackPhaseRef.current = "idle";
      useSessionStore.getState().markAssistantAudioPlaybackComplete();
      tryStartHandsFreeCaptureRef.current();
    });
    return pcmPlayerRef.current;
  }, []);

  const stopAssistantSpeech = useCallback(() => {
    speechTokenRef.current += 1;
    playbackPhaseRef.current = "idle";
    pcmPlayerRef.current?.stop();
  }, []);

  const stopBargeInProbe = useCallback(() => {
    if (bargeInProbeTimerRef.current) {
      window.clearInterval(bargeInProbeTimerRef.current);
      bargeInProbeTimerRef.current = null;
    }
  }, []);

  const onBargeInProbe = useCallback(
    (activeSessionId: string) => {
      if (bargeInProbeTimerRef.current) {
        return;
      }
      suppressTtsPlaybackRef.current = true;
      stopAssistantSpeechRef.current();

      const sendProbe = () => {
        try {
          bargeInProbeSeqRef.current += 1;
          client.send({
            type: "asr.partial.request",
            sessionId: activeSessionId,
            requestId: `barge-${bargeInProbeSeqRef.current}`,
          });
        } catch {
          stopBargeInProbe();
        }
      };

      sendProbe();
      bargeInProbeTimerRef.current = window.setInterval(sendProbe, 260);
    },
    [client, stopBargeInProbe],
  );

  const sendAudioChunk = (payload: {
    sessionId: string;
    chunkId: string;
    mimeType: string;
    base64Audio: string;
    durationMs: number;
  }) => {
    client.send({
      type: "audio.chunk",
      ...payload,
    });
  };

  const commitTurn = (payload: {
    sessionId: string;
    turnId: string;
    frameId?: string;
    silenceMs: number;
    includeVision: boolean;
  }) => {
    client.send({
      type: "turn.commit",
      ...payload,
    });
  };

  const sendFrameCapture = (payload: {
    sessionId: string;
    frameId: string;
    inputSource: InputSource;
    imageBase64: string;
    width: number;
    height: number;
    capturedAt: string;
  }) => {
    client.send({
      type: "frame.capture",
      ...payload,
    });
  };

  const {
    bindMainVideoElement,
    bindPipVideoElement,
    isMainPreviewReady,
    isPipPreviewReady,
    startPreview,
    stopPreview,
    captureFrameForTurn,
  } = useVisualCapture({
    inputSource,
    sendFrameCapture,
    onInputSourceChange: setInputSource,
  });

  const { inputLevel, recordedChunks, isCapturing, startCapture, stopCapture, commitCurrentTurn } = useVoiceCapture({
    sessionId,
    inputSource,
    visionEnabled,
    onBargeInProbe,
    onUserSpeechActivity: (active) => {
      if (!active) {
        return;
      }
      if (useSessionStore.getState().assistantAudioStatus !== "speaking") {
        return;
      }
      suppressTtsPlaybackRef.current = true;
      stopAssistantSpeechRef.current();
      useSessionStore.setState({
        systemMessage: "检测到你正在说话，已停止 AI 播报并开始新一轮录音。",
      });
    },
    sendAudioChunk,
    commitTurn,
    captureFrameForTurn,
  });

  useEffect(() => {
    latestSessionRef.current = {
      sessionId,
      sessionStatus,
      isCapturing,
      assistantAudioStatus,
    };
  }, [assistantAudioStatus, isCapturing, sessionId, sessionStatus]);

  useEffect(() => {
    if (assistantAudioStatus !== "speaking") {
      stopBargeInProbe();
    }
  }, [assistantAudioStatus, stopBargeInProbe]);

  const tryStartHandsFreeCapture = useCallback(async () => {
    const current = latestSessionRef.current;
    if (
      autoStartingCaptureRef.current ||
      !current.sessionId ||
      current.sessionStatus !== "ready" ||
      current.isCapturing ||
      playbackPhaseRef.current !== "idle" ||
      current.assistantAudioStatus !== "idle"
    ) {
      return;
    }

    autoStartingCaptureRef.current = true;
    try {
      await startCapture();
    } finally {
      autoStartingCaptureRef.current = false;
    }
  }, [startCapture]);

  useEffect(() => {
    tryStartHandsFreeCaptureRef.current = () => {
      void tryStartHandsFreeCapture();
    };
  }, [tryStartHandsFreeCapture]);

  useEffect(() => {
    stopAssistantSpeechRef.current = stopAssistantSpeech;
  }, [stopAssistantSpeech]);

  useEffect(() => {
    client.onStatusChange((status) => {
      useSessionStore.getState().setConnectionStatus(status);
    });
    client.onEvent((event) => {
      useSessionStore.getState().handleServerEvent(event);
      if (event.type === "tts.start") {
        suppressTtsPlaybackRef.current = false;
        speechTokenRef.current += 1;
        playbackPhaseRef.current = "loading";
        ensurePcmPlayer().stop();
      }
      if (event.type === "tts.chunk") {
        if (suppressTtsPlaybackRef.current) {
          return;
        }
        if (event.mimeType !== "audio/pcm") {
          useSessionStore.setState({
            systemMessage: `暂不支持 ${event.mimeType} 的流式播放格式。`,
          });
          return;
        }
        playbackPhaseRef.current = "playing";
        void ensurePcmPlayer().appendChunk(event.audioBase64, event.sampleRate);
      }
      if (event.type === "tts.done") {
        if (suppressTtsPlaybackRef.current) {
          useSessionStore.getState().markAssistantAudioPlaybackComplete();
          return;
        }
        if (playbackPhaseRef.current === "idle") {
          useSessionStore.getState().markAssistantAudioPlaybackComplete();
        }
      }
      if (event.type === "assistant.interrupted") {
        stopBargeInProbe();
        stopAssistantSpeechRef.current();
      }
      if (event.type === "asr.partial" && event.verdict === "confirmed") {
        stopBargeInProbe();
        stopAssistantSpeechRef.current();
      }
    });
    client.connect();

    return () => {
      stopAssistantSpeechRef.current();
      stopBargeInProbe();
      pcmPlayerRef.current?.setOnIdle(null);
      pcmPlayerRef.current?.dispose();
      pcmPlayerRef.current = null;
      client.disconnect();
    };
  }, [client, ensurePcmPlayer, stopBargeInProbe]);

  useEffect(() => {
    if (sessionStatus === "closed" || sessionStatus === "error") {
      stopAssistantSpeech();
      stopBargeInProbe();
    }
  }, [sessionStatus, stopAssistantSpeech, stopBargeInProbe]);

  useEffect(() => {
    if (connectionStatus !== "connected" || !sessionId) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      try {
        client.send({
          type: "session.ping",
          sessionId,
        });
      } catch {
        window.clearInterval(timer);
      }
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [client, connectionStatus, sessionId]);

  useEffect(() => {
    if (sessionId && sessionStatus === "ready" && !isCapturing) {
      void tryStartHandsFreeCapture();
    }
  }, [isCapturing, sessionId, sessionStatus, tryStartHandsFreeCapture]);

  useEffect(() => {
    if (connectionStatus !== "connected" || sessionId || !pendingSessionStartRef.current) {
      return;
    }

    pendingSessionStartRef.current = false;
    const resumeSessionId = pendingResumeSessionIdRef.current ?? undefined;
    pendingResumeSessionIdRef.current = null;
    startSessionRef.current(resumeSessionId);
  }, [connectionStatus, sessionId]);

  useEffect(() => {
    if (sessionId) {
      return;
    }
    stopCapture();
  }, [sessionId, stopCapture]);

  useEffect(() => {
    if (visionEnabled) {
      void startPreview(inputSource);
      return;
    }
    stopPreview();
  }, [inputSource, startPreview, stopPreview, visionEnabled]);

  const startSession = useCallback(
    async (resumeSessionId?: string) => {
    if (visionEnabled) {
      await startPreview(inputSource);
    }
    appendUserMessage(
      resumeSessionId
        ? `已恢复会话 ${resumeSessionId.slice(0, 8)}，可以继续说话，我会结合当前画面与历史上下文回复。`
        : "准备开始新一轮多模态对话，请说出你的问题，我会结合当前画面一起理解。",
    );
    client.send({
      type: "session.start",
      ...(resumeSessionId ? { sessionId: resumeSessionId } : {}),
      inputSource,
      deviceInfo: {
        micLabel: "Default microphone",
        cameraLabel: inputSource === "screen" ? "Screen share" : "Default camera",
      },
    });
    },
    [appendUserMessage, client, inputSource, startPreview, visionEnabled],
  );

  useEffect(() => {
    startSessionRef.current = (resumeSessionId?: string) => {
      void startSession(resumeSessionId);
    };
  }, [startSession]);

  const closeSession = useCallback(() => {
    if (!sessionId) {
      return;
    }
    pendingSessionStartRef.current = false;
    pendingResumeSessionIdRef.current = null;
    autoStartingCaptureRef.current = false;
    stopCapture();
    stopAssistantSpeech();
    client.send({
      type: "session.end",
      sessionId,
    });
  }, [client, sessionId, stopAssistantSpeech, stopCapture]);

  const reconnect = useCallback(() => {
    client.disconnect();
    client.connect();
  }, [client]);

  const requestSessionStart = useCallback(
    (resumeSessionId?: string) => {
    pendingSessionStartRef.current = true;
    pendingResumeSessionIdRef.current = resumeSessionId ?? null;

    if (connectionStatus === "connected") {
      pendingSessionStartRef.current = false;
      const nextResumeSessionId = pendingResumeSessionIdRef.current ?? undefined;
      pendingResumeSessionIdRef.current = null;
      void startSession(nextResumeSessionId);
      return;
    }

    if (connectionStatus !== "connecting") {
      reconnect();
    }
    },
    [connectionStatus, reconnect, startSession],
  );

  return {
    connectionStatus,
    sessionStatus,
    sessionId,
    inputSource,
    inputLevel,
    recordedChunks,
    isCapturing,
    isMainPreviewReady,
    isPipPreviewReady,
    bindMainVideoElement,
    bindPipVideoElement,
    visionEnabled,
    setInputSource,
    requestSessionStart,
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
    commitCurrentTurn,
  };
}
