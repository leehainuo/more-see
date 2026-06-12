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
const TARGET_SAMPLE_RATE = 16000;
// 8192 samples at common browser input rates lands around 170-185ms,
// which is closer to the ASR doc recommendation of 100-200ms per chunk.
const PROCESSOR_BUFFER_SIZE = 8192;

function arrayBufferToBase64(arrayBuffer: ArrayBufferLike) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function downsampleToPcm16(input: Float32Array, sourceRate: number, targetRate: number): Int16Array {
  if (sourceRate < targetRate) {
    throw new Error(`无法将 ${sourceRate}Hz 上采样到 ${targetRate}Hz。`);
  }

  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let index = offsetBuffer; index < nextOffsetBuffer; index += 1) {
      accum += input[index];
      count += 1;
    }
    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

export function useVoiceCapture({
  sessionId,
  inputSource,
  visionEnabled,
  sendAudioChunk,
  commitTurn,
  captureFrameForTurn,
}: VoiceCaptureOptions) {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const chunkCountRef = useRef(0);
  const recordedDurationMsRef = useRef(0);
  const stoppingRef = useRef(false);

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

  const finalizeTurn = useCallback(
    async (activeSessionId: string) => {
      const turnId = crypto.randomUUID();
      const includeVision =
        visionEnabled &&
        (await captureFrameForTurn({
          sessionId: activeSessionId,
          inputSource,
        }));

      commitTurn({
        sessionId: activeSessionId,
        turnId,
        silenceMs: AUTO_COMMIT_MS,
        includeVision,
      });
    },
    [captureFrameForTurn, commitTurn, inputSource, visionEnabled],
  );

  const stopCapture = useCallback(() => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;
    cleanupSilenceTimer();
    analyserRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    muteGainRef.current?.disconnect();
    muteGainRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCapturing(false);
    setRecordingState("transcribing", 0);

    const activeSessionId = sessionId;
    if (!activeSessionId || recordedDurationMsRef.current <= 0) {
      stoppingRef.current = false;
      return;
    }

    void finalizeTurn(activeSessionId).finally(() => {
      stoppingRef.current = false;
    });
  }, [cleanupSilenceTimer, finalizeTurn, sessionId, setRecordingState]);

  const monitorVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!processorRef.current || !streamRef.current) {
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
          channelCount: 1,
        },
        video: false,
      });

      streamRef.current = stream;
      chunkCountRef.current = 0;
      recordedDurationMsRef.current = 0;
      stoppingRef.current = false;
      setRecordedChunks(0);
      setIsCapturing(true);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      analyser.fftSize = 1024;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      processorRef.current = processor;
      muteGainRef.current = muteGain;
      analyserRef.current = analyser;

      processor.onaudioprocess = (event) => {
        if (!sessionId || stoppingRef.current) {
          return;
        }

        const channelData = event.inputBuffer.getChannelData(0);
        const pcm16 = downsampleToPcm16(channelData, audioContext.sampleRate, TARGET_SAMPLE_RATE);
        if (pcm16.byteLength === 0) {
          return;
        }

        chunkCountRef.current += 1;
        recordedDurationMsRef.current += Math.round((pcm16.length / TARGET_SAMPLE_RATE) * 1000);
        setRecordedChunks(chunkCountRef.current);

        sendAudioChunk({
          sessionId,
          chunkId: crypto.randomUUID(),
          mimeType: "audio/pcm;rate=16000",
          base64Audio: arrayBufferToBase64(pcm16.buffer),
          durationMs: recordedDurationMsRef.current,
        });
      };

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
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      muteGainRef.current?.disconnect();
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
