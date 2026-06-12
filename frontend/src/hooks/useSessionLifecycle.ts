import { useEffect, useMemo } from "react";

import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { SessionWebSocketClient } from "@/lib/ws-client";
import { useSessionStore } from "@/store/useSessionStore";

export function useSessionLifecycle() {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const appendUserMessage = useSessionStore((state) => state.appendUserMessage);

  const client = useMemo(() => new SessionWebSocketClient(), []);

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

  const { inputLevel, recordedChunks, isCapturing, startCapture, stopCapture } = useVoiceCapture({
    sessionId,
    sendAudioChunk,
    commitTurn,
  });

  const startSession = () => {
    appendUserMessage("开始一次语音会话联调，准备录音并验证静音自动提交。");
    client.send({
      type: "session.start",
      inputSource: "camera",
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
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
  };
}
