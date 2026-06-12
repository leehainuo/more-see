import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessionStore } from "@/store/useSessionStore";

type SendFrameCapturePayload = {
  sessionId: string;
  frameId: string;
  inputSource: "camera" | "screen";
  imageBase64: string;
  width: number;
  height: number;
  capturedAt: string;
};

type UseVisualCaptureOptions = {
  sendFrameCapture: (payload: SendFrameCapturePayload) => void;
};

export function useVisualCapture({ sendFrameCapture }: UseVisualCaptureOptions) {
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  const addLocalKeyframe = useMemo(() => useSessionStore.getState().addLocalKeyframe, []);
  const setVisionStatus = useMemo(() => useSessionStore.getState().setVisionStatus, []);

  const bindVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      void element.play().catch(() => undefined);
    }
  }, []);

  const startPreview = useCallback(async () => {
    if (streamRef.current) {
      const element = videoElementRef.current;
      if (element) {
        element.srcObject = streamRef.current;
        await element.play().catch(() => undefined);
      }
      setIsPreviewReady(true);
      setVisionStatus("preview", "摄像头预览已就绪，可在录音结束时抓取关键帧。");
      return true;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVisionStatus("error", "当前浏览器不支持摄像头采集，视觉联动已降级。");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      const element = videoElementRef.current;
      if (element) {
        element.srcObject = stream;
        await element.play().catch(() => undefined);
      }
      setIsPreviewReady(true);
      setVisionStatus("preview", "摄像头预览已开启，视觉联动准备就绪。");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setIsPreviewReady(false);
      setVisionStatus("error", `摄像头启动失败：${message}`);
      return false;
    }
  }, [setVisionStatus]);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }
    setIsPreviewReady(false);
  }, []);

  const captureFrameForTurn = useCallback(
    async (payload: { sessionId: string; inputSource: "camera" | "screen" }) => {
      const element = videoElementRef.current;
      if (!element || !isPreviewReady || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setVisionStatus("error", "当前没有可用的视频画面，本轮将仅返回语音识别结果。");
        return false;
      }

      const width = element.videoWidth || 1280;
      const height = element.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        setVisionStatus("error", "浏览器无法创建画布上下文，本轮将仅返回语音识别结果。");
        return false;
      }

      context.drawImage(element, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const imageBase64 = dataUrl.split(",")[1] ?? "";
      const frameId = crypto.randomUUID();
      const capturedAt = new Date().toISOString();

      addLocalKeyframe({
        id: frameId,
        dataUrl,
        capturedAt,
        inputSource: payload.inputSource,
        width,
        height,
      });
      sendFrameCapture({
        sessionId: payload.sessionId,
        frameId,
        inputSource: payload.inputSource,
        imageBase64,
        width,
        height,
        capturedAt,
      });
      return true;
    },
    [addLocalKeyframe, isPreviewReady, sendFrameCapture, setVisionStatus],
  );

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  return {
    bindVideoElement,
    isPreviewReady,
    startPreview,
    stopPreview,
    captureFrameForTurn,
  };
}
