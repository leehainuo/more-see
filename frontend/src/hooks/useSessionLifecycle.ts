import { useEffect, useMemo } from "react";

import { useVisualCapture } from "@/hooks/useVisualCapture";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { SessionWebSocketClient } from "@/lib/ws-client";
import { useSessionStore } from "@/store/useSessionStore";

export function useSessionLifecycle() {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const visionEnabled = useSessionStore((state) => state.visionEnabled);
  const appendUserMessage = useSessionStore((state) => state.appendUserMessage);

  const client = useMemo(() => new SessionWebSocketClient(), []);
  const inputSource = "camera" as const;

  useEffect(() => {
    client.onStatusChange((status) => {
      useSessionStore.getState().setConnectionStatus(status);
    });
    client.onEvent((event) => {
      useSessionStore.getState().handleServerEvent(event);
    });
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [client]);

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
    appendUserMessage("开始一次火山多模态会话，准备上传 PCM 语音、抓取关键帧，并等待流式 AI 回复。");
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
