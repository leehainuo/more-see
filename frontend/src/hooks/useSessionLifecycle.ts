import { useCallback, useEffect, useMemo, useRef } from "react";

import { useVisualCapture } from "@/hooks/useVisualCapture";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { splitIntoSpeechSegments } from "@/lib/tts";
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
  const ttsEnabled = useSessionStore((state) => state.ttsEnabled);
  const appendUserMessage = useSessionStore((state) => state.appendUserMessage);

  const client = useMemo(() => new SessionWebSocketClient(), []);
  const speechTokenRef = useRef(0);
  const stopSpeechPlayback = useMemo(() => useSessionStore.getState().stopSpeechPlayback, []);
  const startSpeechPlayback = useMemo(() => useSessionStore.getState().startSpeechPlayback, []);
  const updateSpeechPlayback = useMemo(() => useSessionStore.getState().updateSpeechPlayback, []);

  const stopAssistantSpeech = useCallback(
    (systemMessage?: string) => {
      speechTokenRef.current += 1;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopSpeechPlayback(systemMessage);
    },
    [stopSpeechPlayback],
  );

  const speakAssistantText = useCallback(async (messageId: string, text: string) => {
    const cleanedText = text.trim();
    if (!cleanedText) {
      return;
    }

    if (!("speechSynthesis" in window)) {
      throw new Error("当前浏览器不支持 SpeechSynthesis。");
    }

    const segments = splitIntoSpeechSegments(cleanedText);
    if (!segments.length) {
      return;
    }
    const token = speechTokenRef.current + 1;
    speechTokenRef.current = token;
    window.speechSynthesis.cancel();
    startSpeechPlayback(messageId);

    for (const [segmentIndex, segment] of segments.entries()) {
      if (speechTokenRef.current !== token) {
        break;
      }
      updateSpeechPlayback(messageId, segmentIndex);

      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.lang = "zh-CN";
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(new Error("浏览器语音播报失败。"));
        window.speechSynthesis.speak(utterance);
      });
    }
    if (speechTokenRef.current === token) {
      stopSpeechPlayback("AI 语音播报已完成。");
    }
  }, [startSpeechPlayback, stopSpeechPlayback, updateSpeechPlayback]);

  useEffect(() => {
    client.onStatusChange((status) => {
      useSessionStore.getState().setConnectionStatus(status);
    });
    client.onEvent((event) => {
      useSessionStore.getState().handleServerEvent(event);
      if (event.type === "llm.done" && useSessionStore.getState().ttsEnabled) {
        const latestAssistantMessage = [...useSessionStore.getState().messages]
          .reverse()
          .find((message) => message.role === "assistant");

        if (!latestAssistantMessage) {
          return;
        }

        void speakAssistantText(latestAssistantMessage.id, event.fullText).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "未知错误";
          useSessionStore.setState({
            systemMessage: `AI 文本已返回，但语音播报失败：${message}`,
          });
          stopSpeechPlayback();
        });
      }
    });
    client.connect();

    return () => {
      stopAssistantSpeech();
      client.disconnect();
    };
  }, [client, speakAssistantText, stopAssistantSpeech, stopSpeechPlayback]);

  useEffect(() => {
    if (!ttsEnabled) {
      stopAssistantSpeech("AI 语音播报已关闭。");
    }
  }, [stopAssistantSpeech, ttsEnabled]);

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
      void startPreview(inputSource);
      return;
    }
    stopPreview();
  }, [inputSource, sessionId, startPreview, stopPreview, visionEnabled]);

  const startSession = async () => {
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
  };

  const closeSession = () => {
    if (!sessionId) {
      return;
    }
    stopAssistantSpeech("已停止当前语音播报。");
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
    inputSource,
    inputLevel,
    recordedChunks,
    isCapturing,
    isMainPreviewReady,
    isPipPreviewReady,
    bindMainVideoElement,
    bindPipVideoElement,
    visionEnabled,
    ttsEnabled,
    setInputSource,
    stopAssistantSpeech,
    reconnect,
    startSession,
    closeSession,
    startCapture,
    stopCapture,
  };
}
