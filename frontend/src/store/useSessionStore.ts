import { create } from "zustand";

import type { ChatMessage, ServerEvent } from "@/lib/ws-types";

type ConnectionStatus = "idle" | "connecting" | "connected" | "closed";
type SessionStatus = "idle" | "ready" | "recording" | "transcribing" | "streaming" | "closed" | "error";
type VisionStatus = "idle" | "preview" | "capturing" | "summarizing" | "ready" | "error";
type Keyframe = {
  id: string;
  dataUrl: string;
  capturedAt: string;
  inputSource: "camera" | "screen";
  width: number;
  height: number;
  summary?: string;
  turnId?: string;
};

type SessionState = {
  connectionStatus: ConnectionStatus;
  sessionStatus: SessionStatus;
  sessionId: string | null;
  systemMessage: string;
  inputLevel: number;
  recordedChunks: number;
  messages: ChatMessage[];
  visionEnabled: boolean;
  visionStatus: VisionStatus;
  visionSummary: string;
  keyframes: Keyframe[];
  setConnectionStatus: (status: ConnectionStatus) => void;
  setRecordingState: (status: "recording" | "transcribing" | "ready", level?: number) => void;
  setRecordedChunks: (count: number) => void;
  setVisionEnabled: (enabled: boolean) => void;
  setVisionStatus: (status: VisionStatus, systemMessage?: string) => void;
  addLocalKeyframe: (frame: Keyframe) => void;
  resetMessages: () => void;
  appendUserMessage: (content: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: "initial-assistant",
    role: "assistant",
    content: "当前分支正在接入关键帧抓取、视觉摘要回传，并保留语音采集与 ASR 联调链路。",
  },
  {
    id: "initial-user",
    role: "user",
    content: "点击“开始会话”后，可打开视觉联动并在录音结束时自动抓取关键帧，随后同时查看 ASR 与视觉摘要结果。",
  },
];

export const useSessionStore = create<SessionState>((set) => ({
  connectionStatus: "idle",
  sessionStatus: "idle",
  sessionId: null,
  systemMessage: "等待连接 WebSocket 通道。",
  inputLevel: 0,
  recordedChunks: 0,
  messages: initialMessages,
  visionEnabled: true,
  visionStatus: "idle",
  visionSummary: "",
  keyframes: [],

  setConnectionStatus: (status) => {
    set({
      connectionStatus: status,
      systemMessage:
        status === "connecting"
          ? "正在建立 WebSocket 连接。"
          : status === "connected"
            ? "WebSocket 已连接，等待开始会话。"
            : status === "closed"
              ? "WebSocket 已关闭，可重新连接。"
              : "等待连接 WebSocket 通道。",
    });
  },

  setRecordingState: (status, level = 0) => {
    set((state) => ({
      sessionStatus: status,
      inputLevel: level,
      systemMessage:
        status === "recording"
          ? "正在监听你的语音输入，静音 1.5 秒后自动提交。"
          : status === "transcribing"
            ? "语音已提交，正在等待 ASR 识别结果。"
            : state.systemMessage,
    }));
  },

  setRecordedChunks: (count) => {
    set({
      recordedChunks: count,
    });
  },

  setVisionEnabled: (enabled) => {
    set({
      visionEnabled: enabled,
      visionStatus: enabled ? "preview" : "idle",
      systemMessage: enabled ? "视觉联动已开启，会在录音结束时尝试抓取关键帧。" : "视觉联动已关闭，本轮仅执行语音识别。",
    });
  },

  setVisionStatus: (status, systemMessage) => {
    set((state) => ({
      visionStatus: status,
      systemMessage: systemMessage ?? state.systemMessage,
    }));
  },

  addLocalKeyframe: (frame) => {
    set((state) => ({
      visionStatus: "capturing",
      keyframes: [frame, ...state.keyframes].slice(0, 6),
      systemMessage: "关键帧已抓取，正在等待后端视觉摘要。",
    }));
  },

  resetMessages: () => {
    set({
      messages: initialMessages,
      sessionStatus: "idle",
      sessionId: null,
      systemMessage: "等待连接 WebSocket 通道。",
      inputLevel: 0,
      recordedChunks: 0,
      visionStatus: "idle",
      visionSummary: "",
      keyframes: [],
    });
  },

  appendUserMessage: (content) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
        },
      ],
    }));
  },

  handleServerEvent: (event) => {
    set((state) => {
      switch (event.type) {
        case "connection.ready":
          return {
            systemMessage: "WebSocket 已建立，准备开始会话。",
          };

        case "session.ready":
          return {
            sessionId: event.sessionId,
            sessionStatus: "ready",
            visionStatus: state.visionEnabled ? "preview" : "idle",
            systemMessage: `会话 ${event.sessionId.slice(0, 8)} 已创建，可持续接收事件。`,
          };

        case "session.status":
          return {
            systemMessage: event.message,
          };

        case "asr.result":
          return {
            sessionStatus: "ready",
            recordedChunks: 0,
            inputLevel: 0,
            messages: [
              ...state.messages,
              {
                id: crypto.randomUUID(),
                role: "user",
                content: event.transcript,
              },
            ],
            systemMessage: `已完成 ${event.chunkCount} 段音频识别，识别来源为 ${event.provider}。`,
          };

        case "frame.stored":
          return {
            visionStatus: "summarizing",
            systemMessage: event.message,
          };

        case "vision.result":
          return {
            visionStatus: "ready",
            visionSummary: event.summary,
            keyframes: state.keyframes.map((frame) =>
              frame.id === event.frameId
                ? {
                    ...frame,
                    summary: event.summary,
                    turnId: event.turnId,
                  }
                : frame,
            ),
            messages: [
              ...state.messages,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: `视觉摘要：${event.summary}`,
              },
            ],
            systemMessage: `关键帧视觉摘要已返回，识别来源为 ${event.provider}。`,
          };

        case "vision.error":
          return {
            visionStatus: "error",
            systemMessage: `${event.code}: ${event.message}`,
          };

        case "session.pong":
          return {
            systemMessage: "已收到后端心跳响应，连接保持正常。",
          };

        case "llm.delta": {
          const lastMessage = state.messages[state.messages.length - 1];
          if (lastMessage?.role === "assistant" && lastMessage.streaming) {
            return {
              sessionStatus: "streaming",
              messages: [
                ...state.messages.slice(0, -1),
                {
                  ...lastMessage,
                  content: `${lastMessage.content}${event.text}`,
                },
              ],
            };
          }

          return {
            sessionStatus: "streaming",
            messages: [
              ...state.messages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: event.text,
                streaming: true,
              },
            ],
          };
        }

        case "llm.done": {
          const lastMessage = state.messages[state.messages.length - 1];
          if (lastMessage?.role === "assistant") {
            return {
              sessionStatus: "ready",
              messages: [
                ...state.messages.slice(0, -1),
                {
                  ...lastMessage,
                  content: event.fullText,
                  streaming: false,
                },
              ],
            };
          }
          return {
            sessionStatus: "ready",
          };
        }

        case "session.closed":
          return {
            sessionStatus: "closed",
            sessionId: null,
            inputLevel: 0,
            recordedChunks: 0,
            visionStatus: state.visionEnabled ? "preview" : "idle",
            visionSummary: "",
            keyframes: [],
            systemMessage: "会话已关闭，可以重新开始。",
          };

        case "error":
          return {
            sessionStatus: "error",
            systemMessage: `${event.code}: ${event.message}`,
          };

        default:
          return state;
      }
    });
  },
}));
