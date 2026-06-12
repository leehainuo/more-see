export type ClientEvent =
  | {
      type: "session.start";
      sessionId?: string;
      inputSource: "camera" | "screen";
      deviceInfo?: { micLabel?: string; cameraLabel?: string };
    }
  | {
      type: "session.ping";
      sessionId?: string;
    }
  | {
      type: "session.end";
      sessionId: string;
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
      text: string;
    }
  | {
      type: "llm.done";
      sessionId: string;
      fullText: string;
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
