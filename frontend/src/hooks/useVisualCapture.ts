import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessionStore } from "@/store/useSessionStore";

type InputSource = "camera" | "screen";

type SendFrameCapturePayload = {
  sessionId: string;
  frameId: string;
  inputSource: InputSource;
  imageBase64: string;
  width: number;
  height: number;
  capturedAt: string;
};

type UseVisualCaptureOptions = {
  inputSource: InputSource;
  sendFrameCapture: (payload: SendFrameCapturePayload) => void;
  onInputSourceChange?: (source: InputSource) => void;
};

export function useVisualCapture({
  inputSource,
  sendFrameCapture,
  onInputSourceChange,
}: UseVisualCaptureOptions) {
  const mainVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoElementRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const manualScreenStopRef = useRef(false);
  const [isMainPreviewReady, setIsMainPreviewReady] = useState(false);
  const [isPipPreviewReady, setIsPipPreviewReady] = useState(false);

  const addLocalKeyframe = useMemo(() => useSessionStore.getState().addLocalKeyframe, []);
  const setVisionStatus = useMemo(() => useSessionStore.getState().setVisionStatus, []);

  const bindMainVideoElement = useCallback((element: HTMLVideoElement | null) => {
    mainVideoElementRef.current = element;
    const stream = inputSource === "screen" ? screenStreamRef.current : cameraStreamRef.current;
    if (element && stream) {
      element.srcObject = stream;
      void element.play().catch(() => undefined);
    }
  }, [inputSource]);

  const bindPipVideoElement = useCallback((element: HTMLVideoElement | null) => {
    pipVideoElementRef.current = element;
    if (element && cameraStreamRef.current && inputSource === "screen") {
      element.srcObject = cameraStreamRef.current;
      void element.play().catch(() => undefined);
    } else if (element) {
      element.srcObject = null;
    }
  }, [inputSource]);

  const stopScreenShare = useCallback(() => {
    manualScreenStopRef.current = true;
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    if (mainVideoElementRef.current && inputSource === "screen") {
      mainVideoElementRef.current.srcObject = null;
    }
    setIsMainPreviewReady(false);
    setIsPipPreviewReady(false);
  }, [inputSource]);

  const stopCameraPreview = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (mainVideoElementRef.current && inputSource === "camera") {
      mainVideoElementRef.current.srcObject = null;
    }
    if (pipVideoElementRef.current) {
      pipVideoElementRef.current.srcObject = null;
    }
    setIsMainPreviewReady(false);
    setIsPipPreviewReady(false);
  }, [inputSource]);

  const attachStream = useCallback(async (element: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!element) {
      return;
    }
    element.srcObject = stream;
    if (stream) {
      await element.play().catch(() => undefined);
    }
  }, []);

  const ensureCameraStream = useCallback(async () => {
    if (cameraStreamRef.current) {
      return cameraStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVisionStatus("error", "当前浏览器不支持摄像头采集，视觉联动已降级。");
      return null;
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
      cameraStreamRef.current = stream;
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setVisionStatus("error", `摄像头启动失败：${message}`);
      return null;
    }
  }, [setVisionStatus]);

  const ensureScreenStream = useCallback(async () => {
    if (screenStreamRef.current) {
      return screenStreamRef.current;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setVisionStatus("error", "当前浏览器不支持屏幕共享，请切换回摄像头模式。");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 12, max: 15 },
        },
        audio: false,
      });
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          const isManualStop = manualScreenStopRef.current;
          manualScreenStopRef.current = false;
          screenStreamRef.current = null;
          if (mainVideoElementRef.current) {
            mainVideoElementRef.current.srcObject = null;
          }
          setIsMainPreviewReady(false);
          setIsPipPreviewReady(false);
          if (isManualStop) {
            return;
          }
          setVisionStatus("preview", "屏幕共享已结束，已自动切回摄像头模式。");
          onInputSourceChange?.("camera");
        };
      }
      screenStreamRef.current = stream;
      manualScreenStopRef.current = false;
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setVisionStatus("error", `屏幕共享启动失败：${message}`);
      return null;
    }
  }, [onInputSourceChange, setVisionStatus]);

  const startPreview = useCallback(async (preferredInputSource: InputSource = inputSource) => {
    if (preferredInputSource === "screen") {
      const screenStream = await ensureScreenStream();
      if (!screenStream) {
        return false;
      }

      const cameraStream = await ensureCameraStream();
      await attachStream(mainVideoElementRef.current, screenStream);
      await attachStream(pipVideoElementRef.current, cameraStream);
      setIsMainPreviewReady(true);
      setIsPipPreviewReady(Boolean(cameraStream));
      setVisionStatus(
        "preview",
        cameraStream
          ? "屏幕共享已开启，主画面使用屏幕，摄像头保留为自拍小窗。"
          : "屏幕共享已开启，但摄像头不可用，本轮仅展示屏幕主画面。",
      );
      return true;
    }

    if (screenStreamRef.current) {
      stopScreenShare();
    }

    const cameraStream = await ensureCameraStream();
    if (!cameraStream) {
      return false;
    }

    await attachStream(mainVideoElementRef.current, cameraStream);
    await attachStream(pipVideoElementRef.current, null);
    setIsMainPreviewReady(true);
    setIsPipPreviewReady(false);
    setVisionStatus("preview", "摄像头预览已开启，视觉联动准备就绪。");
    return true;
  }, [attachStream, ensureCameraStream, ensureScreenStream, inputSource, setVisionStatus, stopScreenShare]);

  const stopPreview = useCallback(() => {
    stopScreenShare();
    stopCameraPreview();
    setIsMainPreviewReady(false);
    setIsPipPreviewReady(false);
  }, [stopCameraPreview, stopScreenShare]);

  const captureFrameForTurn = useCallback(
    async (payload: { sessionId: string; inputSource: InputSource }) => {
      const element = mainVideoElementRef.current;
      if (!element || !isMainPreviewReady || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setVisionStatus("error", "当前没有可用的视频画面，本轮将仅返回语音识别结果。");
        return false;
      }

      const rawWidth = element.videoWidth || 1280;
      const rawHeight = element.videoHeight || 720;
      const maxWidth = payload.inputSource === "screen" ? 960 : 720;
      const scale = Math.min(1, maxWidth / rawWidth);
      const width = Math.max(1, Math.round(rawWidth * scale));
      const height = Math.max(1, Math.round(rawHeight * scale));
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
    [addLocalKeyframe, isMainPreviewReady, sendFrameCapture, setVisionStatus],
  );

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  return {
    bindMainVideoElement,
    bindPipVideoElement,
    isMainPreviewReady,
    isPipPreviewReady,
    startPreview,
    stopPreview,
    captureFrameForTurn,
  };
}
