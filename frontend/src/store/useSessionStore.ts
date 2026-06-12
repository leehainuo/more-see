import { create } from "zustand";

import type { ChatMessage, ServerEvent } from "@/lib/ws-types";

type ConnectionStatus = "idle" | "connecting" | "connected" | "closed";
type SessionStatus = "idle" | "ready" | "recording" | "recognizing" | "transcribing" | "streaming" | "closed" | "error";
type VisionStatus = "idle" | "preview" | "capturing" | "summarizing" | "ready" | "error";
type InputSource = "camera" | "screen";
type AssistantAudioStatus = "idle" | "speaking";
type Keyframe = {
  id: string;
  dataUrl: string;
  capturedAt: string;
  inputSource: InputSource;
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
  inputSource: InputSource;
  visionEnabled: boolean;
  visionStatus: VisionStatus;
  visionSummary: string;
  assistantAudioStatus: AssistantAudioStatus;
  keyframes: Keyframe[];
  setConnectionStatus: (status: ConnectionStatus) => void;
  setRecordingState: (status: "recording" | "recognizing" | "transcribing" | "ready", level?: number) => void;
  setRecordedChunks: (count: number) => void;
  setInputSource: (source: InputSource) => void;
  setVisionEnabled: (enabled: boolean) => void;
  setVisionStatus: (status: VisionStatus, systemMessage?: string) => void;
  addLocalKeyframe: (frame: Keyframe) => void;
  resetMessages: () => void;
  appendUserMessage: (content: string) => void;
  markAssistantAudioPlaybackComplete: () => void;
  handleServerEvent: (event: ServerEvent) => void;
};

const initialMessages: ChatMessage[] = [];

export const useSessionStore = create<SessionState>((set) => ({
  connectionStatus: "idle",
  sessionStatus: "idle",
  sessionId: null,
  systemMessage: "等待连接 WebSocket 通道。",
  inputLevel: 0,
  recordedChunks: 0,
  messages: initialMessages,
  inputSource: "camera",
  visionEnabled: true,
  visionStatus: "idle",
  visionSummary: "",
  assistantAudioStatus: "idle",
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
          ? "正在听你说话，停顿 1.2 秒后会自动提交这一轮。"
          : status === "recognizing"
            ? "语音已提交，正在等待 ASR 识别结果。"
          : status === "transcribing"
            ? "语音识别完成，正在等待 AI 回复。"
            : status === "ready"
              ? "通话已接通，正在持续监听，你可以直接开口。"
              : state.systemMessage,
    }));
  },

  setRecordedChunks: (count) => {
    set({
      recordedChunks: count,
    });
  },

  setInputSource: (inputSource) => {
    set((state) => ({
      inputSource,
      visionStatus: state.visionEnabled ? "preview" : "idle",
      systemMessage:
        inputSource === "screen"
          ? "已切换到屏幕共享模式，主画面会使用屏幕，摄像头保留为小窗。"
          : "已切换到摄像头模式，当前主画面将直接使用自拍画面。",
    }));
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
      visionSummary: "",
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
      assistantAudioStatus: "idle",
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

  markAssistantAudioPlaybackComplete: () => {
    set((state) => ({
      sessionStatus: state.sessionStatus === "streaming" ? "ready" : state.sessionStatus,
      assistantAudioStatus: "idle",
      systemMessage:
        state.sessionStatus === "closed"
          ? state.systemMessage
          : state.sessionStatus === "error"
            ? state.systemMessage
          : state.sessionStatus === "streaming"
            ? "AI 语音播报完成，通话保持持续监听。"
            : state.systemMessage,
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
            inputSource: event.inputSource,
            visionStatus: state.visionEnabled ? "preview" : "idle",
            systemMessage: `会话 ${event.sessionId.slice(0, 8)} 已接通，正在持续监听。`,
          };

        case "session.status":
          return {
            systemMessage: event.message,
          };

        case "asr.result":
          if (event.provider !== "volcengine") {
            return {
              sessionStatus: "ready",
              recordedChunks: 0,
              inputLevel: 0,
              systemMessage: "本轮语音识别未成功，已跳过 AI 回复。通话保持连接，你可以继续说话。",
            };
          }
          return {
            sessionStatus: "transcribing",
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
              sessionStatus: state.assistantAudioStatus === "speaking" ? "streaming" : "ready",
              messages: [
                ...state.messages.slice(0, -1),
                {
                  ...lastMessage,
                  content: event.fullText,
                  streaming: false,
                },
              ],
              systemMessage:
                state.assistantAudioStatus === "speaking"
                  ? "AI 文字回复已完成，语音仍在播报中，请等待播报结束。"
                  : "AI 已完成本轮多模态回复，通话仍在持续监听中。",
            };
          }
          return {
            sessionStatus: state.assistantAudioStatus === "speaking" ? "streaming" : "ready",
            systemMessage:
              state.assistantAudioStatus === "speaking"
                ? "AI 文字回复已完成，语音仍在播报中，请等待播报结束。"
                : "AI 已完成本轮多模态回复，通话仍在持续监听中。",
          };
        }

        case "tts.start":
          return {
            assistantAudioStatus: "speaking",
            systemMessage: "AI 正在播报语音，播报结束后会继续监听你的下一轮发言。",
          };

        case "tts.done":
          return {
            sessionStatus: "streaming",
            assistantAudioStatus: "speaking",
            systemMessage: "AI 语音数据已发送完成，正在播放剩余音频。",
          };

        case "assistant.interrupted":
          return {
            assistantAudioStatus: "idle",
            sessionStatus: state.sessionStatus === "streaming" ? "ready" : state.sessionStatus,
            systemMessage: "当前 AI 播报已结束，系统会继续监听你的下一轮发言。",
          };

        case "session.closed":
          return {
            sessionStatus: "closed",
            sessionId: null,
            inputLevel: 0,
            recordedChunks: 0,
            visionStatus: state.visionEnabled ? "preview" : "idle",
            visionSummary: "",
            assistantAudioStatus: "idle",
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
