import { useCallback, useEffect, useMemo, useRef } from "react";

import { useVisualCapture } from "@/hooks/useVisualCapture";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { synthesizeTts } from "@/lib/api";
import { SessionWebSocketClient } from "@/lib/ws-client";
import { useSessionStore } from "@/store/useSessionStore";

export function useSessionLifecycle() {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const appendUserMessage = useSessionStore((state) => state.appendUserMessage);

  const client = useMemo(() => new SessionWebSocketClient(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const inputSource = "camera" as const;

  const revokeCurrentAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const playAssistantSpeech = useCallback(async (text: string) => {
    const cleanedText = text.trim();
    if (!cleanedText) {
      return;
    }

    const result = await synthesizeTts(cleanedText);
    const binary = window.atob(result.audioBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.mimeType });
    const url = URL.createObjectURL(blob);

    audioRef.current?.pause();
    revokeCurrentAudioUrl();

    const audio = new Audio(url);
    audioRef.current = audio;
    audioUrlRef.current = url;
    audio.onended = () => {
      revokeCurrentAudioUrl();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
    await audio.play();
  }, [revokeCurrentAudioUrl]);

  useEffect(() => {
    client.onStatusChange((status) => {
      useSessionStore.getState().setConnectionStatus(status);
    });
    client.onEvent((event) => {
      useSessionStore.getState().handleServerEvent(event);
      if (event.type === "llm.done") {
        void playAssistantSpeech(event.fullText).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "未知错误";
          useSessionStore.setState({
            systemMessage: `AI 文本已返回，但语音播报失败：${message}`,
          });
        });
      }
    });
    client.connect();

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      revokeCurrentAudioUrl();
      client.disconnect();
    };
  }, [client, playAssistantSpeech, revokeCurrentAudioUrl]);

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
    inputSource: "camera" | "screen";
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

  const { bindVideoElement, isPreviewReady, startPreview, stopPreview, captureFrameForTurn } = useVisualCapture({
    sendFrameCapture,
  });

  const { inputLevel, recordedChunks, isCapturing, startCapture, stopCapture } = useVoiceCapture({
    sessionId,
    inputSource,
    visionEnabled,
    sendAudioChunk,
    commitTurn,
    captureFrameForTurn,
  });

  useEffect(() => {
    if (sessionId) {
      return;
    }
    stopPreview();
  }, [sessionId, stopPreview]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (visionEnabled) {
      void startPreview();
      return;
    }
    stopPreview();
  }, [sessionId, startPreview, stopPreview, visionEnabled]);

  const startSession = async () => {
    if (visionEnabled) {
      await startPreview();
    }
    appendUserMessage("准备开始新一轮多模态对话，请说出你的问题，我会结合当前画面一起理解。");
    client.send({
      type: "session.start",
      inputSource,
      deviceInfo: {
        micLabel: "Default microphone",
        cameraLabel: "Default camera",
      },
    });
  };

  const closeSession = () => {
    if (!sessionId) {
      return;
    }
    client.send({
      type: "session.end",
      sessionId,
    });
  };

  const reconnect = () => {
    client.disconnect();
    client.connect();
  };

  return {
    connectionStatus,
    sessionStatus,
    sessionId,
    inputLevel,
    recordedChunks,
    isCapturing,
    isPreviewReady,
    bindVideoElement,
    visionEnabled,
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
  };
}
