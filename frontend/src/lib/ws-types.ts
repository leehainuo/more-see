export type ClientEvent =
  | {
      type: "session.start";
      sessionId?: string;
      inputSource: "camera" | "screen";
      deviceInfo?: { micLabel?: string; cameraLabel?: string };
    }
  | {
      type: "audio.chunk";
      sessionId: string;
      chunkId: string;
      mimeType: string;
      base64Audio: string;
      durationMs: number;
    }
  | {
      type: "frame.capture";
      sessionId: string;
      frameId: string;
      inputSource: "camera" | "screen";
      imageBase64: string;
      width: number;
      height: number;
      capturedAt: string;
    }
  | {
      type: "turn.commit";
      sessionId: string;
      turnId: string;
      silenceMs: number;
      includeVision: boolean;
    }
  | {
      type: "session.ping";
      sessionId?: string;
    }
  | {
      type: "session.end";
      sessionId: string;
    }
  | {
      type: "assistant.interrupt";
      sessionId: string;
      reason?: string;
    }
  | {
      type: "asr.partial.request";
      sessionId: string;
      requestId: string;
    };

export type ServerEvent =
  | {
      type: "connection.ready";
      message: string;
    }
  | {
      type: "session.ready";
      sessionId: string;
      inputSource: "camera" | "screen";
      createdAt: string;
      message: string;
    }
  | {
      type: "session.status";
      sessionId: string;
      level: "info" | "warning" | "error";
      message: string;
    }
  | {
      type: "asr.partial";
      sessionId: string;
      requestId?: string;
      transcript: string;
      provider: string;
      durationMs: number;
      chunkCount: number;
      verdict: "echo" | "candidate" | "confirmed";
    }
  | {
      type: "asr.result";
      sessionId: string;
      turnId: string;
      transcript: string;
      provider: string;
      durationMs: number;
      chunkCount: number;
    }
  | {
      type: "frame.stored";
      sessionId: string;
      frameId: string;
      inputSource: "camera" | "screen";
      width: number;
      height: number;
      capturedAt: string;
      message: string;
    }
  | {
      type: "vision.result";
      sessionId: string;
      turnId: string;
      frameId: string;
      summary: string;
      provider: string;
      cacheHit: boolean;
      capturedAt: string;
    }
  | {
      type: "vision.error";
      sessionId: string;
      turnId: string;
      code: string;
      message: string;
    }
  | {
      type: "session.pong";
      sessionId?: string;
    }
  | {
      type: "session.closed";
      sessionId: string;
      message: string;
    }
  | {
      type: "llm.delta";
      sessionId: string;
      turnId: string;
      text: string;
    }
  | {
      type: "llm.done";
      sessionId: string;
      turnId: string;
      fullText: string;
    }
  | {
      type: "tts.start";
      sessionId: string;
      turnId: string;
      provider: string;
      mimeType: string;
      sampleRate: number;
    }
  | {
      type: "tts.chunk";
      sessionId: string;
      turnId: string;
      chunkSequence: number;
      audioBase64: string;
      mimeType: string;
      sampleRate: number;
      provider: string;
    }
  | {
      type: "tts.done";
      sessionId: string;
      turnId: string;
    }
  | {
      type: "assistant.interrupted";
      sessionId: string;
      turnId: string;
      reason: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  streaming?: boolean;
};
