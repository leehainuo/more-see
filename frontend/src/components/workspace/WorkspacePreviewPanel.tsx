import type * as React from "react";
import { Camera, Monitor } from "lucide-react";

type WorkspacePreviewPanelProps = {
  inputSource: "camera" | "screen";
  isMainPreviewReady: boolean;
  isPipPreviewReady: boolean;
  bindMainVideoElement: React.Ref<HTMLVideoElement>;
  bindPipVideoElement: React.Ref<HTMLVideoElement>;
};

export function WorkspacePreviewPanel({
  inputSource,
  isMainPreviewReady,
  isPipPreviewReady,
  bindMainVideoElement,
  bindPipVideoElement,
}: WorkspacePreviewPanelProps) {
  const isScreenMode = inputSource === "screen";

  return (
    <div className="floating-panel-enter w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[22px] border border-black/10 bg-[#f5f5f5] shadow-[0_24px_60px_rgba(0,0,0,0.16)]">
      <div className="relative aspect-16/10 bg-zinc-950">
        <video
          ref={bindMainVideoElement}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            isMainPreviewReady ? "opacity-100" : "opacity-0"
          }`}
          autoPlay
          playsInline
          muted
        />

        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] tracking-[0.18em] text-white/90 uppercase backdrop-blur">
          {isScreenMode ? "Screen" : "Camera"}
        </div>

        {!isMainPreviewReady ? (
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="rounded-[24px] border border-white/15 bg-white/8 px-12 py-7 text-center backdrop-blur">
              {isScreenMode ? (
                <Monitor className="mx-auto size-6 text-white/65" />
              ) : (
                <Camera className="mx-auto size-6 text-white/65" />
              )}
              <p className="mt-3 text-sm text-white/72">{isScreenMode ? "等待屏幕共享画面" : "等待摄像头画面"}</p>
            </div>
          </div>
        ) : null}

        {isScreenMode ? (
          <div className="absolute bottom-3 right-3 w-[112px] overflow-hidden rounded-2xl border border-white/20 bg-black/55 shadow-[0_16px_36px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="relative aspect-3/4 bg-zinc-900">
              <video
                ref={bindPipVideoElement}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                  isPipPreviewReady ? "opacity-100" : "opacity-0"
                }`}
                autoPlay
                playsInline
                muted
              />
              {!isPipPreviewReady ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Camera className="size-5 text-white/58" />
                </div>
              ) : null}
              <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/90">
                Self
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
