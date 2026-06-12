import { create } from "zustand";

import type { ChatMessage, ServerEvent } from "@/lib/ws-types";

type ConnectionStatus = "idle" | "connecting" | "connected" | "closed";
type SessionStatus = "idle" | "ready" | "streaming" | "closed" | "error";

type SessionState = {
  connectionStatus: ConnectionStatus;
  sessionStatus: SessionStatus;
  sessionId: string | null;
  systemMessage: string;
  messages: ChatMessage[];
  setConnectionStatus: (status: ConnectionStatus) => void;
  resetMessages: () => void;
  appendUserMessage: (content: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: "initial-assistant",
    role: "assistant",
    content: "当前分支正在接入 WebSocket 会话生命周期，下面的消息会由后端实时推送。",
  },
  {
    id: "initial-user",
    role: "user",
    content: "点击“开始会话”后，将触发 session.start 并演示假流式回复。",
  },
];

export const useSessionStore = create<SessionState>((set) => ({
  connectionStatus: "idle",
  sessionStatus: "idle",
  sessionId: null,
  systemMessage: "等待连接 WebSocket 通道。",
  messages: initialMessages,

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

  resetMessages: () => {
    set({
      messages: initialMessages,
      sessionStatus: "idle",
      sessionId: null,
      systemMessage: "等待连接 WebSocket 通道。",
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
            systemMessage: `会话 ${event.sessionId.slice(0, 8)} 已创建，可持续接收事件。`,
          };

        case "session.status":
          return {
            systemMessage: event.message,
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
