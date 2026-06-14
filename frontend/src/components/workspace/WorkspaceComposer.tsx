import type * as React from "react";
import { AudioLines, Camera, Link2, Link2Off, MessageSquarePlus, Monitor } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceComposerProps = {
  composerRef: React.RefObject<HTMLDivElement | null>;
  inputSource: "camera" | "screen";
  connectionStatus: "idle" | "connecting" | "connected" | "closed";
  sessionStatus: string;
  sessionId: string | null;
  inputLevel: number;
  isCapturing: boolean;
  isCaptureBooting: boolean;
  isRecordButtonExpanded: boolean;
  sourceSwitchDisabled: boolean;
  onSourceChange: (nextSource: "camera" | "screen") => void;
  onConnectionToggle: () => void;
  onStartNewSession: () => void;
  onCaptureToggle: () => void;
};

function RecordWave({ isCapturing, inputLevel }: { isCapturing: boolean; inputLevel: number }) {
  return (
    <div
      className="flex w-full scale-100 items-center justify-center gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)]"
      aria-hidden="true"
    >
      {Array.from({ length: 9 }).map((_, index) => {
        const activeBase = 8 + ((index % 4) + 1) * 4;
        const expandedBase = [8, 11, 14, 17, 20, 17, 14, 11, 8][index] ?? 11;
        const height = isCapturing ? Math.round(activeBase + inputLevel * (8 + (index % 3) * 2)) : expandedBase;
        return (
          <span
            key={`record-wave-${index}`}
            className="block w-[3px] rounded-full bg-white transition-all duration-150"
            style={{
              height: `${height}px`,
              opacity: isCapturing ? 0.62 + inputLevel * 0.38 : 0.7,
            }}
          />
        );
      })}
    </div>
  );
}

export function WorkspaceComposer({
  composerRef,
  inputSource,
  connectionStatus,
  sessionStatus,
  sessionId,
  inputLevel,
  isCapturing,
  isCaptureBooting,
  isRecordButtonExpanded,
  sourceSwitchDisabled,
  onSourceChange,
  onConnectionToggle,
  onStartNewSession,
  onCaptureToggle,
}: WorkspaceComposerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 sm:bottom-5 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div
          ref={composerRef}
          className="pointer-events-auto rounded-full border border-black/10 bg-white/96 px-3 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.10)] backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-black/10 bg-zinc-50 p-1">
              <button
                type="button"
                onClick={() => onSourceChange("camera")}
                disabled={sourceSwitchDisabled}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors disabled:cursor-not-allowed",
                  inputSource === "camera" ? "bg-black text-white" : "text-zinc-600 hover:bg-black/5",
                )}
              >
                <Camera className="size-4" />
                镜头
              </button>
              <button
                type="button"
                onClick={() => onSourceChange("screen")}
                disabled={sourceSwitchDisabled}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors disabled:cursor-not-allowed",
                  inputSource === "screen" ? "bg-black text-white" : "text-zinc-600 hover:bg-black/5",
                )}
              >
                <Monitor className="size-4" />
                屏幕
              </button>
            </div>

            <div className="min-w-0 flex-1 px-1" />

            <button
              type="button"
              onClick={onConnectionToggle}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-300",
                connectionStatus === "connected"
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.26)]"
                  : "border-black/10 bg-white text-black hover:bg-black/3",
              )}
              aria-label={connectionStatus === "connected" ? "断开连接" : "连接"}
            >
              {connectionStatus === "connected" ? <Link2Off className="size-5" /> : <Link2 className="size-5" />}
            </button>

            <button
              type="button"
              onClick={onStartNewSession}
              disabled={connectionStatus === "connecting"}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
                "border-black/10 bg-white text-black hover:bg-black/3",
              )}
              aria-label="新对话"
            >
              <MessageSquarePlus className="size-5" />
            </button>

            <button
              type="button"
              onClick={onCaptureToggle}
              disabled={
                connectionStatus !== "connected" ||
                !sessionId ||
                sessionStatus === "idle" ||
                sessionStatus === "closed" ||
                sessionStatus === "recognizing" ||
                sessionStatus === "transcribing" ||
                isCaptureBooting
              }
              className={cn(
                "flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-white transition-all duration-300 ease-[cubic-bezier(0.22,0.9,0.22,1)] disabled:cursor-not-allowed disabled:bg-zinc-400",
                isRecordButtonExpanded ? "w-[124px] px-4 shadow-[0_14px_32px_rgba(0,0,0,0.22)]" : "w-11 px-0 shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
              )}
              aria-label={
                sessionStatus === "recording"
                  ? "结束本轮发言"
                  : isCaptureBooting
                    ? "正在启动持续收音"
                    : sessionId
                      ? "持续监听中"
                      : "开始通话"
              }
            >
              {isRecordButtonExpanded ? (
                <RecordWave isCapturing={isCapturing} inputLevel={inputLevel} />
              ) : (
                <AudioLines className="size-5 text-white" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
