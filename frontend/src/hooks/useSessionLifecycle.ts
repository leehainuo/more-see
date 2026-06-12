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
  const startSessionRef = useRef<() => void>(() => undefined);
  const tryStartHandsFreeCaptureRef = useRef<() => void>(() => undefined);
  const stopAssistantSpeechRef = useRef<() => void>(() => undefined);
  const pendingSessionStartRef = useRef(false);
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
        speechTokenRef.current += 1;
        playbackPhaseRef.current = "loading";
        ensurePcmPlayer().stop();
      }
      if (event.type === "tts.chunk") {
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
        if (playbackPhaseRef.current === "idle") {
          useSessionStore.getState().markAssistantAudioPlaybackComplete();
        }
      }
      if (event.type === "assistant.interrupted") {
        stopAssistantSpeechRef.current();
      }
    });
    client.connect();

    return () => {
      stopAssistantSpeechRef.current();
      pcmPlayerRef.current?.setOnIdle(null);
      pcmPlayerRef.current?.dispose();
      pcmPlayerRef.current = null;
      client.disconnect();
    };
  }, [client, ensurePcmPlayer]);

  useEffect(() => {
    if (sessionStatus === "closed" || sessionStatus === "error") {
      stopAssistantSpeech();
    }
  }, [sessionStatus, stopAssistantSpeech]);

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
    startSessionRef.current();
  }, [connectionStatus, sessionId]);

  useEffect(() => {
    if (sessionId) {
      return;
    }
    stopCapture();
    stopPreview();
  }, [sessionId, stopCapture, stopPreview]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (visionEnabled) {
      void startPreview(inputSource);
      return;
    }
    stopPreview();
  }, [inputSource, sessionId, startPreview, stopPreview, visionEnabled]);

  const startSession = useCallback(async () => {
    if (visionEnabled) {
      await startPreview(inputSource);
    }
    appendUserMessage("准备开始新一轮多模态对话，请说出你的问题，我会结合当前画面一起理解。");
    client.send({
      type: "session.start",
      inputSource,
      deviceInfo: {
        micLabel: "Default microphone",
        cameraLabel: inputSource === "screen" ? "Screen share" : "Default camera",
      },
    });
  }, [appendUserMessage, client, inputSource, startPreview, visionEnabled]);

  useEffect(() => {
    startSessionRef.current = () => {
      void startSession();
    };
  }, [startSession]);

  const closeSession = () => {
    if (!sessionId) {
      return;
    }
    pendingSessionStartRef.current = false;
    autoStartingCaptureRef.current = false;
    stopCapture();
    stopAssistantSpeech();
    client.send({
      type: "session.end",
      sessionId,
    });
  };

  const reconnect = () => {
    client.disconnect();
    client.connect();
  };

  const requestSessionStart = () => {
    pendingSessionStartRef.current = true;

    if (connectionStatus === "connected") {
      pendingSessionStartRef.current = false;
      void startSession();
      return;
    }

    if (connectionStatus !== "connecting") {
      reconnect();
    }
  };

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
