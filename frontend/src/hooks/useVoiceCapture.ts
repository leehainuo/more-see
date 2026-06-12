import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessionStore } from "@/store/useSessionStore";

type VoiceCaptureOptions = {
  sessionId: string | null;
  inputSource: "camera" | "screen";
  visionEnabled: boolean;
  sendAudioChunk: (payload: {
    sessionId: string;
    chunkId: string;
    mimeType: string;
    base64Audio: string;
    durationMs: number;
  }) => void;
  commitTurn: (payload: { sessionId: string; turnId: string; silenceMs: number; includeVision: boolean }) => void;
  captureFrameForTurn: (payload: { sessionId: string; inputSource: "camera" | "screen" }) => Promise<boolean>;
};

const SILENCE_THRESHOLD = 0.02;
const AUTO_COMMIT_MS = 1500;

async function blobToBase64(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

export function useVoiceCapture({
  sessionId,
  inputSource,
  visionEnabled,
  sendAudioChunk,
  commitTurn,
  captureFrameForTurn,
}: VoiceCaptureOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const chunkCountRef = useRef(0);

  const [isCapturing, setIsCapturing] = useState(false);
  const inputLevel = useSessionStore((state) => state.inputLevel);
  const recordedChunks = useSessionStore((state) => state.recordedChunks);

  const setRecordingState = useMemo(() => useSessionStore.getState().setRecordingState, []);
  const setRecordedChunks = useMemo(() => useSessionStore.getState().setRecordedChunks, []);

  const cleanupSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopCapture = useCallback(() => {
    cleanupSilenceTimer();
    analyserRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCapturing(false);
    setRecordingState("transcribing", 0);
  }, [cleanupSilenceTimer, setRecordingState]);

  const monitorVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !mediaRecorderRef.current) {
      return;
    }

    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let index = 0; index < dataArray.length; index += 1) {
        const normalized = (dataArray[index] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const normalizedLevel = Math.min(1, rms * 10);
      setRecordingState("recording", normalizedLevel);

      if (rms > SILENCE_THRESHOLD) {
        cleanupSilenceTimer();
      } else if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          stopCapture();
        }, AUTO_COMMIT_MS);
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  }, [cleanupSilenceTimer, setRecordingState, stopCapture]);

  const startCapture = useCallback(async () => {
    if (!sessionId || isCapturing) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      useSessionStore.setState({
        sessionStatus: "error",
        systemMessage: "当前浏览器不支持麦克风采集，请更换到支持 getUserMedia 的环境。",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      streamRef.current = stream;
      chunkCountRef.current = 0;
      setRecordedChunks(0);
      setIsCapturing(true);
      startedAtRef.current = Date.now();

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (!sessionId || event.data.size === 0) {
          return;
        }

        chunkCountRef.current += 1;
        setRecordedChunks(chunkCountRef.current);

        const base64Audio = await blobToBase64(event.data);
        sendAudioChunk({
          sessionId,
          chunkId: crypto.randomUUID(),
          mimeType,
          base64Audio,
          durationMs: Date.now() - startedAtRef.current,
        });
      };

      mediaRecorder.onstop = () => {
        if (!sessionId) {
          return;
        }
        void (async () => {
          const turnId = crypto.randomUUID();
          const includeVision =
            visionEnabled &&
            (await captureFrameForTurn({
              sessionId,
              inputSource,
            }));
          commitTurn({
            sessionId,
            turnId,
            silenceMs: AUTO_COMMIT_MS,
            includeVision,
          });
        })();
      };

      mediaRecorder.start(900);
      setRecordingState("recording", 0.05);
      monitorVolume();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      useSessionStore.setState({
        sessionStatus: "error",
        systemMessage: `麦克风启动失败：${message}`,
      });
      setIsCapturing(false);
    }
  }, [
    commitTurn,
    captureFrameForTurn,
    inputSource,
    isCapturing,
    monitorVolume,
    sendAudioChunk,
    sessionId,
    setRecordedChunks,
    setRecordingState,
    visionEnabled,
  ]);

  useEffect(() => {
    return () => {
      cleanupSilenceTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
    };
  }, [cleanupSilenceTimer]);

  return {
    inputLevel,
    recordedChunks,
    isCapturing,
    startCapture,
    stopCapture,
  };
}
